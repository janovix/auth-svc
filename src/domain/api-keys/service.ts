/**
 * API Keys Service
 *
 * Handles API key lifecycle: create, list, revoke, rotate, validate.
 * Keys are organization-scoped, environment-tagged, and plan-gated.
 */
import { ApiKeyRepository } from "./repository";
import type {
	ApiKey,
	ApiKeyCreateResult,
	ApiKeyEnvironment,
	ApiKeyValidationResult,
	CreateApiKeyInput,
} from "./types";
import { getKeyPrefixForEnvironment, isApiEnabledPlan } from "./types";

function generatePlainKey(environment: ApiKeyEnvironment): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	const hex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const envPrefix = getKeyPrefixForEnvironment(environment);
	return `${envPrefix}${hex}`;
}

async function hashKey(plainKey: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(plainKey);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class ApiKeyService {
	constructor(private readonly repository: ApiKeyRepository) {}

	async create(input: CreateApiKeyInput): Promise<ApiKeyCreateResult> {
		const environment = input.environment ?? "production";
		const plainKey = generatePlainKey(environment);
		const keyHash = await hashKey(plainKey);
		const keyPrefix = plainKey.slice(0, 14);
		const id = crypto.randomUUID();

		const apiKey = await this.repository.create(id, keyHash, keyPrefix, {
			...input,
			environment,
		});

		return { apiKey, plainKey };
	}

	async listByOrganization(
		organizationId: string,
		environment?: ApiKeyEnvironment,
	): Promise<ApiKey[]> {
		return this.repository.listByOrganization(organizationId, environment);
	}

	async revoke(id: string, organizationId: string): Promise<ApiKey | null> {
		const key = await this.repository.findById(id);
		if (!key || key.organizationId !== organizationId) {
			return null;
		}
		if (key.revokedAt) {
			return key;
		}
		await this.repository.revoke(id);
		return this.repository.findById(id);
	}

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
			return null;
		}

		await this.repository.revoke(id);

		return this.create({
			name: oldKey.name,
			organizationId,
			createdById: userId,
			environment: oldKey.environment,
		});
	}

	async validate(plainKey: string): Promise<ApiKeyValidationResult> {
		if (
			!plainKey ||
			!(
				plainKey.startsWith("jnvx_live_") ||
				plainKey.startsWith("jnvx_stg_") ||
				plainKey.startsWith("jnvx_dev_") ||
				plainKey.startsWith("jnvx_")
			)
		) {
			return { valid: false, error: "invalid_key_format" };
		}

		const keyHash = await hashKey(plainKey);
		const apiKey = await this.repository.findActiveByHash(keyHash);

		if (!apiKey) {
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
			environment: apiKey.environment,
		};
	}

	async touchLastUsed(plainKey: string): Promise<void> {
		const keyHash = await hashKey(plainKey);
		const apiKey = await this.repository.findActiveByHash(keyHash);
		if (apiKey) {
			await this.repository.updateLastUsedAt(apiKey.id);
		}
	}

	static isPlanEligible(plan: string | null): boolean {
		if (!plan) return false;
		return isApiEnabledPlan(plan);
	}
}
