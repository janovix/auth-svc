/**
 * Settings routes for user and organization preferences
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { SettingsService } from "../domain/settings";
import {
	updateUserSettingsSchema,
	updateOrganizationSettingsSchema,
} from "../domain/settings/schemas";
import { getBetterAuthContext } from "../auth/instance";

type SettingsBindings = {
	Bindings: Bindings;
};

type SettingsContext = Context<SettingsBindings>;

const settingsRoutes = new Hono<SettingsBindings>();

/**
 * Helper to get authenticated user from session
 */
async function getAuthenticatedUser(
	c: SettingsContext,
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
 * Helper to check if user is owner of organization (only owners can edit org settings)
 */
async function isOrgOwner(
	c: SettingsContext,
	userId: string,
	organizationId: string,
): Promise<boolean> {
	try {
		const result = await c.env.DB.prepare(
			`SELECT role FROM members WHERE userId = ? AND organizationId = ? LIMIT 1`,
		)
			.bind(userId, organizationId)
			.first<{ role: string }>();
		return result?.role === "owner";
	} catch (error) {
		console.error(
			`[Settings] Error checking org owner for user ${userId}, org ${organizationId}:`,
			error,
		);
		return false;
	}
}

/**
 * Helper to get user's membership in organization
 */
async function getUserOrgMembership(
	c: SettingsContext,
	userId: string,
	organizationId: string,
): Promise<{ role: string; organizationId: string } | null> {
	try {
		const result = await c.env.DB.prepare(
			`SELECT role FROM members WHERE userId = ? AND organizationId = ? LIMIT 1`,
		)
			.bind(userId, organizationId)
			.first<{ role: string }>();
		if (!result) return null;
		return { role: result.role, organizationId };
	} catch (error) {
		console.error(
			`[Settings] Error getting org membership for user ${userId}, org ${organizationId}:`,
			error,
		);
		return null;
	}
}

/**
 * GET /api/settings/user
 * Get current user's settings
 */
settingsRoutes.get("/user", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const service = new SettingsService(c.env.DB);
	const settings = await service.getUserSettings(user.id);

	return c.json({
		success: true,
		data: settings,
	});
});

/**
 * PATCH /api/settings/user
 * Update current user's settings
 */
settingsRoutes.patch("/user", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const body = await c.req.json();
	const parseResult = updateUserSettingsSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json(
			{
				success: false,
				error: "Invalid input",
				details: parseResult.error.errors,
			},
			400,
		);
	}

	const service = new SettingsService(c.env.DB);
	const settings = await service.updateUserSettings(user.id, parseResult.data);

	return c.json({
		success: true,
		data: settings,
	});
});

/**
 * GET /api/settings/organization/:orgId
 * Get organization default settings
 */
settingsRoutes.get("/organization/:orgId", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const orgId = c.req.param("orgId");
	const service = new SettingsService(c.env.DB);
	const settings = await service.getOrganizationSettings(orgId);

	if (!settings) {
		return c.json({
			success: true,
			data: null,
		});
	}

	return c.json({
		success: true,
		data: settings,
	});
});

/**
 * GET /api/settings/organization/:orgId/membership
 * Get user's membership/role in organization
 */
settingsRoutes.get("/organization/:orgId/membership", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const orgId = c.req.param("orgId");
	const membership = await getUserOrgMembership(c, user.id, orgId);

	return c.json({
		success: true,
		data: membership,
	});
});

/**
 * PATCH /api/settings/organization/:orgId
 * Update organization settings (owner only)
 */
settingsRoutes.patch("/organization/:orgId", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const orgId = c.req.param("orgId");

	// Check if user is owner of this org (only owners can edit org settings)
	const ownerCheck = await isOrgOwner(c, user.id, orgId);
	if (!ownerCheck) {
		return c.json(
			{ success: false, error: "Forbidden: Owner access required" },
			403,
		);
	}

	const body = await c.req.json();
	const parseResult = updateOrganizationSettingsSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json(
			{
				success: false,
				error: "Invalid input",
				details: parseResult.error.errors,
			},
			400,
		);
	}

	const service = new SettingsService(c.env.DB);
	const settings = await service.updateOrganizationSettings(
		orgId,
		parseResult.data,
	);

	return c.json({
		success: true,
		data: settings,
	});
});

/**
 * GET /api/settings/resolved
 * Get merged settings (org defaults + user overrides + browser hints)
 */
settingsRoutes.get("/resolved", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const headersParam = c.req.query("headers");
	const service = new SettingsService(c.env.DB);

	// Parse browser hints from encoded headers
	const browserHints = service.parseBrowserHints(headersParam);

	const settings = await service.resolveSettings(
		user.id,
		user.organizationId,
		browserHints,
	);

	return c.json({
		success: true,
		data: settings,
	});
});

export { settingsRoutes };
