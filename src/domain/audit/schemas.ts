/**
 * Audit domain Zod schemas for validation
 */
import { z } from "zod";

/**
 * Event type enum schema
 */
export const auditEventTypeSchema = z.enum([
	"CREATE",
	"UPDATE",
	"DELETE",
	"LOGIN",
	"LOGOUT",
	"PASSWORD_RESET",
	"EMAIL_VERIFIED",
	"ROLE_CHANGE",
	"PERMISSION_CHANGE",
	"EXPORT",
	"IMPORT",
	"SYSTEM",
]);

/**
 * Entity type schema (allows custom types)
 */
export const auditEntityTypeSchema = z.string().min(1).max(50);

/**
 * Create audit log input schema
 */
export const createAuditLogSchema = z.object({
	eventType: z.string().min(1).max(50),
	entityType: auditEntityTypeSchema,
	entityId: z.string().nullable().optional(),
	actorUserId: z.string().uuid().nullable().optional(),
	actorOrganizationId: z.string().uuid().nullable().optional(),
	actorIp: z.string().nullable().optional(),
	actorUserAgent: z.string().nullable().optional(),
	previousState: z.record(z.unknown()).nullable().optional(),
	newState: z.record(z.unknown()).nullable().optional(),
	changeSummary: z.record(z.unknown()).nullable().optional(),
	sourceService: z.string().min(1).max(50),
	requestId: z.string().nullable().optional(),
	metadata: z.record(z.unknown()).nullable().optional(),
});

/**
 * Audit log filters schema
 */
export const auditLogFiltersSchema = z.object({
	eventType: z.string().optional(),
	entityType: z.string().optional(),
	entityId: z.string().optional(),
	actorUserId: z.string().uuid().optional(),
	actorOrganizationId: z.string().uuid().optional(),
	sourceService: z.string().optional(),
	startDate: z.string().datetime().optional(),
	endDate: z.string().datetime().optional(),
	search: z.string().optional(),
});

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Export request schema
 */
export const exportRequestSchema = z.object({
	format: z.enum(["json", "csv"]).default("json"),
	filters: auditLogFiltersSchema.optional(),
});

/**
 * Verify chain request schema
 */
export const verifyChainSchema = z.object({
	startId: z.string().uuid().optional(),
	endId: z.string().uuid().optional(),
	limit: z.coerce.number().int().min(1).max(10000).default(1000),
});
