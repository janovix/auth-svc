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
import { OverageRepository } from "../overage/repository";
import type { SubscriptionService } from "../subscription/service";
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
		watchlistQueriesPerMonth: license.watchlistQueriesPerMonth,
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

/** Units of `count` that fall beyond the included `limit` (0 = all within included). */
function marginalOverageUnits(
	used: number,
	limit: number,
	count: number,
): number {
	if (limit === 0) return 0;
	const before = Math.max(0, used - limit);
	const after = Math.max(0, used + count - limit);
	return Math.max(0, after - before);
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
		watchlistQueries: "watchlistQueriesPerMonth",
		organizations: "maxOrganizations",
	};
	return mapping[metric] ?? null;
}

export class UsageRightsService {
	private readonly pricingService: PricingService;

	constructor(
		private readonly repository: UsageRightsRepository,
		pricingRepository: PricingRepository,
		private readonly overageRepository: OverageRepository,
		private readonly subscriptionService: SubscriptionService | null = null,
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
					periodStart: subscription.periodStart,
					periodEnd: subscription.periodEnd,
					limits: {
						maxOrganizations: effectiveLimits.maxOrganizations,
						usersPerOrg: effectiveLimits.usersPerOrg,
						reportsPerMonth: effectiveLimits.reportsPerMonth,
						noticesPerMonth: effectiveLimits.noticesPerMonth,
						alertsPerMonth: effectiveLimits.alertsPerMonth,
						operationsPerMonth: effectiveLimits.operationsPerMonth,
						clientsPerMonth: effectiveLimits.clientsPerMonth,
						watchlistQueriesPerMonth: effectiveLimits.watchlistQueriesPerMonth,
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
		const billingPeriod =
			metric === "watchlistQueries" ? this.getBillingPeriod(entitlement) : null;
		const used = await this.getUsedForMetric(orgId, metric, billingPeriod);

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
	 *
	 * Watchlist queries are stored as daily rows in organization_daily_usage.
	 * Monthly totals are computed by SUMming within the billing period.
	 */
	async recordUsage(
		orgId: string,
		metric: UsageMetric,
		count: number = 1,
	): Promise<void> {
		if (metric === "watchlistQueries") {
			// Store daily for granularity; monthly total is computed via SUM
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
		const lifecycle =
			await this.repository.getOrganizationLifecycleStatus(orgId);
		if (lifecycle === null) {
			return {
				allowed: false,
				metric,
				error: "organization_not_found",
				code: "ORGANIZATION_NOT_FOUND",
				upgradeRequired: false,
			};
		}
		if (lifecycle !== "active") {
			return {
				allowed: false,
				metric,
				error: "organization_archived",
				code: "ORGANIZATION_ARCHIVED",
				upgradeRequired: false,
			};
		}

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

		// Ensure organization_usage record exists for all metered metrics
		if (metric !== "organizations") {
			await this.repository.ensureOrganizationUsage(
				orgId,
				entitlement.ownerUserId,
			);
		}

		// Resolve billing period for watchlist monthly SUM
		const billingPeriod =
			metric === "watchlistQueries" ? this.getBillingPeriod(entitlement) : null;

		const used = await this.getUsedForMetric(orgId, metric, billingPeriod);

		// Unlimited included quota — always allow and meter
		if (limit === 0) {
			await this.recordUsage(orgId, metric, count);
			const newUsed = used + count;
			return {
				allowed: true,
				metric,
				used: newUsed,
				limit,
				remaining: -1,
				entitlementType: entitlement.type,
			};
		}

		const overUnits = marginalOverageUnits(used, limit, count);

		// Entirely within included quota
		if (overUnits === 0) {
			await this.recordUsage(orgId, metric, count);
			const newUsed = used + count;
			const remaining = Math.max(0, limit - newUsed);
			return {
				allowed: true,
				metric,
				used: newUsed,
				limit,
				remaining,
				entitlementType: entitlement.type,
				overageEnabled: false,
			};
		}

		// Any overage: Stripe subscription + metered metric only
		if (entitlement.type !== "stripe" || !isOverageMetric(metric)) {
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

		const settings =
			(await this.overageRepository.getByUserId(entitlement.ownerUserId)) ??
			null;
		const overageEnabled = settings?.overageEnabled ?? false;

		if (!overageEnabled) {
			return {
				allowed: false,
				metric,
				used,
				limit,
				remaining: 0,
				entitlementType: entitlement.type,
				error: "usage_limit_exceeded",
				upgradeRequired: true,
				overageEnabled: false,
			};
		}

		const priceRow = await this.pricingService.getOveragePlanPriceForMetric(
			entitlement.subscriptionPlan,
			metric as OverageMetric,
		);
		const unitCents = priceRow?.amount ?? 0;
		const deltaCents = overUnits * unitCents;
		const periodCharge = settings?.periodOverageChargeCents ?? 0;
		const cap = settings?.spendLimitCents ?? null;

		if (cap !== null && periodCharge + deltaCents > cap) {
			return {
				allowed: false,
				metric,
				used,
				limit,
				remaining: 0,
				entitlementType: entitlement.type,
				error: "spend_limit_exceeded",
				code: "SPEND_LIMIT_EXCEEDED",
				upgradeRequired: true,
				overageEnabled: true,
				spendLimitRemaining: Math.max(0, cap - periodCharge),
			};
		}

		await this.recordUsage(orgId, metric, count);
		await this.overageRepository.addPeriodOverageCharge(
			entitlement.ownerUserId,
			deltaCents,
		);

		const newUsed = used + count;
		const remaining = Math.max(0, limit - newUsed);

		this.subscriptionService
			?.reportOverageForMetricIfConfigured(
				orgId,
				entitlement.ownerUserId,
				entitlement.subscriptionPlan,
				metric as OverageMetric,
			)
			.catch((err) =>
				console.error(
					`[UsageRights] Overage reporting failed for org ${orgId}:`,
					err,
				),
			);

		return {
			allowed: true,
			metric,
			used: newUsed,
			limit,
			remaining,
			entitlementType: entitlement.type,
			overageWarning: true,
			overageUnits: overUnits,
			overageEnabled: true,
			spendLimitRemaining:
				cap !== null ? Math.max(0, cap - periodCharge - deltaCents) : null,
		};
	}

	/**
	 * Get full entitlement details for an org (for API response)
	 */
	async getEntitlementDetails(orgId: string): Promise<EntitlementResponse> {
		const entitlement = await this.resolveEntitlement(orgId);

		const usage = await this.repository.getOrganizationUsage(orgId);
		const billingPeriod = this.getBillingPeriod(entitlement);
		const watchlistQueriesUsedThisMonth =
			await this.repository.getMonthlyWatchlistQueriesUsed(
				orgId,
				billingPeriod.start,
				billingPeriod.end,
			);

		return {
			type: entitlement.type,
			limits: entitlement.type !== "none" ? entitlement.limits : null,
			usage: usage
				? {
						...usage,
						watchlistQueriesUsedThisMonth,
					}
				: null,
		};
	}

	// =========================================================================
	// INTERNAL HELPERS
	// =========================================================================

	/**
	 * Derive the billing period (YYYY-MM-DD strings) from the entitlement.
	 * For Stripe subscriptions, uses the subscription's period start/end.
	 * For licenses and fallback, uses the current calendar month.
	 */
	private getBillingPeriod(entitlement: {
		type: string;
		periodStart?: Date | null;
		periodEnd?: Date | null;
	}): { start: string; end: string } {
		if (
			entitlement.type === "stripe" &&
			entitlement.periodStart &&
			entitlement.periodEnd
		) {
			return {
				start: entitlement.periodStart.toISOString().split("T")[0],
				end: entitlement.periodEnd.toISOString().split("T")[0],
			};
		}
		// License or unknown: use current calendar month
		const now = new Date();
		const year = now.getUTCFullYear();
		const month = String(now.getUTCMonth() + 1).padStart(2, "0");
		const lastDay = new Date(Date.UTC(year, now.getUTCMonth() + 1, 0))
			.getUTCDate()
			.toString()
			.padStart(2, "0");
		return {
			start: `${year}-${month}-01`,
			end: `${year}-${month}-${lastDay}`,
		};
	}

	/**
	 * Get current usage for a metric.
	 * billingPeriod is required for watchlistQueries to SUM within the period.
	 */
	private async getUsedForMetric(
		orgId: string,
		metric: UsageMetric,
		billingPeriod?: { start: string; end: string } | null,
	): Promise<number> {
		if (metric === "watchlistQueries") {
			// Sum all daily rows within the billing period
			const period = billingPeriod ?? this.getBillingPeriod({ type: "none" });
			return this.repository.getMonthlyWatchlistQueriesUsed(
				orgId,
				period.start,
				period.end,
			);
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
