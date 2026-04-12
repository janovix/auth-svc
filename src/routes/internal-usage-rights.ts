/**
 * Internal Usage Rights routes for service binding access
 *
 * These endpoints mirror the public /api/usage-rights/* routes but are
 * accessible only via Cloudflare service bindings (no auth required).
 * They are mounted at /internal/usage-rights/*.
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";
import { createUsageRightsServiceFromEnv } from "../domain/usage-rights";
import type { UsageMetric } from "../domain/usage-rights/types";

type InternalBindings = { Bindings: Bindings };

const internalUsageRightsRoutes = new Hono<InternalBindings>();

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
 * GET /internal/usage-rights/check
 * Pre-action check via service binding (no auth required)
 */
internalUsageRightsRoutes.get("/check", async (c) => {
	const organizationId = c.req.query("organizationId");
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
 * POST /internal/usage-rights/meter
 * Post-action increment via service binding (no auth required)
 */
internalUsageRightsRoutes.post("/meter", async (c) => {
	const body = await c.req.json<{
		organizationId?: string;
		metric?: string;
		count?: number;
	}>();

	if (!body.organizationId) {
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
	await service.recordUsage(body.organizationId, body.metric, body.count ?? 1);

	return c.json({ success: true });
});

/**
 * POST /internal/usage-rights/gate
 * Combined gate-and-meter via service binding (no auth required)
 */
internalUsageRightsRoutes.post("/gate", async (c) => {
	const body = await c.req.json<{
		organizationId?: string;
		metric?: string;
		count?: number;
	}>();

	if (!body.organizationId) {
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
		body.organizationId,
		body.metric,
		body.count ?? 1,
	);

	if (!result.allowed) {
		return c.json(
			{
				error: result.error ?? "usage_limit_exceeded",
				code: result.code,
				upgradeRequired: result.upgradeRequired ?? true,
				metric: result.metric,
				used: result.used,
				limit: result.limit,
				remaining: 0,
				entitlementType: result.entitlementType,
				spendLimitRemaining: result.spendLimitRemaining,
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
		overageWarning: result.overageWarning,
		overageUnits: result.overageUnits,
		overageEnabled: result.overageEnabled,
		spendLimitRemaining: result.spendLimitRemaining,
	});
});

/**
 * GET /internal/usage-rights/entitlement
 * Full entitlement details via service binding (no auth required)
 */
internalUsageRightsRoutes.get("/entitlement", async (c) => {
	const organizationId = c.req.query("organizationId");
	if (!organizationId) {
		return c.json({ success: false, error: "organizationId is required" }, 400);
	}

	const service = createUsageRightsServiceFromEnv(c.env);
	const details = await service.getEntitlementDetails(organizationId);

	return c.json({ success: true, data: details });
});

export { internalUsageRightsRoutes };
