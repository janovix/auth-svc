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
			return await kv.get(`${KEY_PREFIX}${key}`);
		},

		set: async (key: string, value: string, ttl?: number) => {
			const options: KVNamespacePutOptions = {};
			if (ttl && ttl > 0) {
				// KV expirationTtl is in seconds
				options.expirationTtl = ttl;
			}
			await kv.put(`${KEY_PREFIX}${key}`, value, options);
		},

		delete: async (key: string) => {
			await kv.delete(`${KEY_PREFIX}${key}`);
		},
	};
}
