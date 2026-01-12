/**
 * Subscription domain Zod schemas
 */

import { z } from "zod";

/**
 * Plan tier enum
 */
export const planTierSchema = z.enum([
	"none",
	"free",
	"business",
	"pro",
	"enterprise",
]);

/**
 * Subscription status enum
 */
export const subscriptionStatusSchema = z.enum([
	"inactive",
	"trialing",
	"active",
	"past_due",
	"canceled",
	"unpaid",
]);

/**
 * Feature enum
 */
export const featureSchema = z.enum([
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
]);

/**
 * Usage metric enum
 */
export const usageMetricSchema = z.enum([
	"notices",
	"alerts",
	"transactions",
	"users",
]);

/**
 * Create checkout session input schema
 */
export const createCheckoutInputSchema = z.object({
	planId: z.string().min(1, "Plan ID is required"),
	successUrl: z.string().url("Success URL must be a valid URL"),
	cancelUrl: z.string().url("Cancel URL must be a valid URL"),
});

/**
 * Change plan input schema
 */
export const changePlanInputSchema = z.object({
	newPlanId: z.string().min(1, "New plan ID is required"),
});

/**
 * Report usage input schema
 */
export const reportUsageInputSchema = z.object({
	organizationId: z.string().uuid("Organization ID must be a valid UUID"),
	metric: usageMetricSchema,
	count: z.number().int().positive("Count must be a positive integer"),
});

/**
 * Check usage input schema
 */
export const checkUsageInputSchema = z.object({
	organizationId: z.string().uuid("Organization ID must be a valid UUID"),
	metric: usageMetricSchema,
});

/**
 * Check feature input schema
 */
export const checkFeatureInputSchema = z.object({
	organizationId: z.string().uuid("Organization ID must be a valid UUID"),
	feature: featureSchema,
});

/**
 * Update billing details schema
 */
export const updateBillingDetailsSchema = z.object({
	billingEmail: z.string().email().optional(),
	billingName: z.string().min(1).optional(),
});

// Type exports
export type CreateCheckoutInput = z.infer<typeof createCheckoutInputSchema>;
export type ChangePlanInput = z.infer<typeof changePlanInputSchema>;
export type ReportUsageInput = z.infer<typeof reportUsageInputSchema>;
export type CheckUsageInput = z.infer<typeof checkUsageInputSchema>;
export type CheckFeatureInput = z.infer<typeof checkFeatureInputSchema>;
export type UpdateBillingDetails = z.infer<typeof updateBillingDetailsSchema>;
