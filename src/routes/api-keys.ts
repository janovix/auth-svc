/**
 * API Keys routes for dashboard SPA (session-authenticated)
 *
 * Mounted at /api/api-keys in app.ts
 * Provides CRUD operations for organization-scoped API keys.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { ApiKeyService, ApiKeyRepository } from "../domain/api-keys";
import { getBetterAuthContext } from "../auth/instance";

type ApiKeysBindings = { Bindings: Bindings };
type ApiKeysContext = Context<ApiKeysBindings>;

const apiKeysRoutes = new Hono<ApiKeysBindings>();

/**
 * Helper to get authenticated user with active organization
 */
async function getAuthenticatedUser(c: ApiKeysContext): Promise<{
	id: string;
	email: string;
	name: string | null;
	role: string;
	organizationId: string | null;
} | null> {
	try {
		const { auth } = await getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) return null;

		const activeOrgId =
			(session.session as { activeOrganizationId?: string })
				?.activeOrganizationId ?? null;

		return {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name ?? null,
			role: (session.user as { role?: string }).role ?? "user",
			organizationId: activeOrgId,
		};
	} catch {
		return null;
	}
}

/**
 * Check if user is owner or admin of the organization
 */
async function isOrgOwnerOrAdmin(
	db: D1Database,
	userId: string,
	organizationId: string,
): Promise<boolean> {
	const result = await db
		.prepare(
			`SELECT role FROM members WHERE userId = ? AND organizationId = ? LIMIT 1`,
		)
		.bind(userId, organizationId)
		.first<{ role: string }>();
	return result?.role === "owner" || result?.role === "admin";
}

/**
 * Get the subscription plan for the owner of the organization
 */
async function getOrgOwnerSubscriptionPlan(
	db: D1Database,
	organizationId: string,
): Promise<string | null> {
	// Find the owner of this organization
	const owner = await db
		.prepare(
			`SELECT userId FROM members WHERE organizationId = ? AND role = 'owner' LIMIT 1`,
		)
		.bind(organizationId)
		.first<{ userId: string }>();

	if (!owner) return null;

	// Get the owner's subscription plan
	const subscription = await db
		.prepare(
			`SELECT plan, status FROM subscription
			 WHERE referenceId = ?
			   AND status IN ('active', 'trialing')
			 ORDER BY
			   CASE WHEN stripeSubscriptionId IS NOT NULL THEN 0 ELSE 1 END,
			   createdAt DESC
			 LIMIT 1`,
		)
		.bind(owner.userId)
		.first<{ plan: string; status: string }>();

	return subscription?.plan ?? null;
}

/**
 * GET /api/api-keys
 * List API keys for the active organization
 */
apiKeysRoutes.get("/", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}
	if (!user.organizationId) {
		return c.json({ success: false, error: "No active organization" }, 409);
	}

	const service = new ApiKeyService(new ApiKeyRepository(c.env.DB));
	const keys = await service.listByOrganization(user.organizationId);

	return c.json({ success: true, data: keys });
});

/**
 * POST /api/api-keys
 * Create a new API key for the active organization
 */
apiKeysRoutes.post("/", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}
	if (!user.organizationId) {
		return c.json({ success: false, error: "No active organization" }, 409);
	}

	// Check user is owner or admin
	const canManage = await isOrgOwnerOrAdmin(
		c.env.DB,
		user.id,
		user.organizationId,
	);
	if (!canManage) {
		return c.json(
			{ success: false, error: "Forbidden: Owner or admin access required" },
			403,
		);
	}

	// Check subscription plan eligibility
	const plan = await getOrgOwnerSubscriptionPlan(c.env.DB, user.organizationId);
	if (!ApiKeyService.isPlanEligible(plan)) {
		return c.json(
			{
				success: false,
				error:
					"API access requires a Business, Pro, Ultra, or Enterprise License plan",
			},
			403,
		);
	}

	const body = await c.req.json<{ name?: string }>();
	if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
		return c.json({ success: false, error: "A key name is required" }, 400);
	}

	const service = new ApiKeyService(new ApiKeyRepository(c.env.DB));
	const result = await service.create({
		name: body.name.trim(),
		organizationId: user.organizationId,
		createdById: user.id,
	});

	return c.json(
		{
			success: true,
			data: { apiKey: result.apiKey, plainKey: result.plainKey },
		},
		201,
	);
});

/**
 * POST /api/api-keys/:id/rotate
 * Rotate an API key (revoke old, create new)
 */
apiKeysRoutes.post("/:id/rotate", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}
	if (!user.organizationId) {
		return c.json({ success: false, error: "No active organization" }, 409);
	}

	const canManage = await isOrgOwnerOrAdmin(
		c.env.DB,
		user.id,
		user.organizationId,
	);
	if (!canManage) {
		return c.json(
			{ success: false, error: "Forbidden: Owner or admin access required" },
			403,
		);
	}

	const id = c.req.param("id");
	const service = new ApiKeyService(new ApiKeyRepository(c.env.DB));
	const result = await service.rotate(id, user.organizationId, user.id);

	if (!result) {
		return c.json(
			{ success: false, error: "API key not found or already revoked" },
			404,
		);
	}

	return c.json({
		success: true,
		data: { apiKey: result.apiKey, plainKey: result.plainKey },
	});
});

/**
 * DELETE /api/api-keys/:id
 * Revoke an API key (soft delete)
 */
apiKeysRoutes.delete("/:id", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}
	if (!user.organizationId) {
		return c.json({ success: false, error: "No active organization" }, 409);
	}

	const canManage = await isOrgOwnerOrAdmin(
		c.env.DB,
		user.id,
		user.organizationId,
	);
	if (!canManage) {
		return c.json(
			{ success: false, error: "Forbidden: Owner or admin access required" },
			403,
		);
	}

	const id = c.req.param("id");
	const service = new ApiKeyService(new ApiKeyRepository(c.env.DB));
	const revoked = await service.revoke(id, user.organizationId);

	if (!revoked) {
		return c.json({ success: false, error: "API key not found" }, 404);
	}

	return c.json({ success: true, data: revoked });
});

export { apiKeysRoutes };
