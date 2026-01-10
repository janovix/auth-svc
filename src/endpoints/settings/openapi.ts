/**
 * OpenAPI documentation endpoints for Settings API
 */
import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

// Common schemas
const ThemeEnum = z.enum(["light", "dark", "system"]);
const LanguageEnum = z.enum(["en", "es"]);
const DateFormatEnum = z.enum([
	"MM/DD/YYYY",
	"DD/MM/YYYY",
	"YYYY-MM-DD",
	"DD.MM.YYYY",
]);
const SourceEnum = z.enum(["user", "organization", "browser", "default"]);

const PaymentMethodSchema = z.object({
	id: z.string().uuid(),
	type: z.enum(["card", "bank_account", "paypal"]),
	label: z.string(),
	last4: z.string().optional(),
	isDefault: z.boolean().optional(),
});

const UserSettingsSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	theme: ThemeEnum.nullable(),
	timezone: z.string().nullable(),
	language: LanguageEnum.nullable(),
	dateFormat: DateFormatEnum.nullable(),
	avatarUrl: z.string().url().nullable(),
	paymentMethods: z.array(PaymentMethodSchema),
	metadata: z.record(z.unknown()).nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const OrganizationSettingsSchema = z.object({
	id: z.string().uuid(),
	organizationId: z.string().uuid(),
	theme: ThemeEnum,
	timezone: z.string(),
	language: LanguageEnum,
	dateFormat: DateFormatEnum,
	avatarUrl: z.string().url().nullable(),
	metadata: z.record(z.unknown()).nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const ResolvedSettingsSchema = z.object({
	theme: ThemeEnum,
	timezone: z.string(),
	language: LanguageEnum,
	dateFormat: DateFormatEnum,
	avatarUrl: z.string().url().nullable(),
	paymentMethods: z.array(PaymentMethodSchema),
	sources: z.object({
		theme: SourceEnum,
		timezone: SourceEnum,
		language: SourceEnum,
		dateFormat: SourceEnum,
	}),
});

const ErrorResponseSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
});

/**
 * GET /api/settings/user - Get current user's settings
 */
export class GetUserSettingsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Settings"],
		summary: "Get current user's settings",
		operationId: "settings-get-user",
		responses: {
			"200": {
				description: "User settings",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: UserSettingsSchema.nullable(),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by settings routes");
	}
}

/**
 * PATCH /api/settings/user - Update current user's settings
 */
export class UpdateUserSettingsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Settings"],
		summary: "Update current user's settings",
		operationId: "settings-update-user",
		request: {
			body: contentJson(
				z.object({
					theme: ThemeEnum.nullable().optional(),
					timezone: z.string().nullable().optional(),
					language: LanguageEnum.nullable().optional(),
					dateFormat: DateFormatEnum.nullable().optional(),
					avatarUrl: z.string().url().nullable().optional(),
					paymentMethods: z.array(PaymentMethodSchema).optional(),
					metadata: z.record(z.unknown()).optional(),
				}),
			),
		},
		responses: {
			"200": {
				description: "Updated user settings",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: UserSettingsSchema,
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by settings routes");
	}
}

/**
 * GET /api/settings/organization/:orgId - Get organization settings
 */
export class GetOrganizationSettingsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Settings"],
		summary: "Get organization default settings",
		operationId: "settings-get-organization",
		request: {
			params: z.object({
				orgId: z.string().uuid(),
			}),
		},
		responses: {
			"200": {
				description: "Organization settings",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: OrganizationSettingsSchema.nullable(),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by settings routes");
	}
}

/**
 * PATCH /api/settings/organization/:orgId - Update organization settings
 */
export class UpdateOrganizationSettingsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Settings"],
		summary: "Update organization settings (admin only)",
		operationId: "settings-update-organization",
		request: {
			params: z.object({
				orgId: z.string().uuid(),
			}),
			body: contentJson(
				z.object({
					theme: ThemeEnum.optional(),
					timezone: z.string().optional(),
					language: LanguageEnum.optional(),
					dateFormat: DateFormatEnum.optional(),
					avatarUrl: z.string().url().nullable().optional(),
					metadata: z.record(z.unknown()).optional(),
				}),
			),
		},
		responses: {
			"200": {
				description: "Updated organization settings",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: OrganizationSettingsSchema,
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Admin access required",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by settings routes");
	}
}

/**
 * GET /api/settings/resolved - Get merged settings
 */
export class GetResolvedSettingsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Settings"],
		summary:
			"Get merged settings (org defaults + user overrides + browser hints)",
		operationId: "settings-get-resolved",
		request: {
			query: z.object({
				headers: z
					.string()
					.optional()
					.describe(
						"Base64-encoded JSON of browser headers for smart defaults",
					),
			}),
		},
		responses: {
			"200": {
				description: "Resolved settings with sources",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: ResolvedSettingsSchema,
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by settings routes");
	}
}
