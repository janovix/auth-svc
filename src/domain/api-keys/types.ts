/**
 * API Keys domain types
 */

/** Database row shape (snake_case columns) */
export interface ApiKeyRow {
	id: string;
	name: string;
	key_hash: string;
	key_prefix: string;
	organization_id: string;
	created_by_id: string;
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
	expiresAt?: string | null;
}

/** Result of validating an API key */
export interface ApiKeyValidationResult {
	valid: boolean;
	organizationId?: string;
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
