/**
 * Enterprise License Zod schemas
 */

import { z } from "zod";
import { featureSchema } from "../subscription/schemas";

/**
 * License limits schema
 */
export const licenseLimitsSchema = z.object({
	noticesPerMonth: z
		.number()
		.int()
		.positive("Notices per month must be positive"),
	maxUsers: z.number().int().positive("Max users must be positive"),
	maxTransactions: z.number().int().positive().optional(),
	maxAlerts: z.number().int().positive().optional(),
});

/**
 * Generate license input schema
 */
export const generateLicenseInputSchema = z.object({
	customerName: z.string().min(1, "Customer name is required"),
	limits: licenseLimitsSchema,
	features: z.array(featureSchema).min(1, "At least one feature is required"),
	notes: z.string().optional(),
	stripeCustomerId: z.string().optional(),
	stripeYearlyPrice: z.number().int().positive().optional(),
});

/**
 * Activate license input schema
 */
export const activateLicenseInputSchema = z.object({
	licenseKey: z.string().min(100, "Invalid license key format"),
});

/**
 * Verify license input schema
 */
export const verifyLicenseInputSchema = z.object({
	licenseKey: z.string().min(100, "Invalid license key format"),
});

/**
 * Revoke license input schema
 */
export const revokeLicenseInputSchema = z.object({
	reason: z.string().optional(),
});

// Type exports
export type GenerateLicenseInput = z.infer<typeof generateLicenseInputSchema>;
export type ActivateLicenseInput = z.infer<typeof activateLicenseInputSchema>;
export type VerifyLicenseInput = z.infer<typeof verifyLicenseInputSchema>;
export type RevokeLicenseInput = z.infer<typeof revokeLicenseInputSchema>;
