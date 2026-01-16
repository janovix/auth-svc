/**
 * Cloudflare KV-based secondary storage for Better Auth.
 *
 * This implementation provides fast key-value storage for session data,
 * rate limiting counters, and other high-frequency operations that would
 * otherwise hit D1 directly.
 *
 * See: https://www.better-auth.com/docs/concepts/database#secondary-storage
 */

const KEY_PREFIX = "ba:";

/**
 * Timeout for KV operations in milliseconds.
 * Prevents hanging if KV becomes unresponsive.
 */
const KV_TIMEOUT_MS = 3000;

export type BetterAuthSecondaryStorage = {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string, ttl?: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
};

/**
 * Wraps a promise with a timeout to prevent indefinite hangs.
 */
async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	operation: string,
): Promise<T | null> {
	const timeoutPromise = new Promise<null>((resolve) => {
		setTimeout(() => {
			console.warn(`[KV Storage] ${operation} timed out after ${timeoutMs}ms`);
			resolve(null);
		}, timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]);
}

/**
 * Creates a Better Auth secondary storage implementation using Cloudflare KV.
 * Includes timeout protection to prevent hanging requests.
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
				const result = await withTimeout(
					kv.get(`${KEY_PREFIX}${key}`),
					KV_TIMEOUT_MS,
					`get(${key})`,
				);
				return result;
			} catch (error) {
				console.error(`[KV Storage] get(${key}) failed:`, error);
				return null;
			}
		},

		set: async (key: string, value: string, ttl?: number) => {
			try {
				const options: KVNamespacePutOptions = {};
				if (ttl && ttl > 0) {
					// Cloudflare KV requires minimum TTL of 60 seconds
					// If Better Auth requests a shorter TTL, use the minimum
					const MIN_KV_TTL = 60;
					options.expirationTtl = Math.max(ttl, MIN_KV_TTL);
				}
				await withTimeout(
					kv.put(`${KEY_PREFIX}${key}`, value, options),
					KV_TIMEOUT_MS,
					`set(${key})`,
				);
			} catch (error) {
				console.error(`[KV Storage] set(${key}) failed:`, error);
				// Don't throw - allow operation to continue even if KV fails
			}
		},

		delete: async (key: string) => {
			try {
				await withTimeout(
					kv.delete(`${KEY_PREFIX}${key}`),
					KV_TIMEOUT_MS,
					`delete(${key})`,
				);
			} catch (error) {
				console.error(`[KV Storage] delete(${key}) failed:`, error);
				// Don't throw - allow operation to continue even if KV fails
			}
		},
	};
}
