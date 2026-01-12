/**
 * Internal subscription routes for service-to-service communication
 *
 * These routes are called via Cloudflare service bindings from other services
 * (aml-svc, watchlist-svc) to check subscription status and report usage.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import type { Bindings } from "../types/bindings";
import {
	SubscriptionRepository,
	SubscriptionService,
	UsageService,
} from "../domain/subscription";
import { LicenseRepository, LicenseService } from "../domain/license";
import {
	reportUsageInputSchema,
	checkUsageInputSchema,
	checkFeatureInputSchema,
} from "../domain/subscription/schemas";

type InternalBindings = {
	Bindings: Bindings;
};

type InternalContext = Context<InternalBindings>;

const internalSubscriptionRoutes = new Hono<InternalBindings>();

/**
 * Helper to get Stripe client
 */
function getStripe(c: InternalContext): Stripe | null {
	if (!c.env.STRIPE_SECRET_KEY) {
		return null;
	}
	return new Stripe(c.env.STRIPE_SECRET_KEY);
}

/**
 * GET /internal/subscription/status
 * Get subscription status for an organization
 */
internalSubscriptionRoutes.get("/status", async (c) => {
	const organizationId = c.req.query("organizationId");
	if (!organizationId) {
		return c.json({ success: false, error: "organizationId is required" }, 400);
	}

	const stripe = getStripe(c);
	if (!stripe) {
		return c.json({ success: false, error: "Stripe not configured" }, 500);
	}

	const repository = new SubscriptionRepository(c.env.DB);
	const service = new SubscriptionService(repository, stripe);

	const status = await service.getSubscriptionStatus(organizationId);

	if (!status) {
		return c.json({
			success: true,
			data: {
				hasSubscription: false,
				isEnterprise: false,
				status: "inactive",
				planTier: "none",
				features: [],
			},
		});
	}

	return c.json({
		success: true,
		data: status,
	});
});

/**
 * POST /internal/subscription/usage/report
 * Report usage increment from other services
 */
internalSubscriptionRoutes.post("/usage/report", async (c) => {
	const body = await c.req.json();
	const parseResult = reportUsageInputSchema.safeParse(body);
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

	const stripe = getStripe(c);
	if (!stripe) {
		return c.json({ success: false, error: "Stripe not configured" }, 500);
	}

	const repository = new SubscriptionRepository(c.env.DB);
	const usageService = new UsageService(repository, stripe);

	try {
		const result = await usageService.reportUsage(
			parseResult.data.organizationId,
			parseResult.data.metric,
			parseResult.data.count,
		);

		return c.json({
			success: true,
			data: result,
		});
	} catch (error) {
		console.error("Usage report error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to report usage",
			},
			500,
		);
	}
});

/**
 * POST /internal/subscription/usage/check
 * Check if usage is allowed for a metric
 */
internalSubscriptionRoutes.post("/usage/check", async (c) => {
	const body = await c.req.json();
	const parseResult = checkUsageInputSchema.safeParse(body);
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

	const stripe = getStripe(c);
	if (!stripe) {
		return c.json({ success: false, error: "Stripe not configured" }, 500);
	}

	const repository = new SubscriptionRepository(c.env.DB);
	const subscriptionService = new SubscriptionService(repository, stripe);

	const result = await subscriptionService.checkUsage(
		parseResult.data.organizationId,
		parseResult.data.metric,
	);

	return c.json({
		success: true,
		data: result,
	});
});

/**
 * POST /internal/subscription/feature/check
 * Check if organization has access to a feature
 */
internalSubscriptionRoutes.post("/feature/check", async (c) => {
	const body = await c.req.json();
	const parseResult = checkFeatureInputSchema.safeParse(body);
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

	const stripe = getStripe(c);
	if (!stripe) {
		return c.json({ success: false, error: "Stripe not configured" }, 500);
	}

	const repository = new SubscriptionRepository(c.env.DB);
	const subscriptionService = new SubscriptionService(repository, stripe);

	const result = await subscriptionService.checkFeature(
		parseResult.data.organizationId,
		parseResult.data.feature,
	);

	return c.json({
		success: true,
		data: result,
	});
});

/**
 * GET /internal/subscription/license/verify
 * Verify an organization's enterprise license
 */
internalSubscriptionRoutes.get("/license/verify", async (c) => {
	const organizationId = c.req.query("organizationId");
	if (!organizationId) {
		return c.json({ success: false, error: "organizationId is required" }, 400);
	}

	if (!c.env.LICENSE_PRIVATE_KEY || !c.env.LICENSE_PUBLIC_KEY) {
		return c.json(
			{ success: false, error: "License keys not configured" },
			500,
		);
	}

	const stripe = getStripe(c);
	if (!stripe) {
		return c.json({ success: false, error: "Stripe not configured" }, 500);
	}

	const licenseRepository = new LicenseRepository(c.env.DB);
	const licenseService = new LicenseService(
		licenseRepository,
		stripe,
		c.env.LICENSE_PRIVATE_KEY,
		c.env.LICENSE_PUBLIC_KEY,
	);

	const result = await licenseService.verifyOrganizationLicense(organizationId);

	return c.json({
		success: true,
		data: result,
	});
});

/**
 * POST /internal/subscription/users/update
 * Update user count for an organization
 */
internalSubscriptionRoutes.post("/users/update", async (c) => {
	const body = await c.req.json<{ organizationId: string; count: number }>();
	if (!body.organizationId || typeof body.count !== "number") {
		return c.json(
			{ success: false, error: "organizationId and count are required" },
			400,
		);
	}

	const stripe = getStripe(c);
	if (!stripe) {
		return c.json({ success: false, error: "Stripe not configured" }, 500);
	}

	const repository = new SubscriptionRepository(c.env.DB);
	const usageService = new UsageService(repository, stripe);

	try {
		await usageService.updateUsersCount(body.organizationId, body.count);

		return c.json({
			success: true,
			message: "User count updated",
		});
	} catch (error) {
		console.error("User count update error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to update user count",
			},
			500,
		);
	}
});

export { internalSubscriptionRoutes };
