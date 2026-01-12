/**
 * Feature definitions and plan limits
 */

import type { Feature, PlanTier } from "./types";

/**
 * Features available for each plan tier
 */
export const PLAN_FEATURES: Record<PlanTier, Feature[]> = {
	none: [],
	free: [
		// Free tier gets basic data capture only
		"data_capture",
	],
	business: [
		"data_capture",
		"compliance_validation",
		"report_generation",
		"acknowledgment_tracking",
	],
	pro: [
		"data_capture",
		"compliance_validation",
		"report_generation",
		"acknowledgment_tracking",
		"advanced_roles",
		"approval_flows",
		"report_templates",
		"priority_support",
	],
	enterprise: [
		"data_capture",
		"compliance_validation",
		"report_generation",
		"acknowledgment_tracking",
		"advanced_roles",
		"approval_flows",
		"report_templates",
		"priority_support",
		"sso",
		"custom_branding",
		"audit_export",
		"api_access",
		"dedicated_support",
		"custom_integrations",
	],
};

/**
 * Plan limits definition
 */
export interface PlanLimits {
	notices: number | null; // null = unlimited
	users: number | null;
	transactions: number | null;
	alerts: number | null;
}

/**
 * Default limits for each plan tier
 */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
	none: {
		notices: 0,
		users: 0,
		transactions: 0,
		alerts: 0,
	},
	free: {
		notices: 5, // 5 notices per month for free tier
		users: 2, // Max 2 users
		transactions: 10, // Limited transactions
		alerts: 5, // Limited alerts
	},
	business: {
		notices: 50,
		users: 5,
		transactions: null, // unlimited
		alerts: null, // unlimited
	},
	pro: {
		notices: 150,
		users: 10,
		transactions: null,
		alerts: null,
	},
	enterprise: {
		notices: null, // defined per license
		users: null,
		transactions: null,
		alerts: null,
	},
};

/**
 * Check if a plan tier has a specific feature
 */
export function planHasFeature(tier: PlanTier, feature: Feature): boolean {
	return PLAN_FEATURES[tier].includes(feature);
}

/**
 * Get the minimum plan tier required for a feature
 */
export function getRequiredTierForFeature(feature: Feature): PlanTier | null {
	const tiers: PlanTier[] = ["free", "business", "pro", "enterprise"];
	for (const tier of tiers) {
		if (PLAN_FEATURES[tier].includes(feature)) {
			return tier;
		}
	}
	return null;
}

/**
 * Compare plan tiers (returns positive if a > b, negative if a < b, 0 if equal)
 */
export function comparePlanTiers(a: PlanTier, b: PlanTier): number {
	const order: Record<PlanTier, number> = {
		none: 0,
		free: 1,
		business: 2,
		pro: 3,
		enterprise: 4,
	};
	return order[a] - order[b];
}

/**
 * Check if tier A is at least tier B
 */
export function tierAtLeast(current: PlanTier, required: PlanTier): boolean {
	return comparePlanTiers(current, required) >= 0;
}
