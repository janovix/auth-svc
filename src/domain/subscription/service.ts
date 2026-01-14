/**
 * Subscription Service - User-based billing model
 *
 * Handles:
 * - User subscription status (reads from Better Auth Stripe tables)
 * - Organization usage tracking and limits
 * - Card fingerprint checking for trial abuse prevention
 * - Metered billing reporting to Stripe
 *
 * Note: Subscription lifecycle (checkout, cancel, upgrade) is handled
 * by Better Auth Stripe plugin. This service focuses on usage and limits.
 */

import type Stripe from "stripe";
import { SubscriptionRepository } from "./repository";
import { PLAN_LIMITS, type PlanName } from "../../auth/config";
import type {
	UserSubscriptionStatus,
	UsageCheckResult,
	OrganizationUsage,
	UsageMetric,
	Feature,
	PlanLimits,
} from "./types";
import { PLAN_FEATURES } from "./types";

export class SubscriptionService {
	constructor(
		private readonly repository: SubscriptionRepository,
		private readonly stripe: Stripe | null = null,
	) {}

	// =========================================================================
	// USER SUBSCRIPTION STATUS
	// =========================================================================

	/**
	 * Get user's subscription status
	 */
	async getUserSubscriptionStatus(
		userId: string,
	): Promise<UserSubscriptionStatus> {
		const subscription = await this.repository.getUserSubscription(userId);
		const orgsOwned = await this.repository.countOrganizationsOwned(userId);

		if (!subscription) {
			return {
				hasSubscription: false,
				status: null,
				plan: null,
				limits: null,
				isTrialing: false,
				trialDaysRemaining: null,
				currentPeriodStart: null,
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false,
				organizationsOwned: orgsOwned,
				organizationsLimit: 0,
			};
		}

		const plan = subscription.plan as PlanName;
		const limits = PLAN_LIMITS[plan] || null;
		const isTrialing = subscription.status === "trialing";

		let trialDaysRemaining: number | null = null;
		if (isTrialing && subscription.trialEnd) {
			const now = new Date();
			const diff = subscription.trialEnd.getTime() - now.getTime();
			trialDaysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
		}

		return {
			hasSubscription: true,
			status: subscription.status,
			plan,
			limits,
			isTrialing,
			trialDaysRemaining,
			currentPeriodStart: subscription.periodStart?.toISOString() || null,
			currentPeriodEnd: subscription.periodEnd?.toISOString() || null,
			cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
			organizationsOwned: orgsOwned,
			organizationsLimit: limits?.maxOrganizations ?? 0,
		};
	}

	/**
	 * Check if user can create a new organization
	 */
	async canCreateOrganization(
		userId: string,
	): Promise<{ allowed: boolean; reason?: string }> {
		const status = await this.getUserSubscriptionStatus(userId);

		if (!status.hasSubscription) {
			return {
				allowed: false,
				reason: "A subscription is required to create organizations",
			};
		}

		if (status.status !== "active" && status.status !== "trialing") {
			return {
				allowed: false,
				reason: `Subscription is ${status.status}. An active subscription is required.`,
			};
		}

		if (status.organizationsOwned >= status.organizationsLimit) {
			return {
				allowed: false,
				reason: `You've reached the limit of ${status.organizationsLimit} organization(s) for your ${status.plan} plan`,
			};
		}

		return { allowed: true };
	}

	/**
	 * Get plan limits for a user
	 */
	async getUserPlanLimits(userId: string): Promise<PlanLimits | null> {
		const subscription = await this.repository.getUserSubscription(userId);
		if (!subscription) return null;

		const plan = subscription.plan as PlanName;
		return PLAN_LIMITS[plan] || null;
	}

	/**
	 * Get features for user's plan
	 */
	async getUserFeatures(userId: string): Promise<Feature[]> {
		const subscription = await this.repository.getUserSubscription(userId);
		if (!subscription) return [];

		const plan = subscription.plan as PlanName;
		return PLAN_FEATURES[plan] || [];
	}

	/**
	 * Check if user has a specific feature
	 */
	async hasFeature(userId: string, feature: Feature): Promise<boolean> {
		const features = await this.getUserFeatures(userId);
		return features.includes(feature);
	}

	// =========================================================================
	// ORGANIZATION USAGE
	// =========================================================================

	/**
	 * Get or create organization usage record
	 */
	async getOrCreateOrganizationUsage(
		organizationId: string,
		ownerUserId: string,
	): Promise<OrganizationUsage> {
		let usage = await this.repository.getOrganizationUsage(organizationId);

		if (!usage) {
			// Get owner's subscription period
			const subscription =
				await this.repository.getUserSubscription(ownerUserId);

			const periodStart = subscription?.periodStart || new Date();
			const periodEnd =
				subscription?.periodEnd ||
				new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

			usage = await this.repository.upsertOrganizationUsage(
				organizationId,
				ownerUserId,
				periodStart,
				periodEnd,
			);
		}

		return usage;
	}

	/**
	 * Check usage for a specific metric in an organization
	 */
	async checkUsage(
		organizationId: string,
		ownerUserId: string,
		metric: UsageMetric,
	): Promise<UsageCheckResult> {
		const usage = await this.getOrCreateOrganizationUsage(
			organizationId,
			ownerUserId,
		);
		const limits = await this.getUserPlanLimits(ownerUserId);

		if (!limits) {
			return {
				allowed: false,
				used: 0,
				included: 0,
				remaining: 0,
				overage: 0,
			};
		}

		let used: number;
		let included: number | null;

		switch (metric) {
			case "notices":
				used = usage.noticesUsed;
				included = limits.noticesPerMonth;
				break;
			case "alerts":
				used = usage.alertsUsed;
				included = limits.alertsPerMonth;
				break;
			case "transactions":
				used = usage.transactionsUsed;
				included = limits.transactionsPerMonth;
				break;
			case "users":
				used = usage.usersCount;
				included = limits.usersPerOrg;
				break;
		}

		// null means unlimited
		if (included === null) {
			return {
				allowed: true,
				used,
				included: -1, // -1 indicates unlimited
				remaining: -1,
				overage: 0,
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
		};
	}

	/**
	 * Report usage increment for an organization
	 */
	async reportUsage(
		organizationId: string,
		metric: "notices" | "alerts" | "transactions",
		count: number = 1,
	): Promise<void> {
		await this.repository.incrementUsage(organizationId, metric, count);
	}

	/**
	 * Update user count for an organization
	 */
	async updateUsersCount(
		organizationId: string,
		usersCount: number,
	): Promise<void> {
		await this.repository.updateUsersCount(organizationId, usersCount);
	}

	/**
	 * Reset usage for new billing period
	 */
	async resetUsageForPeriod(
		organizationId: string,
		periodStart: Date,
		periodEnd: Date,
	): Promise<void> {
		await this.repository.resetUsage(organizationId, periodStart, periodEnd);
	}

	// =========================================================================
	// METERED BILLING (Report overage to Stripe)
	// =========================================================================

	/**
	 * Report overage usage to Stripe for metered billing
	 * TODO: Implement proper Stripe metered billing when ready
	 */
	async reportOverageToStripe(
		organizationId: string,
		ownerUserId: string,
		_overagePriceId: string,
	): Promise<void> {
		if (!this.stripe) {
			console.warn("[Subscription] Stripe client not configured");
			return;
		}

		const usage = await this.repository.getOrganizationUsage(organizationId);
		const limits = await this.getUserPlanLimits(ownerUserId);
		const subscription = await this.repository.getUserSubscription(ownerUserId);

		if (!usage || !limits || !subscription?.stripeSubscriptionId) {
			return;
		}

		// Calculate overage
		const noticeOverage = Math.max(
			0,
			usage.noticesUsed - limits.noticesPerMonth,
		);

		if (noticeOverage === 0) {
			return; // No overage to report
		}

		// Log overage for now - implement Stripe metered billing later
		console.log(
			`[Subscription] Overage detected for org ${organizationId}: ${noticeOverage} notices over limit`,
		);

		// Mark as reported with a placeholder ID
		const reportId = `overage_${organizationId}_${Date.now()}`;
		await this.repository.markOverageReported(organizationId, reportId);
	}

	// =========================================================================
	// CARD FINGERPRINT (Trial abuse prevention)
	// =========================================================================

	/**
	 * Check if card fingerprint has been used for a trial before
	 */
	async isCardUsedForTrial(fingerprint: string): Promise<boolean> {
		return this.repository.isCardFingerprintUsed(fingerprint);
	}

	/**
	 * Store card fingerprint after successful trial start
	 */
	async storeCardFingerprint(
		fingerprint: string,
		userId: string,
	): Promise<void> {
		const exists = await this.repository.isCardFingerprintUsed(fingerprint);

		if (exists) {
			// Card already used, increment count
			await this.repository.incrementCardFingerprintUsage(fingerprint);
		} else {
			// New card, store it
			await this.repository.storeCardFingerprint(fingerprint, userId);
		}
	}

	/**
	 * Handle checkout completion - check fingerprint and potentially skip trial
	 * Returns true if trial should be skipped (card was used before)
	 */
	async handleCheckoutForTrialAbuse(
		stripeSubscriptionId: string,
		userId: string,
	): Promise<{ skipTrial: boolean; reason?: string }> {
		if (!this.stripe) {
			return { skipTrial: false };
		}

		try {
			// Get subscription to find payment method
			const subscription = await this.stripe.subscriptions.retrieve(
				stripeSubscriptionId,
				{ expand: ["default_payment_method"] },
			);

			const paymentMethod = subscription.default_payment_method;
			if (
				!paymentMethod ||
				typeof paymentMethod === "string" ||
				paymentMethod.type !== "card"
			) {
				return { skipTrial: false };
			}

			const fingerprint = paymentMethod.card?.fingerprint;
			if (!fingerprint) {
				return { skipTrial: false };
			}

			// Check if fingerprint was used before
			const wasUsed = await this.isCardUsedForTrial(fingerprint);

			if (wasUsed) {
				// Skip trial - card was used before
				// Update subscription to remove trial
				await this.stripe.subscriptions.update(stripeSubscriptionId, {
					trial_end: "now", // End trial immediately
				});

				await this.repository.incrementCardFingerprintUsage(fingerprint);

				return {
					skipTrial: true,
					reason: "Card has been used for a trial before",
				};
			}

			// New card - store fingerprint
			await this.storeCardFingerprint(fingerprint, userId);
			return { skipTrial: false };
		} catch (error) {
			console.error("[Subscription] Error checking trial abuse:", error);
			return { skipTrial: false };
		}
	}
}
