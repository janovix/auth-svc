/**
 * API Keys repository for database operations
 */
import type { ApiKey, ApiKeyRow, CreateApiKeyInput } from "./types";

/** Maps database row to domain model */
function mapApiKeyRow(row: ApiKeyRow): ApiKey {
	return {
		id: row.id,
		name: row.name,
		keyPrefix: row.key_prefix,
		organizationId: row.organization_id,
		createdById: row.created_by_id,
		lastUsedAt: row.last_used_at,
		expiresAt: row.expires_at,
		revokedAt: row.revoked_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class ApiKeyRepository {
	constructor(private readonly db: D1Database) {}

	/** Find an active (non-revoked, non-expired) API key by its hash */
	async findActiveByHash(keyHash: string): Promise<ApiKey | null> {
		const row = await this.db
			.prepare(
				`SELECT * FROM api_keys
				 WHERE key_hash = ?
				   AND revoked_at IS NULL
				   AND (expires_at IS NULL OR expires_at > datetime('now'))
				 LIMIT 1`,
			)
			.bind(keyHash)
			.first<ApiKeyRow>();

		return row ? mapApiKeyRow(row) : null;
	}

	/** Find any API key by its hash (including revoked/expired) */
	async findByHash(keyHash: string): Promise<ApiKey | null> {
		const row = await this.db
			.prepare(`SELECT * FROM api_keys WHERE key_hash = ? LIMIT 1`)
			.bind(keyHash)
			.first<ApiKeyRow>();

		return row ? mapApiKeyRow(row) : null;
	}

	/** Find API key by ID */
	async findById(id: string): Promise<ApiKey | null> {
		const row = await this.db
			.prepare(`SELECT * FROM api_keys WHERE id = ? LIMIT 1`)
			.bind(id)
			.first<ApiKeyRow>();

		return row ? mapApiKeyRow(row) : null;
	}

	/** List all API keys for an organization (including revoked) */
	async listByOrganization(organizationId: string): Promise<ApiKey[]> {
		const result = await this.db
			.prepare(
				`SELECT * FROM api_keys
				 WHERE organization_id = ?
				 ORDER BY created_at DESC`,
			)
			.bind(organizationId)
			.all<ApiKeyRow>();

		return (result.results ?? []).map(mapApiKeyRow);
	}

	/** Create a new API key */
	async create(
		id: string,
		keyHash: string,
		keyPrefix: string,
		input: CreateApiKeyInput,
	): Promise<ApiKey> {
		const now = new Date().toISOString();
		await this.db
			.prepare(
				`INSERT INTO api_keys (id, name, key_hash, key_prefix, organization_id, created_by_id, expires_at, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				input.name,
				keyHash,
				keyPrefix,
				input.organizationId,
				input.createdById,
				input.expiresAt ?? null,
				now,
				now,
			)
			.run();

		const created = await this.findById(id);
		if (!created) {
			throw new Error("Failed to create API key");
		}
		return created;
	}

	/** Soft-revoke an API key by setting revoked_at */
	async revoke(id: string): Promise<void> {
		const now = new Date().toISOString();
		await this.db
			.prepare(
				`UPDATE api_keys SET revoked_at = ?, updated_at = ? WHERE id = ?`,
			)
			.bind(now, now, id)
			.run();
	}

	/** Update last_used_at timestamp */
	async updateLastUsedAt(id: string): Promise<void> {
		const now = new Date().toISOString();
		await this.db
			.prepare(
				`UPDATE api_keys SET last_used_at = ?, updated_at = ? WHERE id = ?`,
			)
			.bind(now, now, id)
			.run();
	}
}
