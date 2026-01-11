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
			`SELECT role FROM members WHERE user_id = ? AND organization_id = ? LIMIT 1`,
		)
			.bind(userId, organizationId)
			.first<{ role: string }>();
		return result?.role === "owner" || result?.role === "admin";
	} catch {
		return false;
	}
}

/**
 * Helper to check if user is member of organization
 */
async function isOrgMember(
	c: AmlProxyContext,
	userId: string,
	organizationId: string,
): Promise<boolean> {
	try {
		const result = await c.env.DB.prepare(
			`SELECT 1 FROM members WHERE user_id = ? AND organization_id = ? LIMIT 1`,
		)
			.bind(userId, organizationId)
			.first();
		return !!result;
	} catch {
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
	const isMember = await isOrgMember(c, user.id, orgId);
	if (!isMember) {
		return c.json(
			{ success: false, error: "Forbidden: Not a member of this organization" },
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

		const result = await response.json();
		return c.json(result, response.status as 200 | 404 | 500);
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

		const result = await response.json();
		return c.json(result, response.status as 200 | 400 | 500);
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

		const result = await response.json();
		return c.json(result, response.status as 200 | 400 | 404 | 500);
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
