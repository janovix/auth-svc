/**
 * Usage Rights domain types
 *
 * Defines types for the unified usage rights gateway that resolves entitlements
 * from either enterprise licenses or Stripe subscriptions.
 */

import type { EnterpriseLicense } from "../pricing/types";

/**
 * Usage metrics that can be gated and metered
 */
export type UsageMetric =
	| "reports"
	| "notices"
	| "alerts"
	| "operations"
	| "clients"
	| "users"
	| "watchlistQueries"
	| "organizations";

/**
 * Entitlement type: where the org's limits come from
 */
export type EntitlementType = "license" | "stripe" | "none";

/**
 * Unified limit shape used for both license and Stripe-based entitlements.
 * 0 = unlimited for all fields.
 */
export interface UsageRightsLimits {
	maxOrganizations: number;
	usersPerOrg: number;
	reportsPerMonth: number;
	noticesPerMonth: number;
	alertsPerMonth: number;
	operationsPerMonth: number;
	clientsPerMonth: number;
	watchlistQueriesPerMonth: number;
}

/**
 * Resolved entitlement for an organization.
 * Always resolved from the org owner's license or Stripe subscription.
 */
export type Entitlement =
	| {
			type: "license";
			ownerUserId: string;
			license: EnterpriseLicense;
			limits: UsageRightsLimits;
	  }
	| {
			type: "stripe";
			ownerUserId: string;
			subscriptionPlan: string;
			/** Stripe billing period dates for monthly usage aggregation */
			periodStart: Date | null;
			periodEnd: Date | null;
			limits: UsageRightsLimits;
	  }
	| {
			type: "none";
			limits: null;
	  };

/**
 * Result of a usage check (pre-action)
 */
export interface UsageCheckResult {
	allowed: boolean;
	metric: UsageMetric;
	used: number;
	limit: number;
	remaining: number;
	entitlementType: EntitlementType;
}

/**
 * Result of a gate-and-meter operation
 */
export interface GateResult {
	allowed: boolean;
	metric?: UsageMetric;
	used?: number;
	limit?: number;
	remaining?: number;
	entitlementType?: EntitlementType;
	error?: string;
	upgradeRequired?: boolean;
}

/**
 * Full entitlement response for API
 */
export interface EntitlementResponse {
	type: EntitlementType;
	limits: UsageRightsLimits | null;
	usage: {
		reportsUsed: number;
		noticesUsed: number;
		alertsUsed: number;
		operationsUsed: number;
		clientsUsed: number;
		usersCount: number;
		watchlistQueriesUsedThisMonth: number;
	} | null;
}
