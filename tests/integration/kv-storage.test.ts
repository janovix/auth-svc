import { describe, expect, it, vi, beforeEach } from "vitest";

import {
	createKVSecondaryStorage,
	type BetterAuthSecondaryStorage,
} from "../../src/utils/kv-storage";

// Mock KV namespace
function createMockKV() {
	const store = new Map<string, { value: string; expiration?: number }>();

	return {
		get: vi.fn(async (key: string) => {
			const entry = store.get(key);
			if (!entry) return null;
			// Simulate TTL expiration
			if (entry.expiration && Date.now() / 1000 > entry.expiration) {
				store.delete(key);
				return null;
			}
			return entry.value;
		}),
		put: vi.fn(
			async (key: string, value: string, options?: KVNamespacePutOptions) => {
				const expiration = options?.expirationTtl
					? Date.now() / 1000 + options.expirationTtl
					: undefined;
				store.set(key, { value, expiration });
			},
		),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		// Expose store for testing
		_store: store,
	} as unknown as KVNamespace & { _store: Map<string, unknown> };
}

describe("KV Secondary Storage", () => {
	let mockKV: ReturnType<typeof createMockKV>;
	let storage: BetterAuthSecondaryStorage;

	beforeEach(() => {
		mockKV = createMockKV();
		storage = createKVSecondaryStorage(mockKV);
	});

	describe("get", () => {
		it("returns null for non-existent keys", async () => {
			const result = await storage.get("non-existent");
			expect(result).toBeNull();
			expect(mockKV.get).toHaveBeenCalledWith("ba:non-existent");
		});

		it("returns stored value with prefix", async () => {
			await mockKV.put("ba:session:abc123", "session-data");
			const result = await storage.get("session:abc123");
			expect(result).toBe("session-data");
		});

		it("uses the ba: key prefix", async () => {
			await storage.get("test-key");
			expect(mockKV.get).toHaveBeenCalledWith("ba:test-key");
		});
	});

	describe("set", () => {
		it("stores value with prefix", async () => {
			await storage.set("session:xyz", "session-value");
			expect(mockKV.put).toHaveBeenCalledWith(
				"ba:session:xyz",
				"session-value",
				{},
			);
		});

		it("stores value with TTL when provided", async () => {
			await storage.set("rate:limit", "100", 3600);
			expect(mockKV.put).toHaveBeenCalledWith("ba:rate:limit", "100", {
				expirationTtl: 3600,
			});
		});

		it("ignores TTL when zero or negative", async () => {
			await storage.set("key1", "value1", 0);
			expect(mockKV.put).toHaveBeenCalledWith("ba:key1", "value1", {});

			await storage.set("key2", "value2", -1);
			expect(mockKV.put).toHaveBeenCalledWith("ba:key2", "value2", {});
		});
	});

	describe("delete", () => {
		it("deletes value with prefix", async () => {
			await storage.delete("session:old");
			expect(mockKV.delete).toHaveBeenCalledWith("ba:session:old");
		});
	});

	describe("round-trip", () => {
		it("can set and get values", async () => {
			await storage.set("user:123", '{"id":"123","email":"test@test.com"}');
			const result = await storage.get("user:123");
			expect(result).toBe('{"id":"123","email":"test@test.com"}');
		});

		it("can delete values", async () => {
			await storage.set("temp:key", "temp-value");
			expect(await storage.get("temp:key")).toBe("temp-value");

			await storage.delete("temp:key");
			expect(await storage.get("temp:key")).toBeNull();
		});
	});
});
