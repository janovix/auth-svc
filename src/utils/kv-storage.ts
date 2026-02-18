/**
 * Cloudflare KV-based secondary storage for Better Auth.
 *
 * This implementation provides fast key-value storage for session data,
 * rate limiting counters, and other high-frequency operations that would
 * otherwise hit D1 directly.
 *
 * All operations are wrapped in try-catch to prevent KV failures (especially
 * 429 Too Many Requests from per-key write limits) from crashing request
 * handlers. Cloudflare KV enforces ~1 write/second/key; when Better Auth's
 * rate limiter writes the same counter key multiple times per second (e.g.
 * concurrent get-session calls from the same IP), KV returns 429 and the
 * unhandled error would otherwise propagate through Better Auth and crash
 * the entire request.
 *
 * Graceful degradation:
 * - get() → returns null (cache miss) → Better Auth falls back to D1
 * - set() → silently fails → stale counter/cache, requests continue
 * - delete() → silently fails → key expires naturally via TTL
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
// Rate-limit custom storage
// ────────────────────────────────────────────────────────────────────────────

/**
 * Shape of the rate limit entry stored/retrieved by Better Auth's rate limiter.
 * Matches the internal `{ key, count, lastRequest }` object that Better Auth
 * serialises when using `customStorage`.
 */
type RateLimitEntry = { key: string; count: number; lastRequest: number };

/**
 * Creates a Better Auth `rateLimit.customStorage` implementation using
 * Cloudflare KV.
 *
 * Better Auth's built-in `storage: "secondary-storage"` option passes the rate
 * limit window (e.g. 10 s) as the KV TTL, which violates Cloudflare KV's
 * minimum 60-second TTL and causes 429 errors. Using `customStorage` lets us
 * hard-code `expirationTtl: 60` and handle JSON serialisation explicitly.
 *
 * Interface differences from `secondaryStorage`:
 *   - `get` returns the parsed object (or `undefined`)
 *   - `set` receives the raw value object (no TTL parameter)
 *   - TTL is hard-coded to 60 s (the KV minimum)
 */
export function createKVRateLimitStorage(kv: KVNamespace): {
	get: (key: string) => Promise<RateLimitEntry | undefined>;
	set: (key: string, value: RateLimitEntry) => Promise<void>;
	delete: (key: string) => Promise<void>;
} {
	return {
		get: async (key: string) => {
			try {
				const data = await kv.get(`${KEY_PREFIX}rl:${key}`);
				return data ? (JSON.parse(data) as RateLimitEntry) : undefined;
			} catch (error) {
				handleKvError("get", `rl:${key}`, error);
				return undefined;
			}
		},

		set: async (key: string, value: RateLimitEntry) => {
			try {
				await kv.put(`${KEY_PREFIX}rl:${key}`, JSON.stringify(value), {
					expirationTtl: 60,
				});
			} catch (error) {
				handleKvError("set", `rl:${key}`, error);
			}
		},

		delete: async (key: string) => {
			try {
				await kv.delete(`${KEY_PREFIX}rl:${key}`);
			} catch (error) {
				handleKvError("delete", `rl:${key}`, error);
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
