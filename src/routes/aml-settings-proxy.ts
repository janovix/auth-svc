/**
 * AML Compliance Settings Proxy Routes
 *
 * These routes proxy requests to aml-svc via service binding
 * for secure access to AML compliance settings (RFC, vulnerable activity).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";

type AmlProxyBindings = {
	Bindings: Bindings;
};

type AmlProxyContext = Context<AmlProxyBindings>;

const amlSettingsProxyRoutes = new Hono<AmlProxyBindings>();

/**
 * Helper to get authenticated user from session
 */
async function getAuthenticatedUser(
	c: AmlProxyContext,
): Promise<{ id: string; organizationId?: string } | null> {
	try {
		const { auth } = getBetterAuthContext(c.env);
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
		const response = await c.env.AML_SERVICE.fetch(
			new Request(`https://aml-svc.internal/organization-settings/${orgId}`, {
				method: "GET",
				headers: {
					Accept: "application/json",
				},
			}),
		);

		// Handle 404 - organization settings not found (this is expected for new orgs)
		if (response.status === 404) {
			return c.json({ success: true, data: null }, 404);
		}

		// Handle other error statuses
		if (!response.ok) {
			const errorResult = (await response.json().catch(() => ({
				success: false,
				error: "Unknown error",
				message: undefined,
			}))) as {
				success?: boolean;
				error?: string;
				message?: string;
			};
			const statusCode = (response.status as 400 | 500) || 500;
			return c.json(
				{
					success: false,
					error: errorResult.error || "Failed to fetch AML compliance settings",
					message: errorResult.message,
				},
				statusCode,
			);
		}

		// Success response - pass through the data
		const result = await response.json();
		return c.json(result, 200);
	} catch (error) {
		console.error("[AmlProxy] Error fetching AML settings:", error);
		return c.json(
			{
				success: false,
				error: "Failed to fetch AML compliance settings",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
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

		const response = await c.env.AML_SERVICE.fetch(
			new Request(`https://aml-svc.internal/organization-settings/${orgId}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify(body),
			}),
		);

		// Handle error responses
		if (!response.ok) {
			const errorResult = (await response.json().catch(() => ({
				success: false,
				error: "Unknown error",
				message: undefined,
				details: undefined,
			}))) as {
				success?: boolean;
				error?: string;
				message?: string;
				details?: unknown;
			};
			const statusCode = (response.status as 400 | 500) || 500;
			return c.json(
				{
					success: false,
					error:
						errorResult.error || "Failed to update AML compliance settings",
					message: errorResult.message || (errorResult.details as string),
				},
				statusCode,
			);
		}

		// Success response - pass through the data
		const result = await response.json();
		return c.json(result, 200);
	} catch (error) {
		console.error("[AmlProxy] Error updating AML settings:", error);
		return c.json(
			{
				success: false,
				error: "Failed to update AML compliance settings",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
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

		const response = await c.env.AML_SERVICE.fetch(
			new Request(`https://aml-svc.internal/organization-settings/${orgId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify(body),
			}),
		);

		// Handle error responses
		if (!response.ok) {
			const errorResult = (await response.json().catch(() => ({
				success: false,
				error: "Unknown error",
				message: undefined,
				details: undefined,
			}))) as {
				success?: boolean;
				error?: string;
				message?: string;
				details?: unknown;
			};
			const statusCode = (response.status as 400 | 500) || 500;
			return c.json(
				{
					success: false,
					error:
						errorResult.error || "Failed to update AML compliance settings",
					message: errorResult.message || (errorResult.details as string),
				},
				statusCode,
			);
		}

		// Success response - pass through the data
		const result = await response.json();
		return c.json(result, 200);
	} catch (error) {
		console.error("[AmlProxy] Error patching AML settings:", error);
		return c.json(
			{
				success: false,
				error: "Failed to update AML compliance settings",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
});

export { amlSettingsProxyRoutes };
