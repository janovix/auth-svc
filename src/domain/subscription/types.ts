/**
 * Subscription domain types
 */

/**
 * Plan tier
 */
export type PlanTier = "none" | "business" | "pro" | "enterprise";

/**
 * Subscription status
 */
export type SubscriptionStatus =
	| "inactive"
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "unpaid";

/**
 * Feature flags
 */
export type Feature =
	| "data_capture"
	| "compliance_validation"
	| "report_generation"
	| "acknowledgment_tracking"
	| "advanced_roles"
	| "approval_flows"
	| "report_templates"
	| "priority_support"
	| "sso"
	| "custom_branding"
	| "audit_export"
	| "api_access"
	| "dedicated_support"
	| "custom_integrations";

/**
 * Usage metric types
 */
export type UsageMetric = "notices" | "alerts" | "transactions" | "users";

/**
 * Subscription plan from database
 */
export interface SubscriptionPlan {
	id: string;
	name: string;
	tier: PlanTier;
	billingInterval: "month" | "year";
	stripePriceId: string;
	basePrice: number;
	noticesIncluded: number;
	usersIncluded: number;
	transactionsIncluded: number | null;
	alertsIncluded: number | null;
	overagePriceId: string | null;
	overagePrice: number | null;
	features: Feature[];
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Organization subscription with plan details
 */
export interface OrganizationSubscription {
	id: string;
	organizationId: string;
	stripeCustomerId: string;
	planId: string | null;
	stripeSubscriptionId: string | null;
	stripeSubscriptionItemId: string | null;
	status: SubscriptionStatus;
	currentPeriodStart: Date | null;
	currentPeriodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	noticesUsed: number;
	alertsUsed: number;
	transactionsUsed: number;
	usersCount: number;
	licenseId: string | null;
	billingEmail: string | null;
	billingName: string | null;
	createdAt: Date;
	updatedAt: Date;
	plan?: SubscriptionPlan | null;
}

/**
 * Usage check result
 */
export interface UsageCheckResult {
	allowed: boolean;
	used: number;
	included: number;
	remaining: number;
	overage: number;
	planTier: PlanTier;
}

/**
 * Feature check result
 */
export interface FeatureCheckResult {
	allowed: boolean;
	planTier: PlanTier;
	requiredTier?: PlanTier;
}

/**
 * Full subscription status (for API response)
 */
export interface SubscriptionStatusResponse {
	hasSubscription: boolean;
	isEnterprise: boolean;
	status: SubscriptionStatus;
	planTier: PlanTier;
	planName: string | null;
	currentPeriodStart: string | null;
	currentPeriodEnd: string | null;
	cancelAtPeriodEnd: boolean;
	usage: {
		notices: UsageCheckResult;
		users: UsageCheckResult;
		alerts?: UsageCheckResult;
		transactions?: UsageCheckResult;
	};
	features: Feature[];
	stripeCustomerId: string;
}

/**
 * Plan comparison for UI
 */
export interface PlanComparison {
	id: string;
	name: string;
	tier: PlanTier;
	monthlyPrice: number;
	noticesIncluded: number;
	usersIncluded: number;
	overagePrice: number | null;
	features: Feature[];
	recommended?: boolean;
}

/**
 * Invoice from Stripe
 */
export interface Invoice {
	id: string;
	number: string | null;
	status: string;
	amountDue: number;
	amountPaid: number;
	currency: string;
	periodStart: number;
	periodEnd: number;
	created: number;
	hostedInvoiceUrl: string | null;
	invoicePdf: string | null;
}

/**
 * Usage record from database
 */
export interface UsageRecord {
	id: string;
	organizationId: string;
	subscriptionId: string;
	periodStart: Date;
	periodEnd: Date;
	noticesCreated: number;
	alertsCreated: number;
	transactionsCreated: number;
	noticesOverage: number;
	overageReportedAt: Date | null;
	stripeUsageRecordIds: string[] | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Create checkout session input
 */
export interface CreateCheckoutInput {
	organizationId: string;
	planId: string;
	successUrl: string;
	cancelUrl: string;
}

/**
 * Change plan input
 */
export interface ChangePlanInput {
	organizationId: string;
	newPlanId: string;
}

/**
 * Report usage input
 */
export interface ReportUsageInput {
	organizationId: string;
	metric: UsageMetric;
	count: number;
}
