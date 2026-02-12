/**
 * Pricing domain types
 *
 * Defines types for database-driven subscription plans, prices, and limits.
 * Replaces hardcoded PLAN_LIMITS from config.ts
 */

/**
 * Subscription plan definition
 */
export interface SubscriptionPlan {
	id: string;
	name: string; // internal name: "business", "pro"
	displayName: string; // Display name: "Janovix Business"
	description: string | null;
	isActive: boolean;
	sortOrder: number;
	trialDays: number;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Price types for plan pricing
 */
export type PriceType =
	| "subscription" // Base subscription price
	| "seat" // Per-user seat fee
	| "overage_report" // Per report overage
	| "overage_notice" // Per notice overage
	| "overage_alert" // Per alert overage
	| "overage_operation" // Per operation overage
	| "overage_client"; // Per client overage

/**
 * Plan price definition
 */
export interface PlanPrice {
	id: string;
	planId: string;
	stripePriceId: string;
	priceType: PriceType;
	amount: number; // Amount in cents
	currency: string;
	interval: string | null; // "month", "year", null for one-time
	intervalCount: number | null;
	description: string | null;
	isActive: boolean;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Plan limits definition
 */
export interface PlanLimits {
	id: string;
	planId: string;
	maxOrganizations: number;
	usersPerOrg: number;
	reportsPerMonth: number;
	noticesPerMonth: number;
	alertsPerMonth: number;
	operationsPerMonth: number;
	clientsPerMonth: number;
	watchlistQueriesPerDay: number;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Enterprise license with optional limit overrides
 */
export interface EnterpriseLicense {
	id: string;
	key: string;
	organizationName: string;
	userId: string | null;
	issuedBy: string | null;
	status: "active" | "revoked" | "expired" | "suspended" | "superseded";
	expiresAt: Date | null;
	activatedAt: Date | null;
	notes: string | null;
	// All limits explicit, no plan inheritance. 0 = unlimited.
	maxOrganizations: number;
	maxUsers: number;
	reportsPerMonth: number;
	noticesPerMonth: number;
	alertsPerMonth: number;
	operationsPerMonth: number;
	clientsPerMonth: number;
	watchlistQueriesPerDay: number;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Complete plan with limits and prices (for API responses)
 */
export interface PlanWithDetails {
	plan: SubscriptionPlan;
	limits: PlanLimits | null;
	prices: PlanPrice[];
}

/**
 * Public plan info (without sensitive priceIds)
 */
export interface PublicPlanInfo {
	id: string;
	name: string;
	displayName: string;
	description: string | null;
	trialDays: number;
	limits: {
		maxOrganizations: number;
		usersPerOrg: number;
		reportsPerMonth: number;
		noticesPerMonth: number;
		alertsPerMonth: number;
		operationsPerMonth: number;
		clientsPerMonth: number;
		watchlistQueriesPerDay: number;
	} | null;
	prices: Array<{
		priceType: PriceType;
		amount: number;
		currency: string;
		interval: string | null;
		description: string | null;
	}>;
}

/**
 * Effective limits (resolved from plan or license overrides)
 */
export interface EffectiveLimits {
	maxOrganizations: number;
	usersPerOrg: number;
	reportsPerMonth: number;
	noticesPerMonth: number;
	alertsPerMonth: number;
	operationsPerMonth: number;
	clientsPerMonth: number;
	watchlistQueriesPerDay: number;
	source: "plan" | "license";
	planName: string;
}

/**
 * Input for creating a new plan
 */
export interface CreatePlanInput {
	name: string;
	displayName: string;
	description?: string;
	isActive?: boolean;
	sortOrder?: number;
	trialDays?: number;
}

/**
 * Input for creating plan limits
 */
export interface CreatePlanLimitsInput {
	planId: string;
	maxOrganizations?: number;
	usersPerOrg?: number;
	reportsPerMonth?: number;
	noticesPerMonth?: number;
	alertsPerMonth?: number;
	operationsPerMonth?: number;
	clientsPerMonth?: number;
	watchlistQueriesPerDay?: number;
}

/**
 * Input for creating a plan price
 */
export interface CreatePlanPriceInput {
	planId: string;
	stripePriceId: string;
	priceType: PriceType;
	amount: number;
	currency?: string;
	interval?: string;
	intervalCount?: number;
	description?: string;
}

/**
 * Input for creating an enterprise license
 */
export interface CreateLicenseInput {
	key: string;
	organizationName: string;
	issuedBy?: string;
	notes?: string;
	expiresAt?: Date;
	// All limits default to 0 (unlimited) if not provided
	maxOrganizations?: number;
	maxUsers?: number;
	reportsPerMonth?: number;
	noticesPerMonth?: number;
	alertsPerMonth?: number;
	operationsPerMonth?: number;
	clientsPerMonth?: number;
	watchlistQueriesPerDay?: number;
}
