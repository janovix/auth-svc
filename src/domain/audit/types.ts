/**
 * Audit domain types
 */

/**
 * Event types for audit logging
 */
export type AuditEventType =
	| "CREATE"
	| "UPDATE"
	| "DELETE"
	| "LOGIN"
	| "LOGOUT"
	| "PASSWORD_RESET"
	| "EMAIL_VERIFIED"
	| "ROLE_CHANGE"
	| "PERMISSION_CHANGE"
	| "EXPORT"
	| "IMPORT"
	| "SYSTEM";

/**
 * Common entity types across services
 */
export type AuditEntityType =
	| "user"
	| "organization"
	| "member"
	| "invitation"
	| "session"
	| "settings"
	| "operation"
	| "client"
	| "alert"
	| "report"
	| "notice"
	| string; // Allow custom entity types from other services

/**
 * Audit log database row
 */
export interface AuditLogRow {
	id: string;
	event_type: string;
	entity_type: string;
	entity_id: string | null;
	actor_user_id: string | null;
	actor_organization_id: string | null;
	actor_ip: string | null;
	actor_user_agent: string | null;
	previous_state: string | null;
	new_state: string | null;
	change_summary: string | null;
	source_service: string;
	request_id: string | null;
	metadata: string | null;
	signature: string;
	previous_signature: string | null;
	created_at: string;
}

/**
 * Audit log domain model
 */
export interface AuditLog {
	id: string;
	eventType: AuditEventType | string;
	entityType: AuditEntityType;
	entityId: string | null;
	actorUserId: string | null;
	actorOrganizationId: string | null;
	actorIp: string | null;
	actorUserAgent: string | null;
	previousState: Record<string, unknown> | null;
	newState: Record<string, unknown> | null;
	changeSummary: Record<string, unknown> | null;
	sourceService: string;
	requestId: string | null;
	metadata: Record<string, unknown> | null;
	signature: string;
	previousSignature: string | null;
	createdAt: Date;
}

/**
 * Input for creating an audit log entry
 */
export interface CreateAuditLogInput {
	eventType: AuditEventType | string;
	entityType: AuditEntityType;
	entityId?: string | null;
	actorUserId?: string | null;
	actorOrganizationId?: string | null;
	actorIp?: string | null;
	actorUserAgent?: string | null;
	previousState?: Record<string, unknown> | null;
	newState?: Record<string, unknown> | null;
	changeSummary?: Record<string, unknown> | null;
	sourceService: string;
	requestId?: string | null;
	metadata?: Record<string, unknown> | null;
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
	eventType?: AuditEventType | string;
	entityType?: AuditEntityType;
	entityId?: string;
	actorUserId?: string;
	actorOrganizationId?: string;
	sourceService?: string;
	startDate?: Date;
	endDate?: Date;
	search?: string; // Search in entity_id, metadata
}

/**
 * Pagination options
 */
export interface PaginationOptions {
	page?: number;
	limit?: number;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

/**
 * Chain integrity verification result
 */
export interface ChainIntegrityResult {
	valid: boolean;
	totalVerified: number;
	brokenAt?: string; // ID of the first broken entry
	brokenSignature?: string;
	expectedSignature?: string;
	error?: string;
}

/**
 * Export format options
 */
export type ExportFormat = "json" | "csv";

/**
 * Field-level change for change summary
 */
export interface FieldChange {
	field: string;
	oldValue: unknown;
	newValue: unknown;
}
