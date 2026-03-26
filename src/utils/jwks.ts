/**
 * Shared JWKS constants and helpers used by the HTTP route (routes/jwks.ts)
 * and the RPC entrypoint (entrypoint.ts) so cache key, TTL, and build logic
 * stay in sync.
 */

export const JWKS_KV_CACHE_KEY = "ba:jwks:public-keys";

/** Cache TTL in seconds (1 hour). Must be >= 60 (Cloudflare KV minimum). */
export const JWKS_KV_TTL_SECONDS = 3600;

/** Grace period for expired keys (30 days in ms). Mirrors Better Auth's default. */
export const JWKS_GRACE_PERIOD_MS = 30 * 24 * 3600 * 1000;

export type JwksRow = {
	id: string;
	publicKey: string;
	alg: string | null;
	crv: string | null;
	expiresAt: string | null;
};

/**
 * Builds the JWKS response object from raw D1 rows, applying the same
 * grace-period filter that Better Auth uses internally.
 */
export function buildJwks(rows: JwksRow[]): {
	keys: Record<string, unknown>[];
} {
	const now = Date.now();
	const keys = rows
		.filter((row) => {
			if (!row.expiresAt) return true;
			return new Date(row.expiresAt).getTime() + JWKS_GRACE_PERIOD_MS > now;
		})
		.map((row) => ({
			alg: row.alg ?? "EdDSA",
			...(row.crv ? { crv: row.crv } : {}),
			...JSON.parse(row.publicKey),
			kid: row.id,
		}));

	return { keys };
}
