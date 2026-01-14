/**
 * Subscription domain types - User-based billing model
 *
 * BILLING MODEL:
 * - Users are Stripe customers (not organizations)
 * - User's subscription determines:
 *   - How many organizations they can own (maxOrganizations)
 *   - Usage limits per organization (notices, users, etc.)
 * - Usage is tracked per organization, billed to the owner
 */

/**
 * Plan names matching Better Auth Stripe plugin configuration
 */
export type PlanName = "business" | "pro";

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
 */
export interface PlanLimits {
	maxOrganizations: number;
	noticesPerMonth: number;
	usersPerOrg: number;
	alertsPerMonth: number | null; // null = unlimited
	transactionsPerMonth: number | null; // null = unlimited
}

/**
 * Organization usage tracking record
 */
export interface OrganizationUsage {
	id: string;
	organizationId: string;
	ownerUserId: string;
	noticesUsed: number;
	alertsUsed: number;
	transactionsUsed: number;
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
};

/**
 * Usage metric types
 */
export type UsageMetric = "notices" | "alerts" | "transactions" | "users";

/**
 * Report usage input
 */
export interface ReportUsageInput {
	organizationId: string;
	metric: UsageMetric;
	count: number;
}
