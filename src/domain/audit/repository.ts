/**
 * Audit repository for database operations
 */
import type {
	AuditLog,
	AuditLogRow,
	AuditLogFilters,
	PaginationOptions,
	PaginatedResult,
} from "./types";

/**
 * Maps audit log database row to domain model
 */
function mapAuditLogRow(row: AuditLogRow): AuditLog {
	return {
		id: row.id,
		eventType: row.event_type,
		entityType: row.entity_type,
		entityId: row.entity_id,
		actorUserId: row.actor_user_id,
		actorOrganizationId: row.actor_organization_id,
		actorIp: row.actor_ip,
		actorUserAgent: row.actor_user_agent,
		previousState: row.previous_state ? JSON.parse(row.previous_state) : null,
		newState: row.new_state ? JSON.parse(row.new_state) : null,
		changeSummary: row.change_summary ? JSON.parse(row.change_summary) : null,
		sourceService: row.source_service,
		requestId: row.request_id,
		metadata: row.metadata ? JSON.parse(row.metadata) : null,
		signature: row.signature,
		previousSignature: row.previous_signature,
		createdAt: new Date(row.created_at),
	};
}

export class AuditRepository {
	constructor(private db: D1Database) {}

	/**
	 * Get the latest audit log entry (for signature chain)
	 */
	async getLatestEntry(): Promise<AuditLog | null> {
		const result = await this.db
			.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1`)
			.first<AuditLogRow>();

		return result ? mapAuditLogRow(result) : null;
	}

	/**
	 * Get audit log by ID
	 */
	async getById(id: string): Promise<AuditLog | null> {
		const result = await this.db
			.prepare(`SELECT * FROM audit_logs WHERE id = ? LIMIT 1`)
			.bind(id)
			.first<AuditLogRow>();

		return result ? mapAuditLogRow(result) : null;
	}

	/**
	 * Get audit log by signature
	 */
	async getBySignature(signature: string): Promise<AuditLog | null> {
		const result = await this.db
			.prepare(`SELECT * FROM audit_logs WHERE signature = ? LIMIT 1`)
			.bind(signature)
			.first<AuditLogRow>();

		return result ? mapAuditLogRow(result) : null;
	}

	/**
	 * Create a new audit log entry
	 */
	async create(
		id: string,
		eventType: string,
		entityType: string,
		entityId: string | null,
		actorUserId: string | null,
		actorOrganizationId: string | null,
		actorIp: string | null,
		actorUserAgent: string | null,
		previousState: string | null,
		newState: string | null,
		changeSummary: string | null,
		sourceService: string,
		requestId: string | null,
		metadata: string | null,
		signature: string,
		previousSignature: string | null,
		createdAt: string,
	): Promise<AuditLog> {
		await this.db
			.prepare(
				`INSERT INTO audit_logs 
				(id, event_type, entity_type, entity_id, actor_user_id, actor_organization_id,
				 actor_ip, actor_user_agent, previous_state, new_state, change_summary,
				 source_service, request_id, metadata, signature, previous_signature, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				eventType,
				entityType,
				entityId,
				actorUserId,
				actorOrganizationId,
				actorIp,
				actorUserAgent,
				previousState,
				newState,
				changeSummary,
				sourceService,
				requestId,
				metadata,
				signature,
				previousSignature,
				createdAt,
			)
			.run();

		const result = await this.getById(id);
		if (!result) {
			throw new Error("Failed to create audit log entry");
		}
		return result;
	}

	/**
	 * List audit logs with filters and pagination
	 */
	async list(
		filters: AuditLogFilters = {},
		pagination: PaginationOptions = {},
	): Promise<PaginatedResult<AuditLog>> {
		const { page = 1, limit = 20 } = pagination;
		const offset = (page - 1) * limit;

		// Build WHERE clause
		const conditions: string[] = [];
		const values: unknown[] = [];

		if (filters.eventType) {
			conditions.push("event_type = ?");
			values.push(filters.eventType);
		}
		if (filters.entityType) {
			conditions.push("entity_type = ?");
			values.push(filters.entityType);
		}
		if (filters.entityId) {
			conditions.push("entity_id = ?");
			values.push(filters.entityId);
		}
		if (filters.actorUserId) {
			conditions.push("actor_user_id = ?");
			values.push(filters.actorUserId);
		}
		if (filters.actorOrganizationId) {
			conditions.push("actor_organization_id = ?");
			values.push(filters.actorOrganizationId);
		}
		if (filters.sourceService) {
			conditions.push("source_service = ?");
			values.push(filters.sourceService);
		}
		if (filters.startDate) {
			conditions.push("created_at >= ?");
			values.push(filters.startDate.toISOString());
		}
		if (filters.endDate) {
			conditions.push("created_at <= ?");
			values.push(filters.endDate.toISOString());
		}
		if (filters.search) {
			conditions.push(
				"(entity_id LIKE ? OR metadata LIKE ? OR request_id LIKE ?)",
			);
			const searchPattern = `%${filters.search}%`;
			values.push(searchPattern, searchPattern, searchPattern);
		}

		const whereClause =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

		// Get total count
		const countResult = await this.db
			.prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`)
			.bind(...values)
			.first<{ count: number }>();
		const total = countResult?.count ?? 0;

		// Get paginated results
		const queryValues = [...values, limit, offset];
		const results = await this.db
			.prepare(
				`SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
			)
			.bind(...queryValues)
			.all<AuditLogRow>();

		return {
			data: (results.results ?? []).map(mapAuditLogRow),
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Get audit logs for chain verification (ordered by creation time)
	 */
	async getChainSegment(
		startId?: string,
		endId?: string,
		limit = 1000,
	): Promise<AuditLog[]> {
		let query = `SELECT * FROM audit_logs`;
		const conditions: string[] = [];
		const values: unknown[] = [];

		if (startId) {
			// Get the created_at of the start entry
			const startEntry = await this.getById(startId);
			if (startEntry) {
				conditions.push("created_at >= ?");
				values.push(startEntry.createdAt.toISOString());
			}
		}

		if (endId) {
			const endEntry = await this.getById(endId);
			if (endEntry) {
				conditions.push("created_at <= ?");
				values.push(endEntry.createdAt.toISOString());
			}
		}

		if (conditions.length > 0) {
			query += ` WHERE ${conditions.join(" AND ")}`;
		}

		query += ` ORDER BY created_at ASC LIMIT ?`;
		values.push(limit);

		const results = await this.db
			.prepare(query)
			.bind(...values)
			.all<AuditLogRow>();

		return (results.results ?? []).map(mapAuditLogRow);
	}

	/**
	 * Get all audit logs for export (with filters)
	 */
	async getAllForExport(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
		// Build WHERE clause
		const conditions: string[] = [];
		const values: unknown[] = [];

		if (filters.eventType) {
			conditions.push("event_type = ?");
			values.push(filters.eventType);
		}
		if (filters.entityType) {
			conditions.push("entity_type = ?");
			values.push(filters.entityType);
		}
		if (filters.entityId) {
			conditions.push("entity_id = ?");
			values.push(filters.entityId);
		}
		if (filters.actorUserId) {
			conditions.push("actor_user_id = ?");
			values.push(filters.actorUserId);
		}
		if (filters.actorOrganizationId) {
			conditions.push("actor_organization_id = ?");
			values.push(filters.actorOrganizationId);
		}
		if (filters.sourceService) {
			conditions.push("source_service = ?");
			values.push(filters.sourceService);
		}
		if (filters.startDate) {
			conditions.push("created_at >= ?");
			values.push(filters.startDate.toISOString());
		}
		if (filters.endDate) {
			conditions.push("created_at <= ?");
			values.push(filters.endDate.toISOString());
		}

		const whereClause =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

		const results = await this.db
			.prepare(
				`SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC`,
			)
			.bind(...values)
			.all<AuditLogRow>();

		return (results.results ?? []).map(mapAuditLogRow);
	}
}
