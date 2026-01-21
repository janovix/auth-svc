/**
 * Internal settings routes for service binding access
 * These endpoints are used by other services via Cloudflare service bindings
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";
import { SettingsService } from "../domain/settings";

type InternalBindings = {
	Bindings: Bindings;
};

const internalSettingsRoutes = new Hono<InternalBindings>();

/**
 * GET /internal/settings/resolved
 * Get resolved settings for a user via service binding
 *
 * This endpoint is used by other services to get user settings
 * without requiring the user to be authenticated to auth-svc directly.
 *
 * Query params:
 * - userId: Required. The user ID to get settings for
 * - orgId: Optional. The organization ID for org defaults
 * - headers: Optional. Base64-encoded JSON of browser headers for smart defaults
 */
internalSettingsRoutes.get("/resolved", async (c) => {
	const userId = c.req.query("userId");
	const orgId = c.req.query("orgId");
	const headers = c.req.query("headers");

	if (!userId) {
		return c.json({ success: false, error: "userId is required" }, 400);
	}

	const service = new SettingsService(c.env.DB);

	// Parse browser hints from encoded headers
	const browserHints = service.parseBrowserHints(headers);

	const settings = await service.resolveSettings(userId, orgId, browserHints);

	return c.json({
		success: true,
		data: settings,
	});
});

/**
 * GET /internal/settings/user/:userId
 * Get user settings directly (for internal use)
 */
internalSettingsRoutes.get("/user/:userId", async (c) => {
	const userId = c.req.param("userId");
	const service = new SettingsService(c.env.DB);
	const settings = await service.getUserSettings(userId);

	return c.json({
		success: true,
		data: settings,
	});
});

/**
 * GET /internal/settings/organization/:orgId
 * Get organization settings directly (for internal use)
 */
internalSettingsRoutes.get("/organization/:orgId", async (c) => {
	const orgId = c.req.param("orgId");
	const service = new SettingsService(c.env.DB);
	const settings = await service.getOrganizationSettings(orgId);

	return c.json({
		success: true,
		data: settings,
	});
});

export { internalSettingsRoutes };
