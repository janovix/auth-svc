/**
 * OpenAPI documentation endpoints for AML Compliance Settings Proxy API
 */
import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

// Common schemas
const ErrorResponseSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
	message: z.string().optional(),
});

// AML Compliance Settings schema (proxied from aml-svc)
const AmlComplianceSettingsSchema = z.object({
	id: z.string().uuid().optional(),
	organizationId: z.string().uuid(),
	rfc: z.string().nullable(),
	vulnerableActivity: z.boolean(),
	createdAt: z.string().datetime().optional(),
	updatedAt: z.string().datetime().optional(),
});

/**
 * GET /api/settings/aml-compliance/:orgId - Get AML compliance settings
 */
export class GetAmlComplianceSettingsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["AML Settings"],
		summary: "Get AML compliance settings for an organization",
		operationId: "aml-settings-get",
		request: {
			params: z.object({
				orgId: z.string().uuid(),
			}),
		},
		responses: {
			"200": {
				description: "AML compliance settings",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: AmlComplianceSettingsSchema.nullable(),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Not a member of this organization",
				...contentJson(ErrorResponseSchema),
			},
			"404": {
				description: "Settings not found",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.null(),
					}),
				),
			},
			"503": {
				description: "AML service not available",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by AML settings proxy routes");
	}
}

/**
 * PUT /api/settings/aml-compliance/:orgId - Create or update AML compliance settings
 */
export class PutAmlComplianceSettingsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["AML Settings"],
		summary: "Create or update AML compliance settings (owner/admin only)",
		operationId: "aml-settings-put",
		request: {
			params: z.object({
				orgId: z.string().uuid(),
			}),
			body: contentJson(
				z.object({
					rfc: z.string().nullable().optional(),
					vulnerableActivity: z.boolean().optional(),
				}),
			),
		},
		responses: {
			"200": {
				description: "AML compliance settings updated",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: AmlComplianceSettingsSchema,
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Owner or admin access required",
				...contentJson(ErrorResponseSchema),
			},
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
			"503": {
				description: "AML service not available",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by AML settings proxy routes");
	}
}

/**
 * PATCH /api/settings/aml-compliance/:orgId - Partial update AML compliance settings
 */
export class PatchAmlComplianceSettingsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["AML Settings"],
		summary: "Partial update AML compliance settings (owner/admin only)",
		operationId: "aml-settings-patch",
		request: {
			params: z.object({
				orgId: z.string().uuid(),
			}),
			body: contentJson(
				z.object({
					rfc: z.string().nullable().optional(),
					vulnerableActivity: z.boolean().optional(),
				}),
			),
		},
		responses: {
			"200": {
				description: "AML compliance settings updated",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: AmlComplianceSettingsSchema,
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Owner or admin access required",
				...contentJson(ErrorResponseSchema),
			},
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
			"503": {
				description: "AML service not available",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by AML settings proxy routes");
	}
}
