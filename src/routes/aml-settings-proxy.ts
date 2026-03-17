/**
 * AML Compliance Settings Proxy Routes
 *
 * These routes proxy requests to aml-svc via service binding
 * for secure access to AML compliance settings (RFC, vulnerable activity).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";

type AmlProxyBindings = {
	Bindings: Bindings;
};

type AmlProxyContext = Context<AmlProxyBindings>;

const amlSettingsProxyRoutes = new Hono<AmlProxyBindings>();

/**
 * Map AML RPC errors to HTTP status and payload.
 * Inspects error.message and error.code for not-found or validation patterns.
 */
function amlErrorToHttp(error: unknown): {
	status: ContentfulStatusCode;
	error: string;
	message: string;
} {
	const message =
		error instanceof Error ? error.message : String(error ?? "Unknown error");
	const code =
		error && typeof error === "object" && "code" in error
			? (error as { code?: string }).code
			: undefined;
	const msgLower = message.toLowerCase();

	if (code === "NOT_FOUND" || msgLower.includes("not found")) {
		return { status: 404, error: "Not found", message };
	}
	if (msgLower.includes("invalid") || msgLower.includes("validation")) {
		return { status: 400, error: "Bad request", message };
	}
	return { status: 500, error: "Internal server error", message };
}

/**
 * Helper to get authenticated user from session
 */
async function getAuthenticatedUser(
	c: AmlProxyContext,
): Promise<{ id: string; organizationId?: string } | null> {
	try {
		const { auth } = await getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) {
			return null;
		}
		return {
			id: session.user.id,
			organizationId:
				(session.session as { activeOrganizationId?: string })
					?.activeOrganizationId ?? undefined,
		};
	} catch {
		return null;
	}
}

/**
 * Helper to check if user is owner or admin of organization
 */
async function isOrgOwnerOrAdmin(
	c: AmlProxyContext,
	userId: string,
	organizationId: string,
): Promise<boolean> {
	try {
		const result = await c.env.DB.prepare(
			`SELECT role FROM members WHERE userId = ? AND organizationId = ? LIMIT 1`,
		)
			.bind(userId, organizationId)
			.first<{ role: string }>();
		return result?.role === "owner" || result?.role === "admin";
	} catch (error) {
		console.error(
			`[AmlProxy] Error checking org owner/admin for user ${userId}, org ${organizationId}:`,
			error,
		);
		return false;
	}
}

/**
 * Helper to check if user is member of organization
 * Uses Better Auth API and database for reliable membership verification
 */
async function isOrgMember(
	c: AmlProxyContext,
	userId: string,
	organizationId: string,
	activeOrgId?: string,
): Promise<boolean> {
	try {
		// Fast path: if this is the user's active organization, they're definitely a member
		if (activeOrgId === organizationId) {
			return true;
		}

		// Check database directly - this is the source of truth
		// Note: Column names are camelCase (userId, organizationId) not snake_case
		const query = c.env.DB.prepare(
			`SELECT 1 FROM members WHERE userId = ? AND organizationId = ? LIMIT 1`,
		);
		const result = await query.bind(userId, organizationId).first();

		if (result) {
			console.log(
				`[AmlProxy] User ${userId} confirmed as member of org ${organizationId}`,
			);
			return true;
		}

		// If not found, log for debugging - also try to see what orgs the user IS a member of
		try {
			const userOrgs = await c.env.DB.prepare(
				`SELECT organizationId FROM members WHERE userId = ?`,
			)
				.bind(userId)
				.all<{ organizationId: string }>();
			console.warn(
				`[AmlProxy] User ${userId} not found in members table for org ${organizationId}. User is member of: ${userOrgs.results.map((r) => r.organizationId).join(", ") || "none"}`,
			);
		} catch (debugError) {
			console.error(
				`[AmlProxy] Error checking user's organizations for debugging:`,
				debugError,
			);
		}
		return false;
	} catch (error) {
		console.error(
			`[AmlProxy] Error checking org membership for user ${userId}, org ${organizationId}:`,
			error,
		);
		// On error, if user has this as active org, trust it
		if (activeOrgId === organizationId) {
			console.warn(
				`[AmlProxy] Database check failed but user has active org ${organizationId}, allowing access`,
			);
			return true;
		}
		return false;
	}
}

/**
 * GET /api/settings/aml-compliance/:orgId
 * Get AML compliance settings for an organization
 */
amlSettingsProxyRoutes.get("/:orgId", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const orgId = c.req.param("orgId");

	// Check if user is a member of this organization
	// Pass activeOrgId for fast path check
	const isMember = await isOrgMember(c, user.id, orgId, user.organizationId);
	if (!isMember) {
		console.error(
			`[AmlProxy] User ${user.id} is not a member of organization ${orgId}. Active org: ${user.organizationId}`,
		);
		return c.json(
			{
				success: false,
				error: "Forbidden: Not a member of this organization",
				message: `User ${user.id} is not a member of organization ${orgId}`,
			},
			403,
		);
	}

	// Check if AML_SERVICE binding is available
	if (!c.env.AML_SERVICE) {
		console.error("[AmlProxy] AML_SERVICE binding not available");
		return c.json({ success: false, error: "AML service not available" }, 503);
	}

	try {
		const result = await c.env.AML_SERVICE.getOrganizationSettings(orgId);
		return c.json({ success: true, data: result.settings }, 200);
	} catch (error) {
		console.error("[AmlProxy] Error fetching AML settings:", error);
		const { status, error: errMsg, message } = amlErrorToHttp(error);
		return c.json({ success: false, error: errMsg, message }, status);
	}
});

/**
 * PUT /api/settings/aml-compliance/:orgId
 * Create or update AML compliance settings (owner/admin only)
 */
amlSettingsProxyRoutes.put("/:orgId", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const orgId = c.req.param("orgId");

	// Check if user is owner or admin of this organization
	const hasAccess = await isOrgOwnerOrAdmin(c, user.id, orgId);
	if (!hasAccess) {
		return c.json(
			{ success: false, error: "Forbidden: Owner or admin access required" },
			403,
		);
	}

	// Check if AML_SERVICE binding is available
	if (!c.env.AML_SERVICE) {
		console.error("[AmlProxy] AML_SERVICE binding not available");
		return c.json({ success: false, error: "AML service not available" }, 503);
	}

	try {
		const body = await c.req.json();
		const result = await c.env.AML_SERVICE.updateOrganizationSettings(
			orgId,
			body,
		);
		return c.json({ success: true, data: result.settings }, 200);
	} catch (error) {
		console.error("[AmlProxy] Error updating AML settings:", error);
		const { status, error: errMsg, message } = amlErrorToHttp(error);
		return c.json({ success: false, error: errMsg, message }, status);
	}
});

/**
 * PATCH /api/settings/aml-compliance/:orgId
 * Partial update AML compliance settings (owner/admin only)
 */
amlSettingsProxyRoutes.patch("/:orgId", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const orgId = c.req.param("orgId");

	// Check if user is owner or admin of this organization
	const hasAccess = await isOrgOwnerOrAdmin(c, user.id, orgId);
	if (!hasAccess) {
		return c.json(
			{ success: false, error: "Forbidden: Owner or admin access required" },
			403,
		);
	}

	// Check if AML_SERVICE binding is available
	if (!c.env.AML_SERVICE) {
		console.error("[AmlProxy] AML_SERVICE binding not available");
		return c.json({ success: false, error: "AML service not available" }, 503);
	}

	try {
		const body = await c.req.json();
		const result = await c.env.AML_SERVICE.patchOrganizationSettings(
			orgId,
			body,
		);
		return c.json({ success: true, data: result.settings }, 200);
	} catch (error) {
		console.error("[AmlProxy] Error patching AML settings:", error);
		const { status, error: errMsg, message } = amlErrorToHttp(error);
		return c.json({ success: false, error: errMsg, message }, status);
	}
});

/**
 * PATCH /api/settings/aml-compliance/:orgId/self-service
 * Partial update KYC self-service settings (owner/admin only)
 */
amlSettingsProxyRoutes.patch("/:orgId/self-service", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const orgId = c.req.param("orgId");

	// Check if user is owner or admin of this organization
	const hasAccess = await isOrgOwnerOrAdmin(c, user.id, orgId);
	if (!hasAccess) {
		return c.json(
			{ success: false, error: "Forbidden: Owner or admin access required" },
			403,
		);
	}

	// Check if AML_SERVICE binding is available
	if (!c.env.AML_SERVICE) {
		console.error("[AmlProxy] AML_SERVICE binding not available");
		return c.json({ success: false, error: "AML service not available" }, 503);
	}

	try {
		const body = await c.req.json();
		const result = await c.env.AML_SERVICE.patchSelfServiceSettings(
			orgId,
			body,
		);
		return c.json({ success: true, data: result.settings }, 200);
	} catch (error) {
		console.error(
			"[AmlProxy] Error patching KYC self-service settings:",
			error,
		);
		const { status, error: errMsg, message } = amlErrorToHttp(error);
		return c.json({ success: false, error: errMsg, message }, status);
	}
});

export { amlSettingsProxyRoutes };
