/**
 * Usage Service
 *
 * Handles usage tracking and reporting to Stripe for metered billing
 */

import type Stripe from "stripe";
import { SubscriptionRepository } from "./repository";
import type { UsageCheckResult, PlanTier, UsageMetric } from "./types";

export class UsageService {
	constructor(
		private readonly repository: SubscriptionRepository,
		private readonly stripe: Stripe,
	) {}

	/**
	 * Report usage and return updated usage status
	 * Called by other services (aml-svc) when creating notices/alerts/transactions
	 */
	async reportUsage(
		organizationId: string,
		metric: UsageMetric,
		count: number = 1,
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

		// Only track notices, alerts, and transactions (not users)
		if (metric === "users") {
			throw new Error("Use updateUsersCount for user tracking");
		}

		// Increment the usage counter
		await this.repository.incrementUsage(organizationId, metric, count);

		// Get updated subscription to calculate overage
		const updatedSubscription =
			await this.repository.getByOrganizationId(organizationId);
		if (!updatedSubscription) {
			throw new Error("Failed to get updated subscription");
		}

		const plan = updatedSubscription.plan;
		const planTier: PlanTier = updatedSubscription.licenseId
			? "enterprise"
			: plan?.tier || "none";

		// Calculate usage
		let used: number;
		let included: number;

		switch (metric) {
			case "notices":
				used = updatedSubscription.noticesUsed;
				included = plan?.noticesIncluded || 0;
				break;
			case "alerts":
				used = updatedSubscription.alertsUsed;
				included = plan?.alertsIncluded || Infinity;
				break;
			case "transactions":
				used = updatedSubscription.transactionsUsed;
				included = plan?.transactionsIncluded || Infinity;
				break;
			default:
				throw new Error(`Unknown metric: ${metric}`);
		}

		const remaining = Math.max(0, included - used);
		const overage = Math.max(0, used - included);

		// Report overage to Stripe if we have a metered subscription item
		if (
			metric === "notices" &&
			overage > 0 &&
			updatedSubscription.stripeSubscriptionItemId &&
			subscription.currentPeriodStart &&
			subscription.currentPeriodEnd
		) {
			await this.reportOverageToStripe(
				organizationId,
				updatedSubscription.id,
				updatedSubscription.stripeSubscriptionItemId,
				overage,
				subscription.currentPeriodStart,
				subscription.currentPeriodEnd,
			);
		}

		return {
			allowed: true,
			used,
			included: included === Infinity ? -1 : included,
			remaining: remaining === Infinity ? -1 : remaining,
			overage,
			planTier,
		};
	}

	/**
	 * Update users count for an organization
	 */
	async updateUsersCount(organizationId: string, count: number): Promise<void> {
		await this.repository.updateUsage(organizationId, { usersCount: count });
	}

	/**
	 * Report overage to Stripe for metered billing
	 */
	private async reportOverageToStripe(
		organizationId: string,
		subscriptionId: string,
		subscriptionItemId: string,
		overageQuantity: number,
		periodStart: Date,
		periodEnd: Date,
	): Promise<void> {
		// Get or create usage record for this period
		const usageRecord = await this.repository.getOrCreateUsageRecord(
			organizationId,
			subscriptionId,
			periodStart,
			periodEnd,
		);

		// Calculate incremental overage to report
		const previouslyReported = usageRecord.noticesOverage;
		const incrementalOverage = overageQuantity - previouslyReported;

		if (incrementalOverage <= 0) {
			return; // Nothing new to report
		}

		try {
			// Create usage record in Stripe
			// In Stripe SDK v20+, usage records are created via billing.meterEvents for metered billing
			// For legacy metered subscriptions, we use the subscription items API
			// Note: The API endpoint is /v1/subscription_items/:id/usage_records
			const stripeUsageRecord = await (
				this.stripe as unknown as {
					subscriptionItems: {
						createUsageRecord: (
							id: string,
							params: { quantity: number; timestamp?: number; action?: string },
						) => Promise<{ id: string }>;
					};
				}
			).subscriptionItems.createUsageRecord(subscriptionItemId, {
				quantity: incrementalOverage,
				timestamp: Math.floor(Date.now() / 1000),
				action: "increment",
			});

			// Update our usage record
			const existingIds = usageRecord.stripeUsageRecordIds || [];
			await this.repository.updateUsageRecord(usageRecord.id, {
				noticesOverage: overageQuantity,
				overageReportedAt: new Date(),
				stripeUsageRecordIds: [...existingIds, stripeUsageRecord.id],
			});
		} catch (error) {
			console.error("Failed to report usage to Stripe:", error);
			// Don't throw - we don't want to fail the original operation
		}
	}

	/**
	 * Get current usage for an organization
	 */
	async getCurrentUsage(organizationId: string): Promise<{
		notices: number;
		alerts: number;
		transactions: number;
		users: number;
	} | null> {
		const subscription =
			await this.repository.getByOrganizationId(organizationId);

		if (!subscription) {
			return null;
		}

		return {
			notices: subscription.noticesUsed,
			alerts: subscription.alertsUsed,
			transactions: subscription.transactionsUsed,
			users: subscription.usersCount,
		};
	}

	/**
	 * Reset usage for a new billing period (called by webhook handler)
	 */
	async resetUsageForNewPeriod(organizationId: string): Promise<void> {
		await this.repository.resetUsage(organizationId);
	}
}
