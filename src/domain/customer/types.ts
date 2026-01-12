/**
 * Customer domain types
 *
 * Types for Stripe Customer management and organization billing
 */

/**
 * Stripe Customer metadata synced with organization
 */
export interface StripeCustomerMetadata {
	organizationId: string;
	organizationName: string;
	organizationSlug: string;
	rfc?: string;
	planType?: "none" | "free" | "business" | "pro" | "enterprise";
	isEnterprise?: "true" | "false";
}

/**
 * Stripe Customer data returned from API
 */
export interface StripeCustomer {
	id: string;
	email: string | null;
	name: string | null;
	metadata: StripeCustomerMetadata;
	created: number;
	currency: string | null;
	defaultSource: string | null;
	invoicePrefix: string | null;
}

/**
 * Input for creating a Stripe Customer
 */
export interface CreateCustomerInput {
	organizationId: string;
	organizationName: string;
	organizationSlug: string;
	email?: string;
	rfc?: string;
}

/**
 * Input for updating a Stripe Customer
 */
export interface UpdateCustomerInput {
	email?: string;
	name?: string;
	organizationName?: string;
	organizationSlug?: string;
	rfc?: string;
	planType?: "none" | "free" | "business" | "pro" | "enterprise";
}

/**
 * Customer Portal session result
 */
export interface CustomerPortalSession {
	id: string;
	url: string;
	created: number;
	expiresAt: number;
}

/**
 * Organization subscription record from database
 */
export interface OrganizationSubscriptionRecord {
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
}

/**
 * Subscription status values
 */
export type SubscriptionStatus =
	| "inactive"
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "unpaid";

/**
 * Plan tier enum
 */
export type PlanTier = "none" | "free" | "business" | "pro" | "enterprise";
