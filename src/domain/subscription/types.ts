/**
 * Subscription domain types - User-based billing model
 *
 * BILLING MODEL:
 * - Users are Stripe customers (not organizations)
 * - User's subscription determines:
 *   - How many organizations they can own (maxOrganizations)
 *   - Usage limits per organization (notices, users, etc.)
 * - Usage is tracked per organization, billed to the owner
 *
 * NOTE: Plan limits are now database-driven via pricing domain.
 * See ../pricing/types.ts for PlanLimits type.
 */

/**
 * Plan names matching Better Auth Stripe plugin configuration
 * Can be extended dynamically via database subscription_plans table
 */
export type PlanName = string;

/**
 * Subscription status from Better Auth Stripe plugin
 */
export type SubscriptionStatus =
	| "trialing"
	| "active"
	| "canceled"
	| "past_due"
	| "unpaid"
	| "incomplete"
	| "incomplete_expired"
	| "paused";

/**
 * User subscription from Better Auth Stripe plugin table
 */
export interface UserSubscription {
	id: string;
	plan: PlanName;
	referenceId: string; // User ID
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	licenseId: string | null; // Reference to enterprise_licenses
	status: SubscriptionStatus | null;
	periodStart: Date | null;
	periodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	seats: number | null;
	trialStart: Date | null;
	trialEnd: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Plan limits (defined in auth config)
 *
 * All per-month metrics are metered and billed via Stripe Usage Records API.
 * usersPerOrg is billed via Stripe subscription quantity.
 */
export interface PlanLimits {
	maxOrganizations: number;
	usersPerOrg: number;
	reportsPerMonth: number; // Metered: overage billed via Stripe
	noticesPerMonth: number; // Metered: overage billed via Stripe
	alertsPerMonth: number; // Metered: overage billed via Stripe
	operationsPerMonth: number; // Metered: overage billed via Stripe
	clientsPerMonth: number; // Metered: overage billed via Stripe
}

/**
 * Organization usage tracking record
 */
export interface OrganizationUsage {
	id: string;
	organizationId: string;
	ownerUserId: string;
	reportsUsed: number;
	noticesUsed: number;
	alertsUsed: number;
	operationsUsed: number;
	clientsUsed: number;
	usersCount: number;
	periodStart: Date;
	periodEnd: Date;
	overageReportedAt: Date | null;
	stripeUsageRecordId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Card fingerprint record for trial abuse prevention
 */
export interface UsedCardFingerprint {
	id: string;
	fingerprint: string;
	firstUserId: string;
	firstUsedAt: Date;
	lastUsedAt: Date;
	usageCount: number;
	createdAt: Date;
}

/**
 * Usage check result for a specific metric
 */
export interface UsageCheckResult {
	allowed: boolean;
	used: number;
	included: number; // -1 = unlimited
	remaining: number; // -1 = unlimited
	overage: number;
}

/**
 * User subscription status response (for API)
 */
export interface UserSubscriptionStatus {
	hasSubscription: boolean;
	status: SubscriptionStatus | null;
	plan: PlanName | null;
	limits: PlanLimits | null;
	isTrialing: boolean;
	trialDaysRemaining: number | null;
	currentPeriodStart: string | null;
	currentPeriodEnd: string | null;
	cancelAtPeriodEnd: boolean;
	// License info (enterprise licenses)
	isLicenseBased: boolean;
	licenseExpiresAt: string | null;
	// Organization stats
	organizationsOwned: number;
	organizationsLimit: number;
}

/**
 * Feature flags (simplified from old model)
 */
export type Feature =
	| "data_capture"
	| "compliance_validation"
	| "report_generation"
	| "acknowledgment_tracking"
	| "advanced_roles"
	| "approval_flows"
	| "report_templates"
	| "priority_support";

/**
 * Features by plan
 */
export const PLAN_FEATURES: Record<PlanName, Feature[]> = {
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
	],
};

/**
 * Usage metric types for metered billing
 */
export type UsageMetric =
	| "reports"
	| "notices"
	| "alerts"
	| "operations"
	| "clients"
	| "users";

/**
 * Report usage input
 */
export interface ReportUsageInput {
	organizationId: string;
	metric: UsageMetric;
	count: number;
}
