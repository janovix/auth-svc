/**
 * Audit service for business logic
 */
import { AuditRepository } from "./repository";
import {
	computeSignature,
	createSignaturePayload,
	verifyEntrySignature,
	generateChangeSummary,
} from "./signature";
import type {
	AuditLog,
	CreateAuditLogInput,
	AuditLogFilters,
	PaginationOptions,
	PaginatedResult,
	ChainIntegrityResult,
	ExportFormat,
} from "./types";

export class AuditService {
	private repository: AuditRepository;

	constructor(db: D1Database) {
		this.repository = new AuditRepository(db);
	}

	/**
	 * Create a new audit log entry
	 *
	 * This method:
	 * 1. Gets the latest entry's signature for chain linking
	 * 2. Generates change summary if not provided
	 * 3. Computes the cryptographic signature
	 * 4. Persists the entry
	 */
	async createLog(input: CreateAuditLogInput): Promise<AuditLog> {
		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();

		// Get the previous signature for chain linking
		const latestEntry = await this.repository.getLatestEntry();
		const previousSignature = latestEntry?.signature ?? null;

		// Generate change summary if not provided
		let changeSummary = input.changeSummary;
		if (!changeSummary && (input.previousState || input.newState)) {
			changeSummary = generateChangeSummary(
				input.previousState ?? null,
				input.newState ?? null,
			);
		}

		// Create signature payload and compute signature
		const signaturePayload = createSignaturePayload(
			id,
			input,
			createdAt,
			previousSignature,
		);
		const signature = await computeSignature(signaturePayload);

		// Persist the entry
		return this.repository.create(
			id,
			input.eventType,
			input.entityType,
			input.entityId ?? null,
			input.actorUserId ?? null,
			input.actorOrganizationId ?? null,
			input.actorIp ?? null,
			input.actorUserAgent ?? null,
			input.previousState ? JSON.stringify(input.previousState) : null,
			input.newState ? JSON.stringify(input.newState) : null,
			changeSummary ? JSON.stringify(changeSummary) : null,
			input.sourceService,
			input.requestId ?? null,
			input.metadata ? JSON.stringify(input.metadata) : null,
			signature,
			previousSignature,
			createdAt,
		);
	}

	/**
	 * Get audit log by ID
	 */
	async getById(id: string): Promise<AuditLog | null> {
		return this.repository.getById(id);
	}

	/**
	 * List audit logs with filters and pagination
	 */
	async list(
		filters: AuditLogFilters = {},
		pagination: PaginationOptions = {},
	): Promise<PaginatedResult<AuditLog>> {
		return this.repository.list(filters, pagination);
	}

	/**
	 * Verify the integrity of the audit log chain
	 *
	 * This method:
	 * 1. Retrieves entries in chronological order
	 * 2. Verifies each entry's signature matches its computed value
	 * 3. Verifies the chain links (previous_signature references)
	 */
	async verifyChainIntegrity(
		startId?: string,
		endId?: string,
		limit = 1000,
	): Promise<ChainIntegrityResult> {
		try {
			const entries = await this.repository.getChainSegment(
				startId,
				endId,
				limit,
			);

			if (entries.length === 0) {
				return {
					valid: true,
					totalVerified: 0,
				};
			}

			let previousSignature: string | null = null;

			// For the first entry, check if it's the genesis or has a valid previous
			if (entries[0].previousSignature) {
				// Verify the previous entry exists
				const prevEntry = await this.repository.getBySignature(
					entries[0].previousSignature,
				);
				if (!prevEntry) {
					return {
						valid: false,
						totalVerified: 0,
						brokenAt: entries[0].id,
						error: "First entry references non-existent previous signature",
					};
				}
				previousSignature = entries[0].previousSignature;
			}

			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];

				// Verify signature
				const verification = await verifyEntrySignature(
					entry,
					previousSignature,
				);

				if (!verification.valid) {
					return {
						valid: false,
						totalVerified: i,
						brokenAt: entry.id,
						brokenSignature: entry.signature,
						expectedSignature: verification.expectedSignature,
					};
				}

				previousSignature = entry.signature;
			}

			return {
				valid: true,
				totalVerified: entries.length,
			};
		} catch (error) {
			return {
				valid: false,
				totalVerified: 0,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Export audit logs in specified format
	 */
	async export(
		format: ExportFormat,
		filters: AuditLogFilters = {},
	): Promise<{ data: string; contentType: string; filename: string }> {
		const logs = await this.repository.getAllForExport(filters);
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

		if (format === "csv") {
			const csv = this.toCSV(logs);
			return {
				data: csv,
				contentType: "text/csv",
				filename: `audit-logs-${timestamp}.csv`,
			};
		}

		// Default to JSON
		return {
			data: JSON.stringify(logs, null, 2),
			contentType: "application/json",
			filename: `audit-logs-${timestamp}.json`,
		};
	}

	/**
	 * Convert audit logs to CSV format
	 */
	private toCSV(logs: AuditLog[]): string {
		const headers = [
			"id",
			"event_type",
			"entity_type",
			"entity_id",
			"actor_user_id",
			"actor_organization_id",
			"actor_ip",
			"source_service",
			"request_id",
			"signature",
			"previous_signature",
			"created_at",
		];

		const rows = logs.map((log) => [
			log.id,
			log.eventType,
			log.entityType,
			log.entityId ?? "",
			log.actorUserId ?? "",
			log.actorOrganizationId ?? "",
			log.actorIp ?? "",
			log.sourceService,
			log.requestId ?? "",
			log.signature,
			log.previousSignature ?? "",
			log.createdAt.toISOString(),
		]);

		const escapeCSV = (value: string) => {
			if (value.includes(",") || value.includes('"') || value.includes("\n")) {
				return `"${value.replace(/"/g, '""')}"`;
			}
			return value;
		};

		const csvRows = [
			headers.join(","),
			...rows.map((row) => row.map(escapeCSV).join(",")),
		];

		return csvRows.join("\n");
	}

	/**
	 * Helper to create audit log from context
	 * Used by other services via service binding
	 */
	async logFromContext(
		eventType: string,
		entityType: string,
		entityId: string | null,
		sourceService: string,
		options: {
			actorUserId?: string;
			actorOrganizationId?: string;
			actorIp?: string;
			actorUserAgent?: string;
			previousState?: Record<string, unknown>;
			newState?: Record<string, unknown>;
			requestId?: string;
			metadata?: Record<string, unknown>;
		} = {},
	): Promise<AuditLog> {
		return this.createLog({
			eventType,
			entityType,
			entityId,
			sourceService,
			...options,
		});
	}
}
