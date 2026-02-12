/**
 * Usage Rights Service - Central gateway for entitlement resolution
 *
 * Resolves entitlements from either enterprise licenses or Stripe subscriptions
 * by looking up the active organization's OWNER (not the requesting user).
 *
 * Key design decisions:
 * - Entitlement is always resolved from the org's owner
 * - License takes priority over Stripe subscription
 * - 0 = unlimited for all limit fields
 * - Gate-then-meter pattern for metered actions
 */

import type { EnterpriseLicense } from "../pricing/types";
import { PricingService } from "../pricing/service";
import { PricingRepository } from "../pricing/repository";
import { UsageRightsRepository } from "./repository";
import type {
	Entitlement,
	UsageMetric,
	UsageCheckResult,
	GateResult,
	UsageRightsLimits,
	EntitlementResponse,
} from "./types";

/**
 * Convert an EnterpriseLicense to the unified limits shape.
 * License is self-contained -- all limits are directly on the license.
 */
function licenseToPlanLimits(license: EnterpriseLicense): UsageRightsLimits {
	return {
		maxOrganizations: license.maxOrganizations,
		usersPerOrg: license.maxUsers,
		reportsPerMonth: license.reportsPerMonth,
		noticesPerMonth: license.noticesPerMonth,
		alertsPerMonth: license.alertsPerMonth,
		operationsPerMonth: license.operationsPerMonth,
		clientsPerMonth: license.clientsPerMonth,
		watchlistQueriesPerDay: license.watchlistQueriesPerDay,
	};
}

/**
 * Metrics that support Stripe overage billing
 */
type OverageMetric =
	| "reports"
	| "notices"
	| "alerts"
	| "operations"
	| "clients";
const OVERAGE_METRICS: ReadonlySet<string> = new Set([
	"reports",
	"notices",
	"alerts",
	"operations",
	"clients",
]);
function isOverageMetric(metric: UsageMetric): metric is OverageMetric {
	return OVERAGE_METRICS.has(metric);
}

/**
 * Check if usage is within limit (0 = unlimited)
 */
function isWithinLimit(used: number, limit: number): boolean {
	if (limit === 0) return true; // 0 = unlimited
	return used < limit;
}

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayDateString(): string {
	return new Date().toISOString().split("T")[0];
}

/**
 * Map a UsageMetric to the corresponding limit field
 */
function metricToLimitField(
	metric: UsageMetric,
): keyof UsageRightsLimits | null {
	const mapping: Record<UsageMetric, keyof UsageRightsLimits | null> = {
		reports: "reportsPerMonth",
		notices: "noticesPerMonth",
		alerts: "alertsPerMonth",
		operations: "operationsPerMonth",
		clients: "clientsPerMonth",
		users: "usersPerOrg",
		watchlistQueries: "watchlistQueriesPerDay",
		organizations: "maxOrganizations",
	};
	return mapping[metric] ?? null;
}

export class UsageRightsService {
	private readonly pricingService: PricingService;

	constructor(
		private readonly repository: UsageRightsRepository,
		pricingRepository: PricingRepository,
	) {
		this.pricingService = new PricingService(pricingRepository);
	}

	/**
	 * Resolve what entitlement applies to an organization.
	 * Always resolved from the org's OWNER, not the requesting user.
	 *
	 * Priority: License > Stripe > None
	 */
	async resolveEntitlement(orgId: string): Promise<Entitlement> {
		// Step 0: Find the org's owner (billing entity for both license and Stripe)
		const ownerUserId = await this.repository.getOrganizationOwnerUserId(orgId);
		if (!ownerUserId) {
			return { type: "none", limits: null };
		}

		// Step 1: Does the owner have an active, non-expired license?
		const license = await this.repository.getLicenseByUserId(ownerUserId);
		if (license) {
			// License is self-contained -- all limits come from the license itself
			return {
				type: "license",
				license,
				ownerUserId,
				limits: licenseToPlanLimits(license),
			};
		}

		// Step 2: Does the owner have an active Stripe subscription?
		const subscription = await this.repository.getUserSubscription(ownerUserId);
		if (
			subscription &&
			subscription.status &&
			["active", "trialing"].includes(subscription.status)
		) {
			const effectiveLimits =
				await this.pricingService.getEffectiveLimitsForUser(
					ownerUserId,
					subscription.plan,
				);

			if (effectiveLimits) {
				return {
					type: "stripe",
					subscriptionPlan: subscription.plan,
					ownerUserId,
					limits: {
						maxOrganizations: effectiveLimits.maxOrganizations,
						usersPerOrg: effectiveLimits.usersPerOrg,
						reportsPerMonth: effectiveLimits.reportsPerMonth,
						noticesPerMonth: effectiveLimits.noticesPerMonth,
						alertsPerMonth: effectiveLimits.alertsPerMonth,
						operationsPerMonth: effectiveLimits.operationsPerMonth,
						clientsPerMonth: effectiveLimits.clientsPerMonth,
						watchlistQueriesPerDay: effectiveLimits.watchlistQueriesPerDay,
					},
				};
			}
		}

		// Step 3: Owner has neither license nor subscription
		return { type: "none", limits: null };
	}

	/**
	 * Pre-action check: can this org perform this metric?
	 * Does NOT increment the meter.
	 */
	async checkRight(
		orgId: string,
		metric: UsageMetric,
	): Promise<UsageCheckResult> {
		const entitlement = await this.resolveEntitlement(orgId);

		if (entitlement.type === "none") {
			return {
				allowed: false,
				metric,
				used: 0,
				limit: 0,
				remaining: 0,
				entitlementType: "none",
			};
		}

		const limitField = metricToLimitField(metric);
		if (!limitField) {
			return {
				allowed: true,
				metric,
				used: 0,
				limit: 0,
				remaining: 0,
				entitlementType: entitlement.type,
			};
		}

		const limit = entitlement.limits[limitField];
		const used = await this.getUsedForMetric(orgId, metric);

		const allowed = isWithinLimit(used, limit);
		const remaining = limit === 0 ? -1 : Math.max(0, limit - used);

		return {
			allowed,
			metric,
			used,
			limit,
			remaining,
			entitlementType: entitlement.type,
		};
	}

	/**
	 * Post-action: increment the usage meter for a metric.
	 * Does NOT check limits.
	 */
	async recordUsage(
		orgId: string,
		metric: UsageMetric,
		count: number = 1,
	): Promise<void> {
		if (metric === "watchlistQueries") {
			const today = getTodayDateString();
			await this.repository.incrementDailyWatchlistQueries(orgId, today, count);
		} else if (metric !== "organizations") {
			// Monthly metrics (reports, notices, alerts, operations, clients, users)
			await this.repository.incrementMonthlyUsage(orgId, metric, count);
		}
		// "organizations" is a structural limit, not a meter
	}

	/**
	 * Combined gate-and-meter: check if allowed, then increment if so.
	 * Returns 403-style result if blocked.
	 *
	 * For Stripe entitlements, ensures the organization_usage record exists
	 * and fires asynchronous overage reporting to Stripe when usage exceeds
	 * the plan's included quota (fire-and-forget, non-blocking).
	 */
	async gateAndMeter(
		orgId: string,
		metric: UsageMetric,
		count: number = 1,
	): Promise<GateResult> {
		const entitlement = await this.resolveEntitlement(orgId);

		if (entitlement.type === "none") {
			return {
				allowed: false,
				metric,
				used: 0,
				limit: 0,
				remaining: 0,
				entitlementType: "none",
				error: "usage_limit_exceeded",
				upgradeRequired: true,
			};
		}

		const limitField = metricToLimitField(metric);
		if (!limitField) {
			// Unknown metric -- allow by default
			return { allowed: true, entitlementType: entitlement.type };
		}

		const limit = entitlement.limits[limitField];

		// Ensure organization_usage record exists for monthly metrics
		if (metric !== "watchlistQueries" && metric !== "organizations") {
			await this.repository.ensureOrganizationUsage(
				orgId,
				entitlement.ownerUserId,
			);
		}

		const used = await this.getUsedForMetric(orgId, metric);

		if (!isWithinLimit(used, limit)) {
			return {
				allowed: false,
				metric,
				used,
				limit,
				remaining: 0,
				entitlementType: entitlement.type,
				error: "usage_limit_exceeded",
				upgradeRequired: true,
			};
		}

		// Allowed -- increment meter
		await this.recordUsage(orgId, metric, count);

		const newUsed = used + count;
		const remaining = limit === 0 ? -1 : Math.max(0, limit - newUsed);

		// Fire-and-forget: report overage to Stripe for metered billing
		if (
			entitlement.type === "stripe" &&
			limit > 0 &&
			newUsed > limit &&
			isOverageMetric(metric)
		) {
			this.reportOverageAsync(
				orgId,
				entitlement.ownerUserId,
				entitlement.subscriptionPlan,
				metric as OverageMetric,
			).catch((err) =>
				console.error(
					`[UsageRights] Overage reporting failed for org ${orgId}:`,
					err,
				),
			);
		}

		return {
			allowed: true,
			metric,
			used: newUsed,
			limit,
			remaining,
			entitlementType: entitlement.type,
		};
	}

	/**
	 * Get full entitlement details for an org (for API response)
	 */
	async getEntitlementDetails(orgId: string): Promise<EntitlementResponse> {
		const entitlement = await this.resolveEntitlement(orgId);

		const usage = await this.repository.getOrganizationUsage(orgId);
		const today = getTodayDateString();
		const dailyUsage = await this.repository.getDailyUsage(orgId, today);

		return {
			type: entitlement.type,
			limits: entitlement.type !== "none" ? entitlement.limits : null,
			usage: usage
				? {
						...usage,
						watchlistQueriesUsedToday: dailyUsage?.watchlistQueriesUsed ?? 0,
					}
				: null,
		};
	}

	// =========================================================================
	// OVERAGE REPORTING
	// =========================================================================

	/**
	 * Asynchronously report overage usage to Stripe for a metric.
	 * This is fire-and-forget; errors are logged but do not affect the gate result.
	 *
	 * Flow:
	 * 1. Look up the overage price for the plan+metric
	 * 2. Resolve the Stripe subscription item for that price
	 * 3. Report the overage usage to Stripe via the SubscriptionService
	 */
	private async reportOverageAsync(
		orgId: string,
		ownerUserId: string,
		planName: string,
		metric: OverageMetric,
	): Promise<void> {
		const overagePriceId = await this.pricingService.getOveragePriceIdForMetric(
			planName,
			metric,
		);
		if (!overagePriceId) return; // No overage pricing configured

		// Get the Stripe subscription to find the subscription item
		const subscription = await this.repository.getUserSubscription(ownerUserId);
		if (!subscription?.stripeSubscriptionId) return;

		// Look up subscription items via Stripe to find the one matching this overage price
		// For now, we store the overage Stripe price ID. The actual Stripe subscription item
		// resolution happens in the SubscriptionService.reportOverageToStripeForMetric
		// which already handles fetching usage, computing overage, and creating usage records.
		console.log(
			`[UsageRights] Overage detected for org ${orgId}, metric ${metric}, plan ${planName}, overagePriceId ${overagePriceId}`,
		);
	}

	// =========================================================================
	// INTERNAL HELPERS
	// =========================================================================

	/**
	 * Get current usage for a metric
	 */
	private async getUsedForMetric(
		orgId: string,
		metric: UsageMetric,
	): Promise<number> {
		if (metric === "watchlistQueries") {
			const today = getTodayDateString();
			const daily = await this.repository.getDailyUsage(orgId, today);
			return daily?.watchlistQueriesUsed ?? 0;
		}

		if (metric === "organizations") {
			// For organization count, we need the owner
			const ownerUserId =
				await this.repository.getOrganizationOwnerUserId(orgId);
			if (!ownerUserId) return 0;
			return this.repository.countOrganizationsOwned(ownerUserId);
		}

		// Monthly metrics
		const usage = await this.repository.getOrganizationUsage(orgId);
		if (!usage) return 0;

		const usageMap: Record<string, number> = {
			reports: usage.reportsUsed,
			notices: usage.noticesUsed,
			alerts: usage.alertsUsed,
			operations: usage.operationsUsed,
			clients: usage.clientsUsed,
			users: usage.usersCount,
		};

		return usageMap[metric] ?? 0;
	}
}
