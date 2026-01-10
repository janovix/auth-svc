/**
 * OpenAPI documentation endpoints for Audit API
 */
import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

// Common schemas
const AuditLogSchema = z.object({
	id: z.string().uuid(),
	eventType: z.string(),
	entityType: z.string(),
	entityId: z.string().nullable(),
	actorUserId: z.string().uuid().nullable(),
	actorOrganizationId: z.string().uuid().nullable(),
	actorIp: z.string().nullable(),
	actorUserAgent: z.string().nullable(),
	previousState: z.record(z.unknown()).nullable(),
	newState: z.record(z.unknown()).nullable(),
	changeSummary: z.record(z.unknown()).nullable(),
	sourceService: z.string(),
	requestId: z.string().nullable(),
	metadata: z.record(z.unknown()).nullable(),
	signature: z.string(),
	previousSignature: z.string().nullable(),
	createdAt: z.string().datetime(),
});

const PaginationSchema = z.object({
	page: z.number(),
	limit: z.number(),
	total: z.number(),
	totalPages: z.number(),
});

const ChainIntegritySchema = z.object({
	valid: z.boolean(),
	totalVerified: z.number(),
	brokenAt: z.string().optional(),
	brokenSignature: z.string().optional(),
	expectedSignature: z.string().optional(),
	error: z.string().optional(),
});

const ErrorResponseSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
});

/**
 * GET /api/audit - List audit logs
 */
export class ListAuditLogsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Audit"],
		summary: "List audit logs with filters and pagination (admin only)",
		operationId: "audit-list",
		request: {
			query: z.object({
				eventType: z.string().optional(),
				entityType: z.string().optional(),
				entityId: z.string().optional(),
				actorUserId: z.string().uuid().optional(),
				actorOrganizationId: z.string().uuid().optional(),
				sourceService: z.string().optional(),
				startDate: z.string().datetime().optional(),
				endDate: z.string().datetime().optional(),
				search: z.string().optional(),
				page: z.coerce.number().int().min(1).default(1),
				limit: z.coerce.number().int().min(1).max(100).default(20),
			}),
		},
		responses: {
			"200": {
				description: "Paginated list of audit logs",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.array(AuditLogSchema),
						pagination: PaginationSchema,
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
		throw new Error("This endpoint is handled by audit routes");
	}
}

/**
 * GET /api/audit/:id - Get single audit log
 */
export class GetAuditLogEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Audit"],
		summary: "Get single audit log entry (admin only)",
		operationId: "audit-get",
		request: {
			params: z.object({
				id: z.string().uuid(),
			}),
		},
		responses: {
			"200": {
				description: "Audit log entry",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: AuditLogSchema,
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
				description: "Audit log not found",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by audit routes");
	}
}

/**
 * GET /api/audit/verify - Verify chain integrity
 */
export class VerifyAuditChainEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Audit"],
		summary: "Verify audit log chain integrity (admin only)",
		operationId: "audit-verify",
		request: {
			query: z.object({
				startId: z
					.string()
					.uuid()
					.optional()
					.describe("Start verification from this entry ID"),
				endId: z
					.string()
					.uuid()
					.optional()
					.describe("End verification at this entry ID"),
				limit: z.coerce
					.number()
					.int()
					.min(1)
					.max(10000)
					.default(1000)
					.describe("Maximum entries to verify"),
			}),
		},
		responses: {
			"200": {
				description: "Chain integrity verification result",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: ChainIntegritySchema,
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
		throw new Error("This endpoint is handled by audit routes");
	}
}

/**
 * POST /api/audit/export - Export audit logs
 */
export class ExportAuditLogsEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Audit"],
		summary: "Export audit logs as JSON or CSV (admin only)",
		operationId: "audit-export",
		request: {
			body: contentJson(
				z.object({
					format: z.enum(["json", "csv"]).default("json"),
					filters: z
						.object({
							eventType: z.string().optional(),
							entityType: z.string().optional(),
							entityId: z.string().optional(),
							actorUserId: z.string().uuid().optional(),
							actorOrganizationId: z.string().uuid().optional(),
							sourceService: z.string().optional(),
							startDate: z.string().datetime().optional(),
							endDate: z.string().datetime().optional(),
						})
						.optional(),
				}),
			),
		},
		responses: {
			"200": {
				description: "Exported audit logs file",
				content: {
					"application/json": {
						schema: { type: "object" as const },
					},
					"text/csv": {
						schema: { type: "string" as const },
					},
				},
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
		throw new Error("This endpoint is handled by audit routes");
	}
}
