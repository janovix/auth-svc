/**
 * Pricing routes - Database-driven subscription plans, prices, and limits
 *
 * Endpoints:
 * Public:
 * - GET /api/pricing/plans/public - Public plans without sensitive priceIds
 * - GET /api/pricing/limits/:planName - Limits for a specific plan
 *
 * Authenticated:
 * - GET /api/pricing/user-limits - Effective limits for current user
 *
 * Admin/Internal:
 * - GET /api/pricing/plans - All plans with prices and limits
 * - GET /api/pricing/plans/:name - Single plan details
 * - POST /api/pricing/plans - Create a new plan
 * - PATCH /api/pricing/plans/:id - Update a plan
 * - DELETE /api/pricing/plans/:id - Soft delete a plan
 * - POST /api/pricing/prices - Add a price to a plan
 * - PATCH /api/pricing/prices/:id - Update a price
 * - DELETE /api/pricing/prices/:id - Soft delete a price
 * - POST /api/pricing/sync-from-stripe - Sync all pricing from Stripe
 */
import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import type { Bindings } from "../types/bindings";
import { PricingRepository, PricingService } from "../domain/pricing";
import type { PriceType } from "../domain/pricing";
import { getBetterAuthContext } from "../auth/instance";

type PricingBindings = {
	Bindings: Bindings;
};

type PricingContext = Context<PricingBindings>;

const pricingRoutes = new Hono<PricingBindings>();

/**
 * Helper to get authenticated user from session
 */
async function getAuthenticatedUser(
	c: PricingContext,
): Promise<{ id: string; organizationId: string | null } | null> {
	try {
		const { auth } = getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) {
			return null;
		}

		const organizationId =
			(session.session as { activeOrganizationId?: string })
				?.activeOrganizationId ?? null;

		return {
			id: session.user.id,
			organizationId,
		};
	} catch {
		return null;
	}
}

/**
 * Helper to create pricing service
 */
function createPricingService(c: PricingContext): PricingService {
	const repository = new PricingRepository(c.env.DB);
	return new PricingService(repository);
}

/**
 * Helper to create pricing repository
 */
function createPricingRepository(c: PricingContext): PricingRepository {
	return new PricingRepository(c.env.DB);
}

/**
 * Helper to check if request is from admin or internal service
 */
async function isAdminOrInternal(
	c: PricingContext,
): Promise<{ authorized: boolean; userId?: string }> {
	// Check for internal token first
	const internalToken = c.req.header("X-Internal-Token");
	if (
		c.env.AUTH_INTERNAL_TOKEN &&
		internalToken === c.env.AUTH_INTERNAL_TOKEN
	) {
		return { authorized: true };
	}

	// Check for authenticated admin user
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return { authorized: false };
	}

	const userRecord = await c.env.DB.prepare(
		`SELECT role FROM users WHERE id = ?`,
	)
		.bind(user.id)
		.first<{ role: string }>();

	if (userRecord?.role !== "admin") {
		return { authorized: false, userId: user.id };
	}

	return { authorized: true, userId: user.id };
}

/**
 * Helper to get Stripe client
 */
function getStripe(c: PricingContext): Stripe | null {
	if (!c.env.STRIPE_SECRET_KEY) {
		return null;
	}
	return new Stripe(c.env.STRIPE_SECRET_KEY);
}

// ============================================================================
// PUBLIC ENDPOINTS (no auth required)
// ============================================================================

/**
 * GET /api/pricing/plans/public
 * Get all active plans with pricing info (without sensitive Stripe price IDs)
 * This is for public-facing pricing pages
 */
pricingRoutes.get("/plans/public", async (c) => {
	try {
		const service = createPricingService(c);
		const plans = await service.getPublicPlans();

		return c.json({
			success: true,
			data: plans,
		});
	} catch (error) {
		console.error("[Pricing] Error fetching public plans:", error);
		return c.json(
			{
				success: false,
				error: "Failed to fetch plans",
			},
			500,
		);
	}
});

/**
 * GET /api/pricing/plans/public/:name
 * Get public info for a single plan by name
 */
pricingRoutes.get("/plans/public/:name", async (c) => {
	const name = c.req.param("name");

	try {
		const service = createPricingService(c);
		const plan = await service.getPublicPlanByName(name);

		if (!plan) {
			return c.json(
				{
					success: false,
					error: "Plan not found",
				},
				404,
			);
		}

		return c.json({
			success: true,
			data: plan,
		});
	} catch (error) {
		console.error(`[Pricing] Error fetching public plan ${name}:`, error);
		return c.json(
			{
				success: false,
				error: "Failed to fetch plan",
			},
			500,
		);
	}
});

/**
 * GET /api/pricing/limits/:planName
 * Get limits for a specific plan (public, without needing auth)
 */
pricingRoutes.get("/limits/:planName", async (c) => {
	const planName = c.req.param("planName");

	try {
		const service = createPricingService(c);
		const limits = await service.getLimitsByPlanName(planName);

		if (!limits) {
			return c.json(
				{
					success: false,
					error: "Plan not found or no limits configured",
				},
				404,
			);
		}

		return c.json({
			success: true,
			data: limits,
		});
	} catch (error) {
		console.error(`[Pricing] Error fetching limits for ${planName}:`, error);
		return c.json(
			{
				success: false,
				error: "Failed to fetch limits",
			},
			500,
		);
	}
});

// ============================================================================
// AUTHENTICATED ENDPOINTS
// ============================================================================

/**
 * GET /api/pricing/user-limits
 * Get effective limits for the current authenticated user
 * Takes into account license overrides if applicable
 */
pricingRoutes.get("/user-limits", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	try {
		const service = createPricingService(c);

		// Get user's subscription to determine plan
		const subscriptionResult = await c.env.DB.prepare(
			`SELECT plan FROM subscription 
			 WHERE referenceId = ? 
			 AND status IN ('active', 'trialing')
			 ORDER BY createdAt DESC LIMIT 1`,
		)
			.bind(user.id)
			.first<{ plan: string }>();

		if (!subscriptionResult) {
			return c.json({
				success: true,
				data: {
					limits: null,
					source: null,
					message: "No active subscription",
				},
			});
		}

		const limits = await service.getEffectiveLimitsForUser(
			user.id,
			subscriptionResult.plan,
		);

		return c.json({
			success: true,
			data: {
				limits,
				source: limits?.source ?? null,
				planName: limits?.planName ?? subscriptionResult.plan,
			},
		});
	} catch (error) {
		console.error("[Pricing] Error fetching user limits:", error);
		return c.json(
			{
				success: false,
				error: "Failed to fetch limits",
			},
			500,
		);
	}
});

// ============================================================================
// ADMIN/INTERNAL ENDPOINTS (require authentication or internal token)
// ============================================================================

/**
 * GET /api/pricing/plans
 * Get all plans with full details including Stripe price IDs
 * This is for admin/internal use only
 */
pricingRoutes.get("/plans", async (c) => {
	// Check for internal token or authenticated user
	const internalToken = c.req.header("X-Internal-Token");
	const isInternal =
		c.env.AUTH_INTERNAL_TOKEN && internalToken === c.env.AUTH_INTERNAL_TOKEN;

	if (!isInternal) {
		const user = await getAuthenticatedUser(c);
		if (!user) {
			return c.json({ success: false, error: "Unauthorized" }, 401);
		}

		// Check if user is admin
		const userRecord = await c.env.DB.prepare(
			`SELECT role FROM users WHERE id = ?`,
		)
			.bind(user.id)
			.first<{ role: string }>();

		if (userRecord?.role !== "admin") {
			return c.json({ success: false, error: "Admin access required" }, 403);
		}
	}

	try {
		const service = createPricingService(c);
		const plans = await service.getPlansWithDetails();

		return c.json({
			success: true,
			data: plans,
		});
	} catch (error) {
		console.error("[Pricing] Error fetching plans:", error);
		return c.json(
			{
				success: false,
				error: "Failed to fetch plans",
			},
			500,
		);
	}
});

/**
 * GET /api/pricing/plans/:name
 * Get a single plan with full details by name
 */
pricingRoutes.get("/plans/:name", async (c) => {
	const name = c.req.param("name");

	// Check for internal token or authenticated user
	const internalToken = c.req.header("X-Internal-Token");
	const isInternal =
		c.env.AUTH_INTERNAL_TOKEN && internalToken === c.env.AUTH_INTERNAL_TOKEN;

	if (!isInternal) {
		const user = await getAuthenticatedUser(c);
		if (!user) {
			return c.json({ success: false, error: "Unauthorized" }, 401);
		}

		// Check if user is admin
		const userRecord = await c.env.DB.prepare(
			`SELECT role FROM users WHERE id = ?`,
		)
			.bind(user.id)
			.first<{ role: string }>();

		if (userRecord?.role !== "admin") {
			return c.json({ success: false, error: "Admin access required" }, 403);
		}
	}

	try {
		const service = createPricingService(c);
		const plan = await service.getPlanWithDetailsByName(name);

		if (!plan) {
			return c.json(
				{
					success: false,
					error: "Plan not found",
				},
				404,
			);
		}

		return c.json({
			success: true,
			data: plan,
		});
	} catch (error) {
		console.error(`[Pricing] Error fetching plan ${name}:`, error);
		return c.json(
			{
				success: false,
				error: "Failed to fetch plan",
			},
			500,
		);
	}
});

/**
 * GET /api/pricing/licenses/:key
 * Validate and get license info (internal only)
 */
pricingRoutes.get("/licenses/:key", async (c) => {
	const key = c.req.param("key");

	// Internal endpoint only
	const internalToken = c.req.header("X-Internal-Token");
	if (
		c.env.AUTH_INTERNAL_TOKEN &&
		internalToken !== c.env.AUTH_INTERNAL_TOKEN
	) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	try {
		const service = createPricingService(c);
		const validation = await service.validateLicenseKey(key);

		if (!validation.valid) {
			return c.json(
				{
					success: false,
					error: validation.error,
				},
				400,
			);
		}

		const license = validation.license!;
		const limits = await service.getEffectiveLimitsForLicense(license.id);

		return c.json({
			success: true,
			data: {
				license: {
					id: license.id,
					key: license.key,
					organizationName: license.organizationName,
					status: license.status,
					expiresAt: license.expiresAt?.toISOString() ?? null,
					activatedAt: license.activatedAt?.toISOString() ?? null,
					userId: license.userId,
				},
				limits,
			},
		});
	} catch (error) {
		console.error(`[Pricing] Error validating license ${key}:`, error);
		return c.json(
			{
				success: false,
				error: "Failed to validate license",
			},
			500,
		);
	}
});

// ============================================================================
// ADMIN ENDPOINTS - Manage Plans & Prices
// ============================================================================

/**
 * POST /api/pricing/plans
 * Create a new subscription plan
 */
pricingRoutes.post("/plans", async (c) => {
	const auth = await isAdminOrInternal(c);
	if (!auth.authorized) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	try {
		const body = await c.req.json<{
			name: string;
			displayName: string;
			description?: string;
			isActive?: boolean;
			sortOrder?: number;
			trialDays?: number;
		}>();

		if (!body.name || !body.displayName) {
			return c.json(
				{ success: false, error: "name and displayName are required" },
				400,
			);
		}

		const repository = createPricingRepository(c);
		const plan = await repository.createPlan({
			name: body.name,
			displayName: body.displayName,
			description: body.description,
			isActive: body.isActive,
			sortOrder: body.sortOrder,
			trialDays: body.trialDays,
		});

		console.log(`[Pricing] Created plan ${plan.id}: ${plan.name}`);

		return c.json({
			success: true,
			data: plan,
		});
	} catch (error) {
		console.error("[Pricing] Error creating plan:", error);
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Failed to create plan",
			},
			500,
		);
	}
});

/**
 * PATCH /api/pricing/plans/:id
 * Update a subscription plan
 */
pricingRoutes.patch("/plans/:id", async (c) => {
	const planId = c.req.param("id");

	const auth = await isAdminOrInternal(c);
	if (!auth.authorized) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	try {
		const body = await c.req.json<{
			name?: string;
			displayName?: string;
			description?: string | null;
			isActive?: boolean;
			sortOrder?: number;
			trialDays?: number;
		}>();

		const repository = createPricingRepository(c);
		const plan = await repository.updatePlan(planId, body);

		if (!plan) {
			return c.json({ success: false, error: "Plan not found" }, 404);
		}

		console.log(`[Pricing] Updated plan ${planId}`);

		return c.json({
			success: true,
			data: plan,
		});
	} catch (error) {
		console.error(`[Pricing] Error updating plan ${planId}:`, error);
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Failed to update plan",
			},
			500,
		);
	}
});

/**
 * DELETE /api/pricing/plans/:id
 * Soft delete a subscription plan (marks as inactive)
 */
pricingRoutes.delete("/plans/:id", async (c) => {
	const planId = c.req.param("id");

	const auth = await isAdminOrInternal(c);
	if (!auth.authorized) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	try {
		const repository = createPricingRepository(c);
		await repository.deletePlan(planId);

		console.log(`[Pricing] Deleted (deactivated) plan ${planId}`);

		return c.json({
			success: true,
			message: "Plan deactivated",
		});
	} catch (error) {
		console.error(`[Pricing] Error deleting plan ${planId}:`, error);
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Failed to delete plan",
			},
			500,
		);
	}
});

/**
 * POST /api/pricing/prices
 * Add a price to a plan
 */
pricingRoutes.post("/prices", async (c) => {
	const auth = await isAdminOrInternal(c);
	if (!auth.authorized) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	try {
		const body = await c.req.json<{
			planId: string;
			stripePriceId: string;
			priceType: PriceType;
			amount: number;
			currency?: string;
			interval?: string;
			intervalCount?: number;
			description?: string;
		}>();

		if (!body.planId || !body.stripePriceId || !body.priceType) {
			return c.json(
				{
					success: false,
					error: "planId, stripePriceId, and priceType are required",
				},
				400,
			);
		}

		const repository = createPricingRepository(c);
		const price = await repository.createPrice({
			planId: body.planId,
			stripePriceId: body.stripePriceId,
			priceType: body.priceType,
			amount: body.amount || 0,
			currency: body.currency,
			interval: body.interval,
			intervalCount: body.intervalCount,
			description: body.description,
		});

		console.log(
			`[Pricing] Created price ${price.id} for plan ${body.planId}: ${body.stripePriceId}`,
		);

		return c.json({
			success: true,
			data: price,
		});
	} catch (error) {
		console.error("[Pricing] Error creating price:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to create price",
			},
			500,
		);
	}
});

/**
 * PATCH /api/pricing/prices/:id
 * Update a price
 */
pricingRoutes.patch("/prices/:id", async (c) => {
	const priceId = c.req.param("id");

	const auth = await isAdminOrInternal(c);
	if (!auth.authorized) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	try {
		const body = await c.req.json<{
			stripePriceId?: string;
			priceType?: string;
			amount?: number;
			currency?: string;
			interval?: string | null;
			intervalCount?: number | null;
			description?: string | null;
			isActive?: boolean;
		}>();

		const repository = createPricingRepository(c);
		const price = await repository.updatePrice(priceId, body);

		if (!price) {
			return c.json({ success: false, error: "Price not found" }, 404);
		}

		console.log(`[Pricing] Updated price ${priceId}`);

		return c.json({
			success: true,
			data: price,
		});
	} catch (error) {
		console.error(`[Pricing] Error updating price ${priceId}:`, error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to update price",
			},
			500,
		);
	}
});

/**
 * DELETE /api/pricing/prices/:id
 * Soft delete a price (marks as inactive)
 */
pricingRoutes.delete("/prices/:id", async (c) => {
	const priceId = c.req.param("id");

	const auth = await isAdminOrInternal(c);
	if (!auth.authorized) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	try {
		const repository = createPricingRepository(c);
		await repository.deletePrice(priceId);

		console.log(`[Pricing] Deleted (deactivated) price ${priceId}`);

		return c.json({
			success: true,
			message: "Price deactivated",
		});
	} catch (error) {
		console.error(`[Pricing] Error deleting price ${priceId}:`, error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to delete price",
			},
			500,
		);
	}
});

/**
 * PATCH /api/pricing/limits/:planId
 * Update plan limits
 */
pricingRoutes.patch("/limits/:planId", async (c) => {
	const planId = c.req.param("planId");

	const auth = await isAdminOrInternal(c);
	if (!auth.authorized) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	try {
		const body = await c.req.json<{
			maxOrganizations?: number;
			usersPerOrg?: number;
			reportsPerMonth?: number;
			noticesPerMonth?: number;
			alertsPerMonth?: number;
			transactionsPerMonth?: number;
			clientsPerMonth?: number;
		}>();

		const repository = createPricingRepository(c);

		// Use upsert to create or update limits
		const limits = await repository.upsertLimits({
			planId,
			...body,
		});

		console.log(`[Pricing] Updated limits for plan ${planId}`);

		return c.json({
			success: true,
			data: limits,
		});
	} catch (error) {
		console.error(`[Pricing] Error updating limits for plan ${planId}:`, error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to update limits",
			},
			500,
		);
	}
});

// ============================================================================
// STRIPE SYNC ENDPOINT - Pull pricing data from Stripe
// ============================================================================

/**
 * POST /api/pricing/sync-from-stripe
 * Sync all pricing data from Stripe
 * Requires products to have plan_id or plan_name in metadata
 */
pricingRoutes.post("/sync-from-stripe", async (c) => {
	const auth = await isAdminOrInternal(c);
	if (!auth.authorized) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const stripe = getStripe(c);
	if (!stripe) {
		return c.json({ success: false, error: "Stripe not configured" }, 500);
	}

	try {
		const repository = createPricingRepository(c);
		const results = {
			products: { synced: 0, skipped: 0 },
			prices: { created: 0, updated: 0, skipped: 0 },
		};

		// Fetch all active products from Stripe
		const products = await stripe.products.list({ active: true, limit: 100 });

		for (const product of products.data) {
			const planId = product.metadata?.plan_id;
			const planName = product.metadata?.plan_name;

			if (!planId && !planName) {
				console.log(
					`[Stripe Sync] Skipping product ${product.id}: no plan_id or plan_name in metadata`,
				);
				results.products.skipped++;
				continue;
			}

			// Find or resolve the plan ID
			let resolvedPlanId: string | undefined = planId;
			if (!resolvedPlanId && planName) {
				const plan = await repository.getPlanByName(planName);
				resolvedPlanId = plan?.id;
			}

			if (!resolvedPlanId) {
				console.log(
					`[Stripe Sync] Skipping product ${product.id}: plan not found (planName: ${planName})`,
				);
				results.products.skipped++;
				continue;
			}

			// Update plan from product
			await repository.updatePlan(resolvedPlanId, {
				displayName: product.name,
				description: product.description || null,
				isActive: product.active,
			});

			console.log(
				`[Stripe Sync] Synced product ${product.id} -> plan ${resolvedPlanId}`,
			);
			results.products.synced++;

			// Fetch prices for this product
			const prices = await stripe.prices.list({
				product: product.id,
				limit: 100,
			});

			for (const price of prices.data) {
				const priceType =
					(price.metadata?.price_type as PriceType) || "subscription";
				const description = price.nickname || price.metadata?.description;

				// Check if price exists
				const existingPrice = await repository.getPriceByStripePriceId(
					price.id,
				);

				if (existingPrice) {
					// Update existing
					await repository.updatePrice(existingPrice.id, {
						amount: price.unit_amount || 0,
						currency: price.currency.toUpperCase(),
						interval: price.recurring?.interval || null,
						intervalCount: price.recurring?.interval_count || null,
						description: description || null,
						isActive: price.active,
						priceType,
					});
					results.prices.updated++;
				} else {
					// Create new
					await repository.createPrice({
						planId: resolvedPlanId,
						stripePriceId: price.id,
						priceType,
						amount: price.unit_amount || 0,
						currency: price.currency.toUpperCase(),
						interval: price.recurring?.interval,
						intervalCount: price.recurring?.interval_count,
						description: description,
					});
					results.prices.created++;
				}
			}
		}

		console.log(`[Stripe Sync] Complete:`, results);

		return c.json({
			success: true,
			data: results,
			message: `Synced ${results.products.synced} products, ${results.prices.created} new prices, ${results.prices.updated} updated prices`,
		});
	} catch (error) {
		console.error("[Pricing] Error syncing from Stripe:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to sync from Stripe",
			},
			500,
		);
	}
});

export { pricingRoutes };
