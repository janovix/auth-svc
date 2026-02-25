import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
	createKVSecondaryStorage,
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

	describe("timeout resilience", () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it("get returns null when KV hangs past the 3s timeout", async () => {
			vi.useFakeTimers();
			// kv.get never resolves
			mockKV.get.mockReturnValueOnce(new Promise(() => {}));

			const resultPromise = storage.get("session:hanging");
			// Advance past the 3s KV timeout
			await vi.advanceTimersByTimeAsync(3_001);
			const result = await resultPromise;

			expect(result).toBeNull();
		});

		it("set resolves without throwing when KV hangs past the 3s timeout", async () => {
			vi.useFakeTimers();
			// kv.put never resolves
			mockKV.put.mockReturnValueOnce(new Promise(() => {}));

			const setPromise = storage.set("rate-limit:ip", "1", 60);
			await vi.advanceTimersByTimeAsync(3_001);

			await expect(setPromise).resolves.toBeUndefined();
		});

		it("delete resolves without throwing when KV hangs past the 3s timeout", async () => {
			vi.useFakeTimers();
			// kv.delete never resolves
			mockKV.delete.mockReturnValueOnce(new Promise(() => {}));

			const deletePromise = storage.delete("session:stale");
			await vi.advanceTimersByTimeAsync(3_001);

			await expect(deletePromise).resolves.toBeUndefined();
		});

		it("get resolves immediately when KV responds before the timeout", async () => {
			vi.useFakeTimers();
			// kv.get resolves quickly (within 3s)
			mockKV.get.mockResolvedValueOnce("fast-value" as string | null);

			const resultPromise = storage.get("session:fast");
			// Advance only 100ms — well under the 3s timeout
			await vi.advanceTimersByTimeAsync(100);
			const result = await resultPromise;

			expect(result).toBe("fast-value");
		});

		it("subsequent operations succeed normally after a previous KV timeout", async () => {
			vi.useFakeTimers();

			// First get: KV hangs — times out after 3s
			mockKV.get.mockReturnValueOnce(new Promise(() => {}));
			const firstPromise = storage.get("session:slow");
			await vi.advanceTimersByTimeAsync(3_001);
			expect(await firstPromise).toBeNull();

			// Second get: KV responds normally
			vi.useRealTimers();
			mockKV.get.mockResolvedValueOnce("healthy-value" as string | null);
			expect(await storage.get("session:healthy")).toBe("healthy-value");
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
