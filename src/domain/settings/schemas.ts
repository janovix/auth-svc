/**
 * Settings domain Zod schemas for validation
 */
import { z } from "zod";

/**
 * Theme enum schema
 */
export const themeSchema = z.enum(["light", "dark", "system"]);

/**
 * Date format enum schema
 */
export const dateFormatSchema = z.enum([
	"MM/DD/YYYY",
	"DD/MM/YYYY",
	"YYYY-MM-DD",
	"DD.MM.YYYY",
]);

/**
 * Language code enum schema
 */
export const languageCodeSchema = z.enum(["en", "es"]);

/**
 * IANA timezone validation (basic pattern)
 */
export const timezoneSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z_]+\/[A-Za-z_]+$|^UTC$|^GMT$/, {
		message: "Invalid IANA timezone format",
	});

/**
 * Payment method schema
 */
export const paymentMethodSchema = z.object({
	id: z.string().uuid(),
	type: z.enum(["card", "bank_account", "paypal"]),
	label: z.string().min(1).max(100),
	last4: z.string().length(4).optional(),
	isDefault: z.boolean().optional(),
});

/**
 * Update organization settings input schema
 */
export const updateOrganizationSettingsSchema = z.object({
	theme: themeSchema.optional(),
	timezone: timezoneSchema.optional(),
	language: languageCodeSchema.optional(),
	dateFormat: dateFormatSchema.optional(),
	avatarUrl: z.string().url().nullable().optional(),
	metadata: z.record(z.unknown()).optional(),
});

/**
 * Update user settings input schema
 */
export const updateUserSettingsSchema = z.object({
	theme: themeSchema.nullable().optional(),
	timezone: timezoneSchema.nullable().optional(),
	language: languageCodeSchema.nullable().optional(),
	dateFormat: dateFormatSchema.nullable().optional(),
	avatarUrl: z.string().url().nullable().optional(),
	paymentMethods: z.array(paymentMethodSchema).optional(),
	metadata: z.record(z.unknown()).optional(),
});

/**
 * Browser hints schema for service binding
 */
export const browserHintsSchema = z.object({
	language: z.string().optional(),
	timezone: z.string().optional(),
	theme: themeSchema.optional(),
});

/**
 * Resolved settings query params schema
 */
export const resolvedSettingsQuerySchema = z.object({
	userId: z.string().uuid(),
	orgId: z.string().uuid().optional(),
	headers: z.string().optional(), // Base64 encoded headers JSON
});
