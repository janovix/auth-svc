/**
 * OpenAPI documentation endpoints for License API
 */
import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import {
	generateLicenseInputSchema,
	activateLicenseInputSchema,
	licenseLimitsSchema,
} from "../../domain/license/schemas";
import { featureSchema } from "../../domain/subscription/schemas";

// Common schemas
const ErrorResponseSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
	message: z.string().optional(),
	details: z.array(z.unknown()).optional(),
});

const LicenseStatusSchema = z.object({
	id: z.string().uuid(),
	customerName: z.string().nullable(),
	organizationId: z.string().uuid().nullable(),
	noticesPerMonth: z.number(),
	maxUsers: z.number(),
	maxTransactions: z.number().nullable(),
	maxAlerts: z.number().nullable(),
	features: z.array(featureSchema),
	issuedAt: z.string().datetime(),
	activatedAt: z.string().datetime().nullable(),
	expiresAt: z.string().datetime(),
	revokedAt: z.string().datetime().nullable(),
	stripeSubscriptionId: z.string().nullable(),
	isActive: z.boolean(),
	isExpired: z.boolean(),
	isRevoked: z.boolean(),
});

const LicenseListItemSchema = z.object({
	id: z.string().uuid(),
	customerName: z.string().nullable(),
	organizationId: z.string().uuid().nullable(),
	noticesPerMonth: z.number(),
	maxUsers: z.number(),
	maxTransactions: z.number().nullable(),
	maxAlerts: z.number().nullable(),
	features: z.array(featureSchema),
	issuedAt: z.string().datetime(),
	activatedAt: z.string().datetime().nullable(),
	expiresAt: z.string().datetime(),
	revokedAt: z.string().datetime().nullable(),
	stripeSubscriptionId: z.string().nullable(),
});

/**
 * GET /api/licenses - List all enterprise licenses (admin only)
 */
export class ListLicensesEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["License"],
		summary: "List all enterprise licenses (admin only)",
		operationId: "license-list",
		responses: {
			"200": {
				description: "List of licenses",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.array(LicenseListItemSchema),
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
		throw new Error("This endpoint is handled by license routes");
	}
}

/**
 * POST /api/licenses/generate - Generate a new enterprise license (admin only)
 */
export class GenerateLicenseEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["License"],
		summary: "Generate a new enterprise license (admin only)",
		operationId: "license-generate",
		request: {
			body: contentJson(generateLicenseInputSchema),
		},
		responses: {
			"200": {
				description: "License generated",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.object({
							id: z.string().uuid(),
							licenseKey: z.string(),
							customerName: z.string().nullable(),
							expiresAt: z.string().datetime(),
							stripeSubscriptionId: z.string().nullable(),
							stripeInvoiceId: z.string().nullable(),
						}),
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
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by license routes");
	}
}

/**
 * GET /api/licenses/:id - Get license details (admin only)
 */
export class GetLicenseEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["License"],
		summary: "Get license details (admin only)",
		operationId: "license-get",
		request: {
			params: z.object({
				id: z.string().uuid(),
			}),
		},
		responses: {
			"200": {
				description: "License details",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: LicenseStatusSchema,
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
			"404": {
				description: "License not found",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by license routes");
	}
}

/**
 * POST /api/licenses/:id/revoke - Revoke a license (admin only)
 */
export class RevokeLicenseEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["License"],
		summary: "Revoke a license (admin only)",
		operationId: "license-revoke",
		request: {
			params: z.object({
				id: z.string().uuid(),
			}),
		},
		responses: {
			"200": {
				description: "License revoked successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						message: z.string(),
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
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by license routes");
	}
}

/**
 * POST /api/licenses/:id/renew - Renew a license (admin only)
 */
export class RenewLicenseEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["License"],
		summary: "Renew a license for another year (admin only)",
		operationId: "license-renew",
		request: {
			params: z.object({
				id: z.string().uuid(),
			}),
		},
		responses: {
			"200": {
				description: "License renewed",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.object({
							id: z.string().uuid(),
							expiresAt: z.string().datetime(),
						}),
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
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by license routes");
	}
}

/**
 * POST /api/licenses/activate - Activate a license for the current organization
 */
export class ActivateLicenseEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["License"],
		summary: "Activate a license for the current organization (org owner only)",
		operationId: "license-activate",
		request: {
			body: contentJson(activateLicenseInputSchema),
		},
		responses: {
			"200": {
				description: "License activated",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.object({
							id: z.string().uuid(),
							customerName: z.string().nullable(),
							expiresAt: z.string().datetime(),
							limits: licenseLimitsSchema,
							features: z.array(featureSchema),
						}),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Owner access required",
				...contentJson(ErrorResponseSchema),
			},
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by license routes");
	}
}

/**
 * POST /api/licenses/verify - Verify a license key
 */
export class VerifyLicenseEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["License"],
		summary: "Verify a license key (public endpoint for offline verification)",
		operationId: "license-verify",
		request: {
			body: contentJson(
				z.object({
					licenseKey: z.string().min(100, "Invalid license key format"),
				}),
			),
		},
		responses: {
			"200": {
				description: "License verification result",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.object({
							valid: z.boolean(),
							expired: z.boolean(),
							revoked: z.boolean(),
							error: z.string().nullable(),
							limits: licenseLimitsSchema.optional(),
							features: z.array(featureSchema).optional(),
							expiresAt: z.string().datetime().optional(),
						}),
					}),
				),
			},
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by license routes");
	}
}

/**
 * GET /api/licenses/current - Get current organization's license status
 */
export class GetCurrentLicenseEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["License"],
		summary: "Get the current organization's license status",
		operationId: "license-get-current",
		responses: {
			"200": {
				description: "Current license status",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: LicenseStatusSchema.nullable(),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"400": {
				description: "No active organization",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by license routes");
	}
}
