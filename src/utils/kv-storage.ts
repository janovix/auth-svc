/**
 * Cloudflare KV-based secondary storage for Better Auth.
 *
 * Stores session cache, rate limit counters, and JWKS — anything Better Auth
 * routes through its `secondaryStorage` interface.
 *
 * All operations are wrapped in try-catch to prevent KV failures (especially
 * 429 Too Many Requests from per-key write limits) from crashing request
 * handlers. Cloudflare KV enforces ~1 write/second/key; failures degrade
 * gracefully (cache miss on reads, stale counter on writes) without blocking.
 *
 * TTL handling: Cloudflare KV requires a minimum of 60 seconds. When Better Auth
 * passes a shorter TTL (e.g. the 10 s rate-limit window), `set()` clamps it to
 * 60 s. Rate limit correctness is unaffected because Better Auth tracks the window
 * via the `lastRequest` timestamp stored in the entry, not via KV expiry.
 *
 * See: https://www.better-auth.com/docs/concepts/database#secondary-storage
 */

import * as Sentry from "@sentry/cloudflare";

const KEY_PREFIX = "ba:";

export type BetterAuthSecondaryStorage = {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string, ttl?: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
};

/**
 * Creates a Better Auth secondary storage implementation using Cloudflare KV.
 *
 * @param kv - The KV namespace binding
 * @returns SecondaryStorage implementation for Better Auth
 */
export function createKVSecondaryStorage(
	kv: KVNamespace,
): BetterAuthSecondaryStorage {
	return {
		get: async (key: string) => {
			try {
				return await kv.get(`${KEY_PREFIX}${key}`);
			} catch (error) {
				handleKvError("get", key, error);
				return null;
			}
		},

		set: async (key: string, value: string, ttl?: number) => {
			const options: KVNamespacePutOptions = {};
			if (ttl && ttl > 0) {
				// Cloudflare KV requires minimum TTL of 60 seconds
				// If Better Auth requests a shorter TTL, use the minimum
				const MIN_KV_TTL = 60;
				options.expirationTtl = Math.max(ttl, MIN_KV_TTL);
			}
			try {
				await kv.put(`${KEY_PREFIX}${key}`, value, options);
			} catch (error) {
				handleKvError("set", key, error);
			}
		},

		delete: async (key: string) => {
			try {
				await kv.delete(`${KEY_PREFIX}${key}`);
			} catch (error) {
				handleKvError("delete", key, error);
			}
		},
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Shared error handler
// ────────────────────────────────────────────────────────────────────────────

/**
 * Logs KV operation failures as warnings and records a Sentry breadcrumb.
 * The breadcrumb attaches to whichever Sentry event fires next (e.g. a
 * downstream timeout), providing KV context without flooding Sentry with
 * individual KV error events.
 */
function handleKvError(op: string, key: string, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	const is429 = message.includes("429");

	console.warn(
		`[KV] ${op} failed for "${key}":`,
		is429 ? "429 Too Many Requests" : message,
	);

	Sentry.addBreadcrumb({
		category: "kv",
		message: `KV ${op} failed: ${is429 ? "429 rate limited" : message}`,
		level: "warning",
		data: { key, op, is429 },
	});
}
