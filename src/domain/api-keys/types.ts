/**
 * API Keys domain types
 */

/** Valid environment values for API keys */
export const API_KEY_ENVIRONMENTS = [
	"production",
	"staging",
	"development",
] as const;
export type ApiKeyEnvironment = (typeof API_KEY_ENVIRONMENTS)[number];

export function isValidApiKeyEnvironment(
	value: string,
): value is ApiKeyEnvironment {
	return API_KEY_ENVIRONMENTS.includes(value as ApiKeyEnvironment);
}

/** Key prefix by environment */
const ENV_PREFIX_MAP: Record<ApiKeyEnvironment, string> = {
	production: "jnvx_live_",
	staging: "jnvx_stg_",
	development: "jnvx_dev_",
};

export function getKeyPrefixForEnvironment(env: ApiKeyEnvironment): string {
	return ENV_PREFIX_MAP[env];
}

/** Database row shape (snake_case columns) */
export interface ApiKeyRow {
	id: string;
	name: string;
	key_hash: string;
	key_prefix: string;
	organization_id: string;
	created_by_id: string;
	environment: string;
	last_used_at: string | null;
	expires_at: string | null;
	revoked_at: string | null;
	created_at: string;
	updated_at: string;
}

/** Domain model (camelCase) */
export interface ApiKey {
	id: string;
	name: string;
	keyPrefix: string;
	organizationId: string;
	createdById: string;
	environment: ApiKeyEnvironment;
	lastUsedAt: string | null;
	expiresAt: string | null;
	revokedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

/** Response when creating or rotating a key (includes the plain key shown once) */
export interface ApiKeyCreateResult {
	apiKey: ApiKey;
	plainKey: string;
}

/** Input for creating an API key */
export interface CreateApiKeyInput {
	name: string;
	organizationId: string;
	createdById: string;
	environment?: ApiKeyEnvironment;
	expiresAt?: string | null;
}

/** Result of validating an API key */
export interface ApiKeyValidationResult {
	valid: boolean;
	organizationId?: string;
	environment?: ApiKeyEnvironment;
	plan?: string;
	error?: string;
}

/** Plans that allow API access (includes enterprise license) */
export const API_ENABLED_PLANS = [
	"business",
	"pro",
	"ultra",
	"enterprise",
] as const;
export type ApiEnabledPlan = (typeof API_ENABLED_PLANS)[number];

export function isApiEnabledPlan(plan: string): plan is ApiEnabledPlan {
	return API_ENABLED_PLANS.includes(plan as ApiEnabledPlan);
}
