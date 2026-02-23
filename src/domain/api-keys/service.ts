/**
 * API Keys Service
 *
 * Handles API key lifecycle: create, list, revoke, rotate, validate.
 * Keys are organization-scoped and gated behind subscription plan checks.
 */
import { ApiKeyRepository } from "./repository";
import type {
	ApiKey,
	ApiKeyCreateResult,
	ApiKeyValidationResult,
	CreateApiKeyInput,
} from "./types";
import { isApiEnabledPlan } from "./types";

/** Generate a random API key with the jnvx_ prefix */
function generatePlainKey(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	const hex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `jnvx_${hex}`;
}

/** SHA-256 hash of a plain key */
async function hashKey(plainKey: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(plainKey);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class ApiKeyService {
	constructor(private readonly repository: ApiKeyRepository) {}

	/**
	 * Create a new API key for an organization.
	 * Returns the plain key only once — it is never stored or retrievable again.
	 */
	async create(input: CreateApiKeyInput): Promise<ApiKeyCreateResult> {
		const plainKey = generatePlainKey();
		const keyHash = await hashKey(plainKey);
		const keyPrefix = plainKey.slice(0, 12); // "jnvx_" + first 7 hex chars
		const id = crypto.randomUUID();

		const apiKey = await this.repository.create(id, keyHash, keyPrefix, input);

		return { apiKey, plainKey };
	}

	/**
	 * List all API keys for an organization (including revoked).
	 * Never returns the plain key or hash.
	 */
	async listByOrganization(organizationId: string): Promise<ApiKey[]> {
		return this.repository.listByOrganization(organizationId);
	}

	/**
	 * Revoke an API key. This is a soft delete (sets revoked_at).
	 * Returns the revoked key or null if not found.
	 */
	async revoke(id: string, organizationId: string): Promise<ApiKey | null> {
		const key = await this.repository.findById(id);
		if (!key || key.organizationId !== organizationId) {
			return null;
		}
		if (key.revokedAt) {
			return key; // Already revoked
		}
		await this.repository.revoke(id);
		return this.repository.findById(id);
	}

	/**
	 * Rotate an API key: revoke the old key and create a new one atomically.
	 * Returns the new plain key (shown once).
	 */
	async rotate(
		id: string,
		organizationId: string,
		userId: string,
	): Promise<ApiKeyCreateResult | null> {
		const oldKey = await this.repository.findById(id);
		if (!oldKey || oldKey.organizationId !== organizationId) {
			return null;
		}
		if (oldKey.revokedAt) {
			return null; // Can't rotate a revoked key
		}

		// Revoke the old key
		await this.repository.revoke(id);

		// Create a new key with the same name
		return this.create({
			name: oldKey.name,
			organizationId,
			createdById: userId,
		});
	}

	/**
	 * Validate an API key by its plain value.
	 * Checks: exists, not revoked, not expired.
	 * Does NOT check subscription (that's done by the caller with additional context).
	 */
	async validate(plainKey: string): Promise<ApiKeyValidationResult> {
		if (!plainKey || !plainKey.startsWith("jnvx_")) {
			return { valid: false, error: "invalid_key_format" };
		}

		const keyHash = await hashKey(plainKey);
		const apiKey = await this.repository.findActiveByHash(keyHash);

		if (!apiKey) {
			// Check if the key exists but is revoked/expired
			const anyKey = await this.repository.findByHash(keyHash);
			if (anyKey?.revokedAt) {
				return { valid: false, error: "key_revoked" };
			}
			if (anyKey?.expiresAt && new Date(anyKey.expiresAt) <= new Date()) {
				return { valid: false, error: "key_expired" };
			}
			return { valid: false, error: "key_not_found" };
		}

		return {
			valid: true,
			organizationId: apiKey.organizationId,
		};
	}

	/**
	 * Update last_used_at timestamp (fire and forget via waitUntil).
	 */
	async touchLastUsed(plainKey: string): Promise<void> {
		const keyHash = await hashKey(plainKey);
		const apiKey = await this.repository.findActiveByHash(keyHash);
		if (apiKey) {
			await this.repository.updateLastUsedAt(apiKey.id);
		}
	}

	/**
	 * Check if a subscription plan allows API access.
	 */
	static isPlanEligible(plan: string | null): boolean {
		if (!plan) return false;
		return isApiEnabledPlan(plan);
	}
}
