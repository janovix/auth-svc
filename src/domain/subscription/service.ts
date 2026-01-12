/**
 * Subscription Service
 *
 * Business logic for subscription management
 */

import type Stripe from "stripe";
import { SubscriptionRepository } from "./repository";
import {
	PLAN_FEATURES,
	PLAN_LIMITS,
	getRequiredTierForFeature,
} from "./features";
import type {
	SubscriptionPlan,
	OrganizationSubscription,
	SubscriptionStatusResponse,
	UsageCheckResult,
	FeatureCheckResult,
	PlanComparison,
	Invoice,
	Feature,
	PlanTier,
	UsageMetric,
} from "./types";

export class SubscriptionService {
	constructor(
		private readonly repository: SubscriptionRepository,
		private readonly stripe: Stripe,
	) {}

	// =========================================================================
	// PLANS
	// =========================================================================

	/**
	 * Get all available plans for display
	 */
	async getAvailablePlans(): Promise<PlanComparison[]> {
		const plans = await this.repository.getActivePlans();

		return plans
			.filter((p) => p.tier !== "enterprise") // Enterprise is custom
			.map((plan) => ({
				id: plan.id,
				name: plan.name,
				tier: plan.tier,
				monthlyPrice: plan.basePrice,
				noticesIncluded: plan.noticesIncluded,
				usersIncluded: plan.usersIncluded,
				overagePrice: plan.overagePrice,
				features: plan.features,
				recommended: plan.tier === "pro",
			}));
	}

	/**
	 * Get plan by ID
	 */
	async getPlan(planId: string): Promise<SubscriptionPlan | null> {
		return this.repository.getPlanById(planId);
	}

	// =========================================================================
	// SUBSCRIPTION STATUS
	// =========================================================================

	/**
	 * Get full subscription status for an organization
	 */
	async getSubscriptionStatus(
		organizationId: string,
	): Promise<SubscriptionStatusResponse | null> {
		const subscription =
			await this.repository.getByOrganizationId(organizationId);

		if (!subscription) {
			return null;
		}

		const plan = subscription.plan;
		const isEnterprise = !!subscription.licenseId;

		// Determine plan tier:
		// - Enterprise license takes precedence
		// - If has paid plan, use that tier
		// - If has Stripe customer but no paid plan, use "free" tier
		// - Otherwise "none" (shouldn't happen with auto-customer creation)
		const planTier: PlanTier = isEnterprise
			? "enterprise"
			: plan?.tier || (subscription.stripeCustomerId ? "free" : "none");

		// Get features based on plan or enterprise license
		const features = PLAN_FEATURES[planTier];

		// Calculate usage
		const limits = this.getPlanLimits(subscription);

		// hasSubscription is true if user has paid plan OR is on free tier
		// This allows free tier users to access the app with limited features
		const hasActiveAccess =
			subscription.status === "active" ||
			subscription.status === "trialing" ||
			planTier === "free"; // Free tier always has access

		return {
			hasSubscription: hasActiveAccess,
			isEnterprise,
			status: subscription.status,
			planTier,
			planName:
				plan?.name ||
				(isEnterprise ? "Enterprise" : planTier === "free" ? "Free" : null),
			currentPeriodStart:
				subscription.currentPeriodStart?.toISOString() || null,
			currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() || null,
			cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
			usage: {
				notices: this.calculateUsage(
					subscription.noticesUsed,
					limits.notices,
					planTier,
				),
				users: this.calculateUsage(
					subscription.usersCount,
					limits.users,
					planTier,
				),
				alerts:
					limits.alerts !== null
						? this.calculateUsage(
								subscription.alertsUsed,
								limits.alerts,
								planTier,
							)
						: undefined,
				transactions:
					limits.transactions !== null
						? this.calculateUsage(
								subscription.transactionsUsed,
								limits.transactions,
								planTier,
							)
						: undefined,
			},
			features,
			stripeCustomerId: subscription.stripeCustomerId,
		};
	}

	// =========================================================================
	// CHECKOUT & SUBSCRIPTION MANAGEMENT
	// =========================================================================

	/**
	 * Create a Stripe Checkout session for subscribing to a plan
	 */
	async createCheckoutSession(
		organizationId: string,
		planId: string,
		successUrl: string,
		cancelUrl: string,
	): Promise<{ sessionId: string; url: string }> {
		const subscription =
			await this.repository.getByOrganizationId(organizationId);
		if (!subscription) {
			throw new Error("Organization subscription record not found");
		}

		const plan = await this.repository.getPlanById(planId);
		if (!plan) {
			throw new Error("Plan not found");
		}

		// Build line items
		const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
			{
				price: plan.stripePriceId,
				quantity: 1,
			},
		];

		// Add overage price if exists (metered)
		if (plan.overagePriceId) {
			lineItems.push({
				price: plan.overagePriceId,
			});
		}

		const session = await this.stripe.checkout.sessions.create({
			customer: subscription.stripeCustomerId,
			mode: "subscription",
			line_items: lineItems,
			success_url: successUrl,
			cancel_url: cancelUrl,
			// Enable Stripe Link for accelerated checkout (remembers payment methods)
			// Also enable cards for fallback
			payment_method_types: ["card", "link"],
			// Allow promotion codes for discounts
			allow_promotion_codes: true,
			// Collect billing address for invoicing
			billing_address_collection: "required",
			subscription_data: {
				metadata: {
					organizationId,
					planId,
				},
			},
		});

		return {
			sessionId: session.id,
			url: session.url!,
		};
	}

	/**
	 * Change subscription plan (upgrade/downgrade)
	 */
	async changePlan(organizationId: string, newPlanId: string): Promise<void> {
		const subscription =
			await this.repository.getByOrganizationId(organizationId);
		if (!subscription || !subscription.stripeSubscriptionId) {
			throw new Error("No active subscription found");
		}

		const newPlan = await this.repository.getPlanById(newPlanId);
		if (!newPlan) {
			throw new Error("Plan not found");
		}

		// Get the current subscription from Stripe
		const stripeSubscription = await this.stripe.subscriptions.retrieve(
			subscription.stripeSubscriptionId,
		);

		// Find the main subscription item (not metered)
		const mainItem = stripeSubscription.items.data.find(
			(item: Stripe.SubscriptionItem) =>
				item.price.recurring?.usage_type !== "metered",
		);

		if (!mainItem) {
			throw new Error("No main subscription item found");
		}

		// Update the subscription
		await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
			items: [
				{
					id: mainItem.id,
					price: newPlan.stripePriceId,
				},
			],
			proration_behavior: "create_prorations",
			metadata: {
				planId: newPlanId,
			},
		});
	}

	/**
	 * Cancel subscription at period end
	 */
	async cancelSubscription(organizationId: string): Promise<void> {
		const subscription =
			await this.repository.getByOrganizationId(organizationId);
		if (!subscription || !subscription.stripeSubscriptionId) {
			throw new Error("No active subscription found");
		}

		await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
			cancel_at_period_end: true,
		});

		await this.repository.updateSubscription(organizationId, {
			cancelAtPeriodEnd: true,
		});
	}

	/**
	 * Reactivate a canceled subscription
	 */
	async reactivateSubscription(organizationId: string): Promise<void> {
		const subscription =
			await this.repository.getByOrganizationId(organizationId);
		if (!subscription || !subscription.stripeSubscriptionId) {
			throw new Error("No subscription found");
		}

		await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
			cancel_at_period_end: false,
		});

		await this.repository.updateSubscription(organizationId, {
			cancelAtPeriodEnd: false,
		});
	}

	// =========================================================================
	// INVOICES
	// =========================================================================

	/**
	 * Get invoices for an organization
	 */
	async getInvoices(
		organizationId: string,
		limit: number = 10,
	): Promise<Invoice[]> {
		const subscription =
			await this.repository.getByOrganizationId(organizationId);
		if (!subscription) {
			return [];
		}

		const invoices = await this.stripe.invoices.list({
			customer: subscription.stripeCustomerId,
			limit,
		});

		return invoices.data.map((invoice: Stripe.Invoice) => ({
			id: invoice.id,
			number: invoice.number,
			status: invoice.status || "unknown",
			amountDue: invoice.amount_due,
			amountPaid: invoice.amount_paid,
			currency: invoice.currency,
			periodStart: invoice.period_start,
			periodEnd: invoice.period_end,
			created: invoice.created,
			hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
			invoicePdf: invoice.invoice_pdf ?? null,
		}));
	}

	// =========================================================================
	// USAGE & FEATURE CHECKS
	// =========================================================================

	/**
	 * Check if usage is allowed for a metric
	 */
	async checkUsage(
		organizationId: string,
		metric: UsageMetric,
	): Promise<UsageCheckResult> {
		const subscription =
			await this.repository.getByOrganizationId(organizationId);

		if (!subscription) {
			return {
				allowed: false,
				used: 0,
				included: 0,
				remaining: 0,
				overage: 0,
				planTier: "none",
			};
		}

		const limits = this.getPlanLimits(subscription);
		// Determine tier: enterprise > paid plan > free (if has Stripe customer) > none
		const planTier: PlanTier = subscription.licenseId
			? "enterprise"
			: subscription.plan?.tier ||
				(subscription.stripeCustomerId ? "free" : "none");

		let used: number;
		let included: number | null;

		switch (metric) {
			case "notices":
				used = subscription.noticesUsed;
				included = limits.notices;
				break;
			case "users":
				used = subscription.usersCount;
				included = limits.users;
				break;
			case "alerts":
				used = subscription.alertsUsed;
				included = limits.alerts;
				break;
			case "transactions":
				used = subscription.transactionsUsed;
				included = limits.transactions;
				break;
		}

		return this.calculateUsage(used, included, planTier);
	}

	/**
	 * Check if organization has access to a feature
	 */
	async checkFeature(
		organizationId: string,
		feature: Feature,
	): Promise<FeatureCheckResult> {
		const subscription =
			await this.repository.getByOrganizationId(organizationId);

		if (!subscription) {
			return {
				allowed: false,
				planTier: "none",
				requiredTier: getRequiredTierForFeature(feature) || undefined,
			};
		}

		// Determine tier: enterprise > paid plan > free (if has Stripe customer) > none
		const planTier: PlanTier = subscription.licenseId
			? "enterprise"
			: subscription.plan?.tier ||
				(subscription.stripeCustomerId ? "free" : "none");

		const hasFeature = PLAN_FEATURES[planTier].includes(feature);

		return {
			allowed: hasFeature,
			planTier,
			requiredTier: hasFeature
				? undefined
				: getRequiredTierForFeature(feature) || undefined,
		};
	}

	// =========================================================================
	// WEBHOOK HANDLERS
	// =========================================================================

	/**
	 * Handle subscription created/updated from Stripe webhook
	 */
	async handleSubscriptionUpdated(
		stripeSubscription: Stripe.Subscription,
	): Promise<void> {
		const subscription = await this.repository.getByStripeCustomerId(
			stripeSubscription.customer as string,
		);

		if (!subscription) {
			console.error(
				`No subscription record found for customer ${stripeSubscription.customer}`,
			);
			return;
		}

		// Find the main subscription item
		const mainItem = stripeSubscription.items.data.find(
			(item: Stripe.SubscriptionItem) =>
				item.price.recurring?.usage_type !== "metered",
		);

		// Find the plan by Stripe price ID
		let planId: string | null = null;
		if (mainItem) {
			const plan = await this.repository.getPlanByStripePriceId(
				mainItem.price.id,
			);
			planId = plan?.id || null;
		}

		// Find the metered subscription item
		const meteredItem = stripeSubscription.items.data.find(
			(item: Stripe.SubscriptionItem) =>
				item.price.recurring?.usage_type === "metered",
		);

		// Type assertion for Stripe subscription with period properties
		const subData = stripeSubscription as unknown as {
			id: string;
			status: string;
			cancel_at_period_end: boolean;
			current_period_start?: number;
			current_period_end?: number;
		};

		await this.repository.updateSubscription(subscription.organizationId, {
			planId,
			stripeSubscriptionId: stripeSubscription.id,
			stripeSubscriptionItemId: meteredItem?.id || null,
			status: subData.status as OrganizationSubscription["status"],
			currentPeriodStart: subData.current_period_start
				? new Date(subData.current_period_start * 1000)
				: null,
			currentPeriodEnd: subData.current_period_end
				? new Date(subData.current_period_end * 1000)
				: null,
			cancelAtPeriodEnd: subData.cancel_at_period_end,
		});
	}

	/**
	 * Handle subscription deleted from Stripe webhook
	 */
	async handleSubscriptionDeleted(
		stripeSubscription: Stripe.Subscription,
	): Promise<void> {
		const subscription = await this.repository.getByStripeSubscriptionId(
			stripeSubscription.id,
		);

		if (!subscription) {
			return;
		}

		await this.repository.updateSubscription(subscription.organizationId, {
			status: "canceled",
			stripeSubscriptionId: null,
			stripeSubscriptionItemId: null,
			planId: null,
		});
	}

	/**
	 * Handle invoice paid - reset usage for new period
	 */
	async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
		// Type assertion for invoice with subscription property
		const invoiceData = invoice as unknown as { subscription?: string | null };
		if (!invoiceData.subscription) {
			return;
		}

		const subscription = await this.repository.getByStripeSubscriptionId(
			invoiceData.subscription,
		);

		if (!subscription) {
			return;
		}

		// Reset usage counters for new billing period
		await this.repository.resetUsage(subscription.organizationId);
	}

	// =========================================================================
	// HELPERS
	// =========================================================================

	private getPlanLimits(subscription: OrganizationSubscription): {
		notices: number | null;
		users: number | null;
		alerts: number | null;
		transactions: number | null;
	} {
		if (subscription.plan) {
			return {
				notices: subscription.plan.noticesIncluded,
				users: subscription.plan.usersIncluded,
				alerts: subscription.plan.alertsIncluded,
				transactions: subscription.plan.transactionsIncluded,
			};
		}

		// Check for enterprise license
		// TODO: Load license limits from EnterpriseLicense table
		if (subscription.licenseId) {
			return PLAN_LIMITS.enterprise;
		}

		// If org has Stripe customer but no paid plan, use free tier limits
		if (subscription.stripeCustomerId) {
			return PLAN_LIMITS.free;
		}

		return PLAN_LIMITS.none;
	}

	private calculateUsage(
		used: number,
		included: number | null,
		planTier: PlanTier,
	): UsageCheckResult {
		// Null means unlimited
		if (included === null) {
			return {
				allowed: true,
				used,
				included: -1, // -1 indicates unlimited
				remaining: -1,
				overage: 0,
				planTier,
			};
		}

		const remaining = Math.max(0, included - used);
		const overage = Math.max(0, used - included);

		return {
			allowed: true, // We allow overage but charge for it
			used,
			included,
			remaining,
			overage,
			planTier,
		};
	}
}
