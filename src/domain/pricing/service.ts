/**
 * Pricing Service - Database-driven subscription plans, prices, and limits
 *
 * Replaces hardcoded PLAN_LIMITS from config.ts with database-driven configuration.
 * Handles:
 * - Fetching plans with prices and limits
 * - Public plan info (without sensitive priceIds)
 * - License limit resolution (with optional overrides)
 * - Effective limits calculation for users
 */

import { PricingRepository } from "./repository";
import type {
	SubscriptionPlan,
	PlanPrice,
	PlanLimits,
	EnterpriseLicense,
	PlanWithDetails,
	PublicPlanInfo,
	EffectiveLimits,
} from "./types";

// Legacy PLAN_LIMITS format for backwards compatibility
export interface LegacyPlanLimits {
	maxOrganizations: number;
	usersPerOrg: number;
	reportsPerMonth: number;
	noticesPerMonth: number;
	alertsPerMonth: number;
	operationsPerMonth: number;
	clientsPerMonth: number;
	watchlistQueriesPerMonth: number;
}

export class PricingService {
	constructor(private readonly repository: PricingRepository) {}

	// =========================================================================
	// PLANS
	// =========================================================================

	/**
	 * Get all active plans
	 */
	async getActivePlans(): Promise<SubscriptionPlan[]> {
		return this.repository.getActivePlans();
	}

	/**
	 * Get all plans (including inactive)
	 */
	async getAllPlans(): Promise<SubscriptionPlan[]> {
		return this.repository.getAllPlans();
	}

	/**
	 * Get a plan by name (e.g., "business", "pro")
	 */
	async getPlanByName(name: string): Promise<SubscriptionPlan | null> {
		return this.repository.getPlanByName(name);
	}

	/**
	 * Get a plan by ID
	 */
	async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
		return this.repository.getPlanById(planId);
	}

	// =========================================================================
	// PLAN WITH DETAILS (full info for admin)
	// =========================================================================

	/**
	 * Get all plans with their limits and prices
	 * This is the admin/internal endpoint that shows all details including priceIds
	 */
	async getPlansWithDetails(): Promise<PlanWithDetails[]> {
		const plans = await this.repository.getActivePlans();
		const result: PlanWithDetails[] = [];

		for (const plan of plans) {
			const limits = await this.repository.getLimitsForPlan(plan.id);
			const prices = await this.repository.getPricesForPlan(plan.id);

			result.push({
				plan,
				limits,
				prices,
			});
		}

		return result;
	}

	/**
	 * Get a single plan with details by name
	 */
	async getPlanWithDetailsByName(
		name: string,
	): Promise<PlanWithDetails | null> {
		const plan = await this.repository.getPlanByName(name);
		if (!plan) return null;

		const limits = await this.repository.getLimitsForPlan(plan.id);
		const prices = await this.repository.getPricesForPlan(plan.id);

		return { plan, limits, prices };
	}

	// =========================================================================
	// PUBLIC PLAN INFO (without sensitive priceIds)
	// =========================================================================

	/**
	 * Get public plan info (without Stripe priceIds)
	 * This is for public-facing pricing pages
	 */
	async getPublicPlans(): Promise<PublicPlanInfo[]> {
		const plans = await this.repository.getActivePlans();
		const result: PublicPlanInfo[] = [];

		for (const plan of plans) {
			const limits = await this.repository.getLimitsForPlan(plan.id);
			const prices = await this.repository.getPricesForPlan(plan.id);

			result.push({
				id: plan.id,
				name: plan.name,
				displayName: plan.displayName,
				description: plan.description,
				trialDays: plan.trialDays,
				limits: limits
					? {
							maxOrganizations: limits.maxOrganizations,
							usersPerOrg: limits.usersPerOrg,
							reportsPerMonth: limits.reportsPerMonth,
							noticesPerMonth: limits.noticesPerMonth,
							alertsPerMonth: limits.alertsPerMonth,
							operationsPerMonth: limits.operationsPerMonth,
							clientsPerMonth: limits.clientsPerMonth,
							watchlistQueriesPerMonth: limits.watchlistQueriesPerMonth,
						}
					: null,
				prices: prices.map((price) => ({
					priceType: price.priceType,
					amount: price.amount,
					currency: price.currency,
					interval: price.interval,
					description: price.description,
				})),
			});
		}

		return result;
	}

	/**
	 * Get public info for a single plan by name
	 */
	async getPublicPlanByName(name: string): Promise<PublicPlanInfo | null> {
		const plan = await this.repository.getPlanByName(name);
		if (!plan) return null;

		const limits = await this.repository.getLimitsForPlan(plan.id);
		const prices = await this.repository.getPricesForPlan(plan.id);

		return {
			id: plan.id,
			name: plan.name,
			displayName: plan.displayName,
			description: plan.description,
			trialDays: plan.trialDays,
			limits: limits
				? {
						maxOrganizations: limits.maxOrganizations,
						usersPerOrg: limits.usersPerOrg,
						reportsPerMonth: limits.reportsPerMonth,
						noticesPerMonth: limits.noticesPerMonth,
						alertsPerMonth: limits.alertsPerMonth,
						operationsPerMonth: limits.operationsPerMonth,
						clientsPerMonth: limits.clientsPerMonth,
						watchlistQueriesPerMonth: limits.watchlistQueriesPerMonth,
					}
				: null,
			prices: prices.map((price) => ({
				priceType: price.priceType,
				amount: price.amount,
				currency: price.currency,
				interval: price.interval,
				description: price.description,
			})),
		};
	}

	// =========================================================================
	// LIMITS
	// =========================================================================

	/**
	 * Get limits for a plan by name (legacy PLAN_LIMITS format)
	 * This is for backwards compatibility with existing code
	 */
	async getLimitsByPlanName(
		planName: string,
	): Promise<LegacyPlanLimits | null> {
		const limits = await this.repository.getLimitsByPlanName(planName);
		if (!limits) return null;

		return {
			maxOrganizations: limits.maxOrganizations,
			usersPerOrg: limits.usersPerOrg,
			reportsPerMonth: limits.reportsPerMonth,
			noticesPerMonth: limits.noticesPerMonth,
			alertsPerMonth: limits.alertsPerMonth,
			operationsPerMonth: limits.operationsPerMonth,
			clientsPerMonth: limits.clientsPerMonth,
			watchlistQueriesPerMonth: limits.watchlistQueriesPerMonth,
		};
	}

	/**
	 * Get limits for a plan by ID
	 */
	async getLimitsByPlanId(planId: string): Promise<PlanLimits | null> {
		return this.repository.getLimitsForPlan(planId);
	}

	// =========================================================================
	// PRICES
	// =========================================================================

	/**
	 * Get all prices for a plan
	 */
	async getPricesForPlan(planId: string): Promise<PlanPrice[]> {
		return this.repository.getPricesForPlan(planId);
	}

	/**
	 * Get price by Stripe price ID
	 */
	async getPriceByStripePriceId(
		stripePriceId: string,
	): Promise<PlanPrice | null> {
		return this.repository.getPriceByStripePriceId(stripePriceId);
	}

	/**
	 * Get subscription (base) price for a plan by plan name (e.g., "business", "pro")
	 */
	async getSubscriptionPriceForPlan(
		planName: string,
	): Promise<PlanPrice | null> {
		const plan = await this.repository.getPlanByName(planName);
		if (!plan) return null;
		const prices = await this.repository.getPricesForPlan(plan.id);
		return prices.find((p) => p.priceType === "subscription") ?? null;
	}

	/**
	 * Get seat price for a plan by plan name (e.g., "business", "pro")
	 */
	async getSeatPriceForPlan(planName: string): Promise<PlanPrice | null> {
		const plan = await this.repository.getPlanByName(planName);
		if (!plan) return null;
		const prices = await this.repository.getPricesForPlan(plan.id);
		return prices.find((p) => p.priceType === "seat") ?? null;
	}

	/**
	 * Get the overage Stripe price ID for a given plan and usage metric.
	 * Returns null if no overage price is configured for the metric.
	 */
	async getOveragePriceIdForMetric(
		planName: string,
		metric: "reports" | "notices" | "alerts" | "operations" | "clients",
	): Promise<string | null> {
		const plan = await this.repository.getPlanByName(planName);
		if (!plan) return null;

		const prices = await this.repository.getPricesForPlan(plan.id);
		const overagePriceType =
			`overage_${metric === "reports" ? "report" : metric.replace(/s$/, "")}` as string;
		const overagePrice = prices.find(
			(p) => p.priceType === overagePriceType && p.isActive,
		);

		return overagePrice?.stripePriceId ?? null;
	}

	/**
	 * Get plan name from a Stripe price ID
	 * Useful for webhook handling and subscription detection
	 */
	async getPlanNameFromStripePriceId(
		stripePriceId: string,
	): Promise<string | null> {
		const price = await this.repository.getPriceByStripePriceId(stripePriceId);
		if (!price) return null;

		const plan = await this.repository.getPlanById(price.planId);
		return plan?.name ?? null;
	}

	/**
	 * Get all subscription prices (for Better Auth config and caching)
	 * Returns a map of plan name -> stripe price ID
	 */
	async getAllSubscriptionPrices(): Promise<Map<string, string>> {
		const plans = await this.repository.getAllPlans();
		const priceMap = new Map<string, string>();

		for (const plan of plans) {
			const prices = await this.repository.getPricesForPlan(plan.id);
			const subscriptionPrice = prices.find(
				(p) => p.priceType === "subscription",
			);
			if (subscriptionPrice) {
				priceMap.set(plan.name, subscriptionPrice.stripePriceId);
			}
		}

		return priceMap;
	}

	/**
	 * Get subscription price ID for a plan by name
	 */
	async getSubscriptionPriceIdByPlanName(
		planName: string,
	): Promise<string | null> {
		const price = await this.getSubscriptionPriceForPlan(planName);
		return price?.stripePriceId ?? null;
	}

	// =========================================================================
	// LICENSES
	// =========================================================================

	/**
	 * Get license by key
	 */
	async getLicenseByKey(key: string): Promise<EnterpriseLicense | null> {
		return this.repository.getLicenseByKey(key);
	}

	/**
	 * Get license by user ID
	 */
	async getLicenseByUserId(userId: string): Promise<EnterpriseLicense | null> {
		return this.repository.getLicenseByUserId(userId);
	}

	/**
	 * Get license by primary key (any status — for validating subscription.licenseId)
	 */
	async getLicenseById(id: string): Promise<EnterpriseLicense | null> {
		return this.repository.getLicenseById(id);
	}

	/**
	 * Validate a license key (check if valid and not expired)
	 */
	async validateLicenseKey(
		key: string,
	): Promise<{ valid: boolean; license?: EnterpriseLicense; error?: string }> {
		const license = await this.repository.getLicenseByKey(key);

		if (!license) {
			return { valid: false, error: "License key not found" };
		}

		if (license.status !== "active") {
			return { valid: false, error: `License is ${license.status}` };
		}

		if (license.expiresAt && license.expiresAt < new Date()) {
			return { valid: false, error: "License has expired" };
		}

		return { valid: true, license };
	}

	/**
	 * Activate a license for a user
	 */
	async activateLicense(
		key: string,
		userId: string,
	): Promise<{
		success: boolean;
		license?: EnterpriseLicense;
		error?: string;
	}> {
		const validation = await this.validateLicenseKey(key);
		if (!validation.valid || !validation.license) {
			return { success: false, error: validation.error };
		}

		const license = validation.license;

		// Check if already assigned to another user
		if (license.userId && license.userId !== userId) {
			return { success: false, error: "License is already in use" };
		}

		// Check if already activated by this user
		if (license.userId === userId && license.activatedAt) {
			return {
				success: false,
				error: "This license is already activated on your account",
			};
		}

		// Activate the license
		await this.repository.activateLicense(license.id, userId);

		// Fetch updated license
		const updatedLicense = await this.repository.getLicenseById(license.id);
		return { success: true, license: updatedLicense ?? undefined };
	}

	// =========================================================================
	// EFFECTIVE LIMITS (resolves from plan or license with overrides)
	// =========================================================================

	/**
	 * Get effective limits for a user
	 * Checks for license first (self-contained limits), then falls back to plan limits
	 */
	async getEffectiveLimitsForUser(
		userId: string,
		planName: string,
	): Promise<EffectiveLimits | null> {
		// First check if user has an active license
		const license = await this.repository.getLicenseByUserId(userId);

		if (license) {
			// License is self-contained -- all limits come directly from it (no plan lookup)
			return {
				maxOrganizations: license.maxOrganizations,
				usersPerOrg: license.maxUsers,
				reportsPerMonth: license.reportsPerMonth,
				noticesPerMonth: license.noticesPerMonth,
				alertsPerMonth: license.alertsPerMonth,
				operationsPerMonth: license.operationsPerMonth,
				clientsPerMonth: license.clientsPerMonth,
				watchlistQueriesPerMonth: license.watchlistQueriesPerMonth,
				source: "license",
				planName: "enterprise",
			};
		}

		// No license, use plan limits
		const plan = await this.repository.getPlanByName(planName);
		if (!plan) return null;

		const limits = await this.repository.getLimitsForPlan(plan.id);
		if (!limits) return null;

		return {
			maxOrganizations: limits.maxOrganizations,
			usersPerOrg: limits.usersPerOrg,
			reportsPerMonth: limits.reportsPerMonth,
			noticesPerMonth: limits.noticesPerMonth,
			alertsPerMonth: limits.alertsPerMonth,
			operationsPerMonth: limits.operationsPerMonth,
			clientsPerMonth: limits.clientsPerMonth,
			watchlistQueriesPerMonth: limits.watchlistQueriesPerMonth,
			source: "plan",
			planName: plan.name,
		};
	}

	/**
	 * Get effective limits by license ID (for license-activated users)
	 * License is self-contained -- all limits come directly from the license
	 */
	async getEffectiveLimitsForLicense(
		licenseId: string,
	): Promise<EffectiveLimits | null> {
		const license = await this.repository.getLicenseById(licenseId);
		if (!license) return null;

		return {
			maxOrganizations: license.maxOrganizations,
			usersPerOrg: license.maxUsers,
			reportsPerMonth: license.reportsPerMonth,
			noticesPerMonth: license.noticesPerMonth,
			alertsPerMonth: license.alertsPerMonth,
			operationsPerMonth: license.operationsPerMonth,
			clientsPerMonth: license.clientsPerMonth,
			watchlistQueriesPerMonth: license.watchlistQueriesPerMonth,
			source: "license",
			planName: "enterprise",
		};
	}
}
