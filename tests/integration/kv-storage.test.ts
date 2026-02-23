import { describe, expect, it, vi, beforeEach } from "vitest";

import {
	createKVSecondaryStorage,
	createKVRateLimitStorage,
	type BetterAuthSecondaryStorage,
} from "../../src/utils/kv-storage";

// Mock Sentry to verify breadcrumbs
vi.mock("@sentry/cloudflare", () => ({
	addBreadcrumb: vi.fn(),
}));

// Mock KV namespace — keep inferred type so vi.fn() mock methods are accessible
function createMockKV() {
	const store = new Map<string, { value: string; expiration?: number }>();

	return {
		get: vi.fn(async (key: string) => {
			const entry = store.get(key);
			if (!entry) return null as string | null;
			if (entry.expiration && Date.now() / 1000 > entry.expiration) {
				store.delete(key);
				return null as string | null;
			}
			return entry.value as string | null;
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
		_store: store,
	};
}

type MockKV = ReturnType<typeof createMockKV>;

describe("KV Secondary Storage", () => {
	let mockKV: MockKV;
	let storage: BetterAuthSecondaryStorage;

	beforeEach(() => {
		mockKV = createMockKV();
		storage = createKVSecondaryStorage(mockKV as unknown as KVNamespace);
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

	describe("error resilience", () => {
		it("enforces minimum 60s TTL when a shorter TTL is requested", async () => {
			await storage.set("rate:limit", "5", 10);
			expect(mockKV.put).toHaveBeenCalledWith("ba:rate:limit", "5", {
				expirationTtl: 60,
			});
		});

		it("get returns null when KV throws (e.g. network error)", async () => {
			mockKV.get.mockRejectedValueOnce(new Error("KV read timeout"));
			const result = await storage.get("session:broken");
			expect(result).toBeNull();
		});

		it("set does not throw when KV returns 429", async () => {
			mockKV.put.mockRejectedValueOnce(
				new Error("KV PUT failed: 429 Too Many Requests"),
			);
			await expect(
				storage.set("rate-limit:ip", "5", 60),
			).resolves.toBeUndefined();
		});

		it("set does not throw on generic KV errors", async () => {
			mockKV.put.mockRejectedValueOnce(new Error("Internal KV error"));
			await expect(storage.set("session:xyz", "data")).resolves.toBeUndefined();
		});

		it("delete does not throw when KV fails", async () => {
			mockKV.delete.mockRejectedValueOnce(new Error("KV unavailable"));
			await expect(storage.delete("old:key")).resolves.toBeUndefined();
		});

		it("subsequent operations work after a KV failure", async () => {
			// First set fails
			mockKV.put.mockRejectedValueOnce(
				new Error("KV PUT failed: 429 Too Many Requests"),
			);
			await storage.set("key", "value1");

			// Second set succeeds
			await storage.set("key", "value2");
			const result = await storage.get("key");
			expect(result).toBe("value2");
		});
	});
});

describe("KV Rate Limit Storage", () => {
	let mockKV: MockKV;
	let rlStorage: ReturnType<typeof createKVRateLimitStorage>;

	beforeEach(() => {
		mockKV = createMockKV();
		rlStorage = createKVRateLimitStorage(mockKV as unknown as KVNamespace);
	});

	describe("get", () => {
		it("returns undefined for non-existent keys", async () => {
			const result = await rlStorage.get("ip:1.2.3.4");
			expect(result).toBeUndefined();
		});

		it("returns parsed JSON object for existing keys", async () => {
			const entry = { key: "ip:1.2.3.4", count: 5, lastRequest: 9999999 };
			await mockKV.put("ba:rl:ip:1.2.3.4", JSON.stringify(entry));
			const result = await rlStorage.get("ip:1.2.3.4");
			expect(result).toEqual(entry);
		});

		it("uses ba:rl: key prefix", async () => {
			await rlStorage.get("test-key");
			expect(mockKV.get).toHaveBeenCalledWith("ba:rl:test-key");
		});
	});

	describe("set", () => {
		it("serialises value as JSON and uses 60s TTL", async () => {
			const entry = { key: "ip:1.2.3.4", count: 1, lastRequest: 12345 };
			await rlStorage.set("ip:1.2.3.4", entry);
			expect(mockKV.put).toHaveBeenCalledWith(
				"ba:rl:ip:1.2.3.4",
				JSON.stringify(entry),
				{ expirationTtl: 60 },
			);
		});
	});

	describe("delete", () => {
		it("deletes with ba:rl: prefix", async () => {
			await rlStorage.delete("ip:1.2.3.4");
			expect(mockKV.delete).toHaveBeenCalledWith("ba:rl:ip:1.2.3.4");
		});
	});

	describe("error resilience", () => {
		it("get returns undefined when KV throws", async () => {
			mockKV.get.mockRejectedValueOnce(new Error("KV error"));
			const result = await rlStorage.get("ip:broken");
			expect(result).toBeUndefined();
		});

		it("set does not throw when KV returns 429", async () => {
			mockKV.put.mockRejectedValueOnce(
				new Error("KV PUT failed: 429 Too Many Requests"),
			);
			const entry = { key: "ip:1.2.3.4", count: 1, lastRequest: Date.now() };
			await expect(rlStorage.set("ip:1.2.3.4", entry)).resolves.toBeUndefined();
		});

		it("delete does not throw when KV fails", async () => {
			mockKV.delete.mockRejectedValueOnce(new Error("KV unavailable"));
			await expect(rlStorage.delete("ip:1.2.3.4")).resolves.toBeUndefined();
		});
	});
});
