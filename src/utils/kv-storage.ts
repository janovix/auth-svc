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
 * Timeout handling: KV operations are wrapped in a 3-second timeout. When KV has
 * a transient infrastructure slowdown, a `kv.get()` or `kv.put()` can hang
 * indefinitely without throwing — the Promise simply never resolves. This would
 * block auth.handler() for the full 25s safety-net timeout and produce a 504.
 * The 3s timeout degrades gracefully: get() returns null (cache miss), set/delete
 * are silently skipped. The request continues using D1 as the source of truth.
 *
 * See: https://www.better-auth.com/docs/concepts/database#secondary-storage
 */

import * as Sentry from "@sentry/cloudflare";

const KEY_PREFIX = "ba:";

/** Maximum ms to wait for any single KV operation before degrading gracefully. */
const KV_TIMEOUT_MS = 3_000;

export type BetterAuthSecondaryStorage = {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string, ttl?: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
};

/**
 * Races `promise` against a `KV_TIMEOUT_MS` deadline.
 * If the deadline fires first, resolves with `fallback` and adds a Sentry
 * breadcrumb so the frequency of KV slowdowns is visible in traces.
 */
function withKvTimeout<T>(
	promise: Promise<T>,
	fallback: T,
	op: string,
	key: string,
): Promise<T> {
	let timeoutHandle: ReturnType<typeof setTimeout>;

	const timeoutPromise = new Promise<T>((resolve) => {
		timeoutHandle = setTimeout(() => {
			Sentry.addBreadcrumb({
				category: "kv",
				message: `KV ${op} timed out after ${KV_TIMEOUT_MS}ms`,
				level: "warning",
				data: { key, op, timeout_ms: KV_TIMEOUT_MS },
			});
			resolve(fallback);
		}, KV_TIMEOUT_MS);
	});

	return Promise.race([
		promise.then((result) => {
			clearTimeout(timeoutHandle);
			return result;
		}),
		timeoutPromise,
	]);
}

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
				return await withKvTimeout(
					kv.get(`${KEY_PREFIX}${key}`),
					null,
					"get",
					key,
				);
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
				await withKvTimeout(
					kv.put(`${KEY_PREFIX}${key}`, value, options),
					undefined,
					"set",
					key,
				);
			} catch (error) {
				handleKvError("set", key, error);
			}
		},

		delete: async (key: string) => {
			try {
				await withKvTimeout(
					kv.delete(`${KEY_PREFIX}${key}`),
					undefined,
					"delete",
					key,
				);
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
