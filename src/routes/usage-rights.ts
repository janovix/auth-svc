/**
 * Usage Rights public routes (session auth required)
 *
 * These endpoints provide usage rights checks and metering for authenticated users.
 * The entitlement is always resolved from the active organization's OWNER.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { createUsageRightsServiceFromEnv } from "../domain/usage-rights";
import { getBetterAuthContext } from "../auth/instance";
import type { UsageMetric } from "../domain/usage-rights/types";

type UsageRightsBindings = { Bindings: Bindings };

const usageRightsRoutes = new Hono<UsageRightsBindings>();

/**
 * Helper to get authenticated user and their active org
 */
async function getAuthSession(c: Context<UsageRightsBindings>) {
	try {
		const { auth } = await getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) return null;

		const organizationId =
			(session.session as { activeOrganizationId?: string })
				?.activeOrganizationId ?? null;

		return { userId: session.user.id, organizationId };
	} catch {
		return null;
	}
}

const VALID_METRICS: UsageMetric[] = [
	"reports",
	"notices",
	"alerts",
	"operations",
	"clients",
	"users",
	"watchlistQueries",
	"organizations",
];

function isValidMetric(metric: string): metric is UsageMetric {
	return VALID_METRICS.includes(metric as UsageMetric);
}

/**
 * GET /api/usage-rights/check
 * Pre-action check: can the active org perform this metric?
 */
usageRightsRoutes.get("/check", async (c) => {
	const session = await getAuthSession(c);
	if (!session) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const organizationId =
		c.req.query("organizationId") ?? session.organizationId;
	const metric = c.req.query("metric");

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId is required" }, 400);
	}
	if (!metric || !isValidMetric(metric)) {
		return c.json(
			{
				success: false,
				error: `metric is required and must be one of: ${VALID_METRICS.join(", ")}`,
			},
			400,
		);
	}

	const service = createUsageRightsServiceFromEnv(c.env);
	const result = await service.checkRight(organizationId, metric);

	if (!result.allowed) {
		return c.json(
			{
				error: "usage_limit_exceeded",
				upgradeRequired: true,
				metric: result.metric,
				used: result.used,
				limit: result.limit,
				remaining: 0,
				entitlementType: result.entitlementType,
			},
			403,
		);
	}

	return c.json({
		allowed: true,
		metric: result.metric,
		used: result.used,
		limit: result.limit,
		remaining: result.remaining,
		entitlementType: result.entitlementType,
	});
});

/**
 * POST /api/usage-rights/meter
 * Post-action: increment the usage meter
 */
usageRightsRoutes.post("/meter", async (c) => {
	const session = await getAuthSession(c);
	if (!session) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const body = await c.req.json<{
		organizationId?: string;
		metric?: string;
		count?: number;
	}>();

	const organizationId = body.organizationId ?? session.organizationId;
	if (!organizationId) {
		return c.json({ success: false, error: "organizationId is required" }, 400);
	}
	if (!body.metric || !isValidMetric(body.metric)) {
		return c.json(
			{
				success: false,
				error: `metric is required and must be one of: ${VALID_METRICS.join(", ")}`,
			},
			400,
		);
	}

	const service = createUsageRightsServiceFromEnv(c.env);
	await service.recordUsage(organizationId, body.metric, body.count ?? 1);

	return c.json({ success: true });
});

/**
 * POST /api/usage-rights/gate
 * Combined gate-and-meter: check if allowed, increment if so
 */
usageRightsRoutes.post("/gate", async (c) => {
	const session = await getAuthSession(c);
	if (!session) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const body = await c.req.json<{
		organizationId?: string;
		metric?: string;
		count?: number;
	}>();

	const organizationId = body.organizationId ?? session.organizationId;
	if (!organizationId) {
		return c.json({ success: false, error: "organizationId is required" }, 400);
	}
	if (!body.metric || !isValidMetric(body.metric)) {
		return c.json(
			{
				success: false,
				error: `metric is required and must be one of: ${VALID_METRICS.join(", ")}`,
			},
			400,
		);
	}

	const service = createUsageRightsServiceFromEnv(c.env);
	const result = await service.gateAndMeter(
		organizationId,
		body.metric,
		body.count ?? 1,
	);

	if (!result.allowed) {
		return c.json(
			{
				error: result.error ?? "usage_limit_exceeded",
				upgradeRequired: true,
				metric: result.metric,
				used: result.used,
				limit: result.limit,
				remaining: 0,
				entitlementType: result.entitlementType,
			},
			403,
		);
	}

	return c.json({
		allowed: true,
		metric: result.metric,
		used: result.used,
		limit: result.limit,
		remaining: result.remaining,
		entitlementType: result.entitlementType,
	});
});

/**
 * GET /api/usage-rights/entitlement
 * Full entitlement details for an org
 */
usageRightsRoutes.get("/entitlement", async (c) => {
	const session = await getAuthSession(c);
	if (!session) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const organizationId =
		c.req.query("organizationId") ?? session.organizationId;
	if (!organizationId) {
		return c.json({ success: false, error: "organizationId is required" }, 400);
	}

	const service = createUsageRightsServiceFromEnv(c.env);
	const details = await service.getEntitlementDetails(organizationId);

	return c.json({ success: true, data: details });
});

export { usageRightsRoutes };
