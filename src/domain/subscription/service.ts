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
 *
 * IMPORTANT: Plan limits are now database-driven via PricingService.
 * The old hardcoded PLAN_LIMITS is deprecated and only used as fallback.
 */

import type Stripe from "stripe";
import { SubscriptionRepository } from "./repository";
import { PricingRepository, PricingService } from "../pricing";
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
	private readonly pricingService: PricingService | null;

	constructor(
		private readonly repository: SubscriptionRepository,
		private readonly stripe: Stripe | null = null,
		pricingRepository?: PricingRepository,
	) {
		// Initialize pricing service if repository is provided
		this.pricingService = pricingRepository
			? new PricingService(pricingRepository)
			: null;
	}

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
				isLicenseBased: false,
				licenseExpiresAt: null,
				organizationsOwned: orgsOwned,
				organizationsLimit: 0,
				stripeSubscriptionId: null,
			};
		}

		const plan = subscription.plan;
		// Get limits from database via pricing service, or null if not available
		const limits = await this.getUserPlanLimits(userId);
		const isTrialing = subscription.status === "trialing";
		const isLicenseBased = !!subscription.licenseId;

		let trialDaysRemaining: number | null = null;
		if (isTrialing && subscription.trialEnd) {
			const now = new Date();
			const diff = subscription.trialEnd.getTime() - now.getTime();
			trialDaysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
		}

		// Fetch license expiry if this is a license-based subscription
		let licenseExpiresAt: string | null = null;
		if (isLicenseBased && this.pricingService) {
			const license = await this.pricingService.getLicenseByUserId(userId);
			if (license?.expiresAt) {
				licenseExpiresAt = license.expiresAt.toISOString();
			}
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
			isLicenseBased,
			licenseExpiresAt,
			organizationsOwned: orgsOwned,
			organizationsLimit: limits?.maxOrganizations ?? 0,
			stripeSubscriptionId: subscription.stripeSubscriptionId,
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

		// 0 means unlimited -- skip limit check
		if (
			status.organizationsLimit > 0 &&
			status.organizationsOwned >= status.organizationsLimit
		) {
			return {
				allowed: false,
				reason: `You've reached the limit of ${status.organizationsLimit} organization(s) for your ${status.plan} plan`,
			};
		}

		return { allowed: true };
	}

	/**
	 * Get plan limits for a user
	 * Uses database-driven limits via PricingService, with fallback for backwards compatibility
	 */
	async getUserPlanLimits(userId: string): Promise<PlanLimits | null> {
		const subscription = await this.repository.getUserSubscription(userId);
		if (!subscription) return null;

		const plan = subscription.plan;

		// Try to get limits from database via pricing service
		if (this.pricingService) {
			// Check if user has a license with custom limits
			const effectiveLimits =
				await this.pricingService.getEffectiveLimitsForUser(userId, plan);
			if (effectiveLimits) {
				return {
					maxOrganizations: effectiveLimits.maxOrganizations,
					usersPerOrg: effectiveLimits.usersPerOrg,
					reportsPerMonth: effectiveLimits.reportsPerMonth,
					noticesPerMonth: effectiveLimits.noticesPerMonth,
					alertsPerMonth: effectiveLimits.alertsPerMonth,
					operationsPerMonth: effectiveLimits.operationsPerMonth,
					clientsPerMonth: effectiveLimits.clientsPerMonth,
				};
			}
		}

		// Database limits not available - return null
		// The caller should handle this case
		console.warn(
			`[Subscription] No limits found in database for plan "${plan}" (user ${userId})`,
		);
		return null;
	}

	/**
	 * Get features for user's plan
	 * Note: Features are still defined in PLAN_FEATURES constant for now
	 * This could be migrated to the database in the future
	 */
	async getUserFeatures(userId: string): Promise<Feature[]> {
		const subscription = await this.repository.getUserSubscription(userId);
		if (!subscription) return [];

		// Enterprise license users get all enterprise features
		if (subscription.licenseId || subscription.plan === "enterprise") {
			return PLAN_FEATURES.enterprise || [];
		}

		const plan = subscription.plan;
		// Features are still static for now - could be moved to DB later
		if (plan in PLAN_FEATURES) {
			return PLAN_FEATURES[plan as keyof typeof PLAN_FEATURES] || [];
		}
		// For custom plans, default to business features
		return PLAN_FEATURES.business || [];
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
		let included: number;

		switch (metric) {
			case "reports":
				used = usage.reportsUsed;
				included = limits.reportsPerMonth;
				break;
			case "notices":
				used = usage.noticesUsed;
				included = limits.noticesPerMonth;
				break;
			case "alerts":
				used = usage.alertsUsed;
				included = limits.alertsPerMonth;
				break;
			case "operations":
				used = usage.operationsUsed;
				included = limits.operationsPerMonth;
				break;
			case "clients":
				used = usage.clientsUsed;
				included = limits.clientsPerMonth;
				break;
			case "users":
				used = usage.usersCount;
				included = limits.usersPerOrg;
				break;
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
		metric: "reports" | "notices" | "alerts" | "operations" | "clients",
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
	// SEAT-BASED BILLING (Update subscription quantity for extra users)
	// =========================================================================
	// NOTE: Seats are calculated PER-ORG and then AGGREGATED across all owned orgs.
	// Formula: Total Extra Seats = Σ max(0, org_members - usersPerOrg) for each owned org

	/**
	 * Update Stripe subscription with TOTAL extra seats across ALL owned organizations
	 * This is the correct way to calculate seat billing for multi-org owners.
	 *
	 * @param ownerUserId - The user who owns the organizations
	 * @param seatPriceId - The Stripe price ID for per-seat billing
	 */
	async updateTotalSeatQuantityForOwner(
		ownerUserId: string,
		seatPriceId: string,
	): Promise<void> {
		if (!this.stripe) {
			console.warn("[Subscription] Stripe client not configured");
			return;
		}

		// Get owner's subscription and limits
		const subscription = await this.repository.getUserSubscription(ownerUserId);
		const limits = await this.getUserPlanLimits(ownerUserId);

		if (!subscription?.stripeSubscriptionId || !limits) {
			console.warn(
				`[Subscription] No active subscription for user ${ownerUserId}, skipping seat update`,
			);
			return;
		}

		// Get all orgs owned by user with their member counts
		const ownedOrgs =
			await this.repository.getOwnedOrganizationsWithMemberCounts(ownerUserId);

		// Calculate total extra seats across all owned organizations
		const includedSeatsPerOrg = limits.usersPerOrg;
		let totalExtraSeats = 0;
		const orgBreakdown: string[] = [];

		for (const org of ownedOrgs) {
			const extraForOrg = Math.max(0, org.memberCount - includedSeatsPerOrg);
			totalExtraSeats += extraForOrg;
			if (extraForOrg > 0) {
				orgBreakdown.push(
					`${org.organizationId}: ${org.memberCount} members (${extraForOrg} extra)`,
				);
			}
		}

		console.log(
			`[Subscription] Calculating total seats for user ${ownerUserId}: ` +
				`${ownedOrgs.length} orgs, ${includedSeatsPerOrg} included/org, ` +
				`${totalExtraSeats} total extra seats`,
		);
		if (orgBreakdown.length > 0) {
			console.log(`[Subscription] Org breakdown: ${orgBreakdown.join(", ")}`);
		}

		try {
			// Get the current subscription to find the seat item
			const stripeSubscription = await this.stripe.subscriptions.retrieve(
				subscription.stripeSubscriptionId,
			);

			// Find the seat subscription item by price ID
			const seatItem = stripeSubscription.items.data.find(
				(item) => item.price.id === seatPriceId,
			);

			if (seatItem) {
				if (totalExtraSeats > 0) {
					// Update existing seat item quantity
					await this.stripe.subscriptionItems.update(seatItem.id, {
						quantity: totalExtraSeats,
						proration_behavior: "create_prorations",
					});
					console.log(
						`[Subscription] Updated seat item ${seatItem.id} to quantity ${totalExtraSeats}`,
					);
				} else {
					// Remove the seat item when no extra seats are needed
					await this.stripe.subscriptionItems.del(seatItem.id, {
						proration_behavior: "create_prorations",
					});
					console.log(
						`[Subscription] Removed seat item ${seatItem.id} (no extra seats needed)`,
					);
				}
			} else if (totalExtraSeats > 0) {
				// Add seat item if it doesn't exist and we have extra seats
				await this.stripe.subscriptionItems.create({
					subscription: subscription.stripeSubscriptionId,
					price: seatPriceId,
					quantity: totalExtraSeats,
					proration_behavior: "create_prorations",
				});
				console.log(
					`[Subscription] Created new seat item with quantity ${totalExtraSeats}`,
				);
			}
			// If no seat item and no extra seats, nothing to do

			// Update local usage tracking for each org
			for (const org of ownedOrgs) {
				await this.repository.updateUsersCount(
					org.organizationId,
					org.memberCount,
				);
			}
		} catch (error) {
			console.error(
				`[Subscription] Failed to update total seat quantity for user ${ownerUserId}:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Update Stripe subscription quantity for seat-based billing
	 * This is called when members are added/removed from an organization
	 * IMPORTANT: This now aggregates seats across ALL owned organizations
	 *
	 * @param organizationId - The organization that had member changes
	 * @param _newUserCount - Unused, kept for backwards compatibility (member count is recalculated)
	 * @param seatPriceId - The Stripe price ID for per-seat billing
	 */
	async updateSubscriptionSeatQuantity(
		organizationId: string,
		_newUserCount: number,
		seatPriceId: string,
	): Promise<void> {
		// Get organization owner
		const ownerUserId =
			await this.repository.getOrganizationOwnerUserId(organizationId);
		if (!ownerUserId) {
			console.warn(
				`[Subscription] No owner found for org ${organizationId}, skipping seat update`,
			);
			return;
		}

		// Delegate to the aggregated method that counts all owned orgs
		await this.updateTotalSeatQuantityForOwner(ownerUserId, seatPriceId);
	}

	/**
	 * Handle member added to organization - update seat count
	 * Aggregates across all owned organizations
	 */
	async handleMemberAdded(
		organizationId: string,
		seatPriceId: string,
	): Promise<void> {
		const memberCount =
			await this.repository.countOrganizationMembers(organizationId);
		await this.updateSubscriptionSeatQuantity(
			organizationId,
			memberCount,
			seatPriceId,
		);
	}

	/**
	 * Handle member removed from organization - update seat count
	 * Aggregates across all owned organizations
	 */
	async handleMemberRemoved(
		organizationId: string,
		seatPriceId: string,
	): Promise<void> {
		const memberCount =
			await this.repository.countOrganizationMembers(organizationId);
		await this.updateSubscriptionSeatQuantity(
			organizationId,
			memberCount,
			seatPriceId,
		);
	}

	// =========================================================================
	// METERED BILLING (Report overage to Stripe)
	// =========================================================================

	/**
	 * Generic method to report overage for any metric to Stripe
	 * Uses Stripe Usage Records API for metered billing
	 */
	async reportOverageToStripeForMetric(
		organizationId: string,
		ownerUserId: string,
		metric: "reports" | "notices" | "alerts" | "operations" | "clients",
		subscriptionItemId: string,
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

		// Calculate overage based on metric
		let used: number;
		let limit: number;
		switch (metric) {
			case "reports":
				used = usage.reportsUsed;
				limit = limits.reportsPerMonth;
				break;
			case "notices":
				used = usage.noticesUsed;
				limit = limits.noticesPerMonth;
				break;
			case "alerts":
				used = usage.alertsUsed;
				limit = limits.alertsPerMonth;
				break;
			case "operations":
				used = usage.operationsUsed;
				limit = limits.operationsPerMonth;
				break;
			case "clients":
				used = usage.clientsUsed;
				limit = limits.clientsPerMonth;
				break;
		}

		const overage = Math.max(0, used - limit);

		if (overage === 0) {
			return; // No overage to report
		}

		console.log(
			`[Subscription] ${metric} overage detected for org ${organizationId}: ${overage} over limit (used: ${used}, limit: ${limit})`,
		);

		try {
			// Report overage to Stripe using usage records
			const stripeClient = this.stripe as unknown as {
				subscriptionItems: {
					createUsageRecord: (
						subscriptionItemId: string,
						params: {
							quantity: number;
							timestamp?: number | "now";
							action?: "set" | "increment";
						},
					) => Promise<{ id: string }>;
				};
			};

			const usageRecord =
				await stripeClient.subscriptionItems.createUsageRecord(
					subscriptionItemId,
					{
						quantity: overage,
						timestamp: "now",
						action: "set",
					},
				);

			console.log(
				`[Subscription] Reported ${overage} ${metric} overage to Stripe for org ${organizationId}, record: ${usageRecord.id}`,
			);

			await this.repository.markOverageReported(organizationId, usageRecord.id);
		} catch (error) {
			console.error(
				`[Subscription] Failed to report ${metric} overage to Stripe for org ${organizationId}:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Report report overage usage to Stripe
	 */
	async reportReportOverageToStripe(
		organizationId: string,
		ownerUserId: string,
		subscriptionItemId: string,
	): Promise<void> {
		return this.reportOverageToStripeForMetric(
			organizationId,
			ownerUserId,
			"reports",
			subscriptionItemId,
		);
	}

	/**
	 * Report notice overage usage to Stripe
	 */
	async reportNoticeOverageToStripe(
		organizationId: string,
		ownerUserId: string,
		subscriptionItemId: string,
	): Promise<void> {
		return this.reportOverageToStripeForMetric(
			organizationId,
			ownerUserId,
			"notices",
			subscriptionItemId,
		);
	}

	/**
	 * Report alert overage usage to Stripe
	 */
	async reportAlertOverageToStripe(
		organizationId: string,
		ownerUserId: string,
		subscriptionItemId: string,
	): Promise<void> {
		return this.reportOverageToStripeForMetric(
			organizationId,
			ownerUserId,
			"alerts",
			subscriptionItemId,
		);
	}

	/**
	 * Report operation overage usage to Stripe
	 */
	async reportOperationOverageToStripe(
		organizationId: string,
		ownerUserId: string,
		subscriptionItemId: string,
	): Promise<void> {
		return this.reportOverageToStripeForMetric(
			organizationId,
			ownerUserId,
			"operations",
			subscriptionItemId,
		);
	}

	/**
	 * Report client overage usage to Stripe
	 */
	async reportClientOverageToStripe(
		organizationId: string,
		ownerUserId: string,
		subscriptionItemId: string,
	): Promise<void> {
		return this.reportOverageToStripeForMetric(
			organizationId,
			ownerUserId,
			"clients",
			subscriptionItemId,
		);
	}

	/**
	 * @deprecated Use individual report*OverageToStripe methods instead
	 * Kept for backwards compatibility during migration
	 */
	async reportOverageToStripe(
		_organizationId: string,
		_ownerUserId: string,
		_overagePriceId: string,
	): Promise<void> {
		console.warn(
			"[Subscription] reportOverageToStripe is deprecated, use reportAlertOverageToStripe instead",
		);
		// No-op for backwards compatibility
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
