/**
 * Subscription domain exports
 */

// Types
export type {
	PlanTier,
	SubscriptionStatus,
	Feature,
	UsageMetric,
	SubscriptionPlan,
	OrganizationSubscription,
	UsageCheckResult,
	FeatureCheckResult,
	SubscriptionStatusResponse,
	PlanComparison,
	Invoice,
	UsageRecord,
} from "./types";

// Schemas and schema-derived types (use Zod-inferred types)
export {
	planTierSchema,
	subscriptionStatusSchema,
	featureSchema,
	usageMetricSchema,
	createCheckoutInputSchema,
	changePlanInputSchema,
	reportUsageInputSchema,
	checkUsageInputSchema,
	checkFeatureInputSchema,
	updateBillingDetailsSchema,
} from "./schemas";

export type {
	CreateCheckoutInput,
	ChangePlanInput,
	ReportUsageInput,
	CheckUsageInput,
	CheckFeatureInput,
	UpdateBillingDetails,
} from "./schemas";

// Features
export {
	PLAN_FEATURES,
	PLAN_LIMITS,
	planHasFeature,
	getRequiredTierForFeature,
	comparePlanTiers,
	tierAtLeast,
	type PlanLimits,
} from "./features";

// Repository and Services
export { SubscriptionRepository } from "./repository";
export { SubscriptionService } from "./service";
export { UsageService } from "./usage-service";
