/**
 * Subscription routes for billing management
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
import { CustomerService } from "../domain/customer";
import {
	createCheckoutInputSchema,
	changePlanInputSchema,
} from "../domain/subscription/schemas";
import { getBetterAuthContext } from "../auth/instance";

type SubscriptionBindings = {
	Bindings: Bindings;
};

type SubscriptionContext = Context<SubscriptionBindings>;

const subscriptionRoutes = new Hono<SubscriptionBindings>();

/**
 * Helper to get authenticated user and organization from session
 */
async function getAuthenticatedUser(
	c: SubscriptionContext,
): Promise<{ id: string; organizationId: string; isOwner: boolean } | null> {
	try {
		const { auth } = getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) {
			return null;
		}

		const organizationId = (
			session.session as { activeOrganizationId?: string }
		)?.activeOrganizationId;

		if (!organizationId) {
			return null;
		}

		// Check if user is owner
		const memberResult = await c.env.DB.prepare(
			`SELECT role FROM members WHERE userId = ? AND organizationId = ? LIMIT 1`,
		)
			.bind(session.user.id, organizationId)
			.first<{ role: string }>();

		return {
			id: session.user.id,
			organizationId,
			isOwner: memberResult?.role === "owner",
		};
	} catch {
		return null;
	}
}

/**
 * Helper to get Stripe client
 */
function getStripe(c: SubscriptionContext): Stripe {
	if (!c.env.STRIPE_SECRET_KEY) {
		throw new Error("Stripe is not configured");
	}
	return new Stripe(c.env.STRIPE_SECRET_KEY);
}

/**
 * GET /api/subscription
 * Get current organization's subscription status and usage
 */
subscriptionRoutes.get("/", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const stripe = getStripe(c);
	const repository = new SubscriptionRepository(c.env.DB);
	const service = new SubscriptionService(repository, stripe);

	const status = await service.getSubscriptionStatus(user.organizationId);

	if (!status) {
		return c.json({
			success: true,
			data: {
				hasSubscription: false,
				isEnterprise: false,
				status: "inactive",
				planTier: "none",
				planName: null,
				currentPeriodStart: null,
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false,
				usage: null,
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
 * GET /api/subscription/plans
 * Get available subscription plans
 */
subscriptionRoutes.get("/plans", async (c) => {
	const stripe = getStripe(c);
	const repository = new SubscriptionRepository(c.env.DB);
	const service = new SubscriptionService(repository, stripe);

	const plans = await service.getAvailablePlans();

	return c.json({
		success: true,
		data: plans,
	});
});

/**
 * POST /api/subscription/checkout
 * Create a Stripe Checkout session for subscribing to a plan
 */
subscriptionRoutes.post("/checkout", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isOwner) {
		return c.json(
			{ success: false, error: "Only organization owners can manage billing" },
			403,
		);
	}

	const body = await c.req.json();
	const parseResult = createCheckoutInputSchema.safeParse(body);
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
	const repository = new SubscriptionRepository(c.env.DB);
	const service = new SubscriptionService(repository, stripe);

	try {
		const { sessionId, url } = await service.createCheckoutSession(
			user.organizationId,
			parseResult.data.planId,
			parseResult.data.successUrl,
			parseResult.data.cancelUrl,
		);

		return c.json({
			success: true,
			data: { sessionId, url },
		});
	} catch (error) {
		console.error("Checkout session creation error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to create checkout session",
			},
			400,
		);
	}
});

/**
 * POST /api/subscription/change
 * Change (upgrade/downgrade) the current plan
 */
subscriptionRoutes.post("/change", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isOwner) {
		return c.json(
			{ success: false, error: "Only organization owners can manage billing" },
			403,
		);
	}

	const body = await c.req.json();
	const parseResult = changePlanInputSchema.safeParse(body);
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
	const repository = new SubscriptionRepository(c.env.DB);
	const service = new SubscriptionService(repository, stripe);

	try {
		await service.changePlan(user.organizationId, parseResult.data.newPlanId);

		return c.json({
			success: true,
			message: "Plan changed successfully",
		});
	} catch (error) {
		console.error("Plan change error:", error);
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Failed to change plan",
			},
			400,
		);
	}
});

/**
 * POST /api/subscription/cancel
 * Cancel subscription at period end
 */
subscriptionRoutes.post("/cancel", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isOwner) {
		return c.json(
			{ success: false, error: "Only organization owners can manage billing" },
			403,
		);
	}

	const stripe = getStripe(c);
	const repository = new SubscriptionRepository(c.env.DB);
	const service = new SubscriptionService(repository, stripe);

	try {
		await service.cancelSubscription(user.organizationId);

		return c.json({
			success: true,
			message: "Subscription will be canceled at the end of the billing period",
		});
	} catch (error) {
		console.error("Cancel subscription error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to cancel subscription",
			},
			400,
		);
	}
});

/**
 * POST /api/subscription/reactivate
 * Reactivate a canceled subscription
 */
subscriptionRoutes.post("/reactivate", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isOwner) {
		return c.json(
			{ success: false, error: "Only organization owners can manage billing" },
			403,
		);
	}

	const stripe = getStripe(c);
	const repository = new SubscriptionRepository(c.env.DB);
	const service = new SubscriptionService(repository, stripe);

	try {
		await service.reactivateSubscription(user.organizationId);

		return c.json({
			success: true,
			message: "Subscription reactivated",
		});
	} catch (error) {
		console.error("Reactivate subscription error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to reactivate subscription",
			},
			400,
		);
	}
});

/**
 * GET /api/subscription/invoices
 * Get invoice history
 */
subscriptionRoutes.get("/invoices", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const limit = parseInt(c.req.query("limit") || "10", 10);

	const stripe = getStripe(c);
	const repository = new SubscriptionRepository(c.env.DB);
	const service = new SubscriptionService(repository, stripe);

	const invoices = await service.getInvoices(user.organizationId, limit);

	return c.json({
		success: true,
		data: invoices,
	});
});

/**
 * POST /api/subscription/portal
 * Get Stripe Customer Portal URL
 */
subscriptionRoutes.post("/portal", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isOwner) {
		return c.json(
			{
				success: false,
				error: "Only organization owners can access billing portal",
			},
			403,
		);
	}

	const body = await c.req.json<{ returnUrl: string }>();
	if (!body.returnUrl) {
		return c.json({ success: false, error: "returnUrl is required" }, 400);
	}

	const stripe = getStripe(c);
	const customerService = new CustomerService(stripe, c.env.DB);

	const session = await customerService.createPortalSession(
		user.organizationId,
		body.returnUrl,
	);

	if (!session) {
		return c.json({ success: false, error: "No billing account found" }, 404);
	}

	return c.json({
		success: true,
		data: session,
	});
});

/**
 * GET /api/subscription/usage
 * Get current usage for the billing period
 */
subscriptionRoutes.get("/usage", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const stripe = getStripe(c);
	const repository = new SubscriptionRepository(c.env.DB);
	const usageService = new UsageService(repository, stripe);

	const usage = await usageService.getCurrentUsage(user.organizationId);

	if (!usage) {
		return c.json({
			success: true,
			data: {
				notices: 0,
				alerts: 0,
				transactions: 0,
				users: 0,
			},
		});
	}

	return c.json({
		success: true,
		data: usage,
	});
});

export { subscriptionRoutes };
