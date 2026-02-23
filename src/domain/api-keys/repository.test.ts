/**
 * API Keys repository unit tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiKeyRepository } from "./repository";

// Mock D1Database
const createMockDb = () => {
	const mockFirst = vi.fn();
	const mockRun = vi.fn();
	const mockAll = vi.fn();
	const mockBind = vi.fn();

	mockBind.mockReturnValue({
		first: mockFirst,
		run: mockRun,
		all: mockAll,
	});

	const mockPrepare = vi.fn().mockReturnValue({
		bind: mockBind,
	});

	return {
		prepare: mockPrepare,
		_mockFirst: mockFirst,
		_mockRun: mockRun,
		_mockAll: mockAll,
		_mockBind: mockBind,
	};
};

const sampleRow = {
	id: "key-1",
	name: "Production Key",
	key_hash: "abc123hash",
	key_prefix: "jnvx_abc123",
	organization_id: "org-1",
	created_by_id: "user-1",
	last_used_at: null,
	expires_at: null,
	revoked_at: null,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
};

describe("ApiKeyRepository", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let repository: ApiKeyRepository;

	beforeEach(() => {
		mockDb = createMockDb();
		repository = new ApiKeyRepository(mockDb as unknown as D1Database);
	});

	describe("findActiveByHash", () => {
		it("should return mapped API key when found", async () => {
			mockDb._mockFirst.mockResolvedValue(sampleRow);

			const result = await repository.findActiveByHash("abc123hash");

			expect(result).not.toBeNull();
			expect(result?.id).toBe("key-1");
			expect(result?.name).toBe("Production Key");
			expect(result?.keyPrefix).toBe("jnvx_abc123");
			expect(result?.organizationId).toBe("org-1");
			expect(result?.createdById).toBe("user-1");
		});

		it("should return null when key not found", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.findActiveByHash("nonexistent");

			expect(result).toBeNull();
		});
	});

	describe("findById", () => {
		it("should return mapped API key by ID", async () => {
			mockDb._mockFirst.mockResolvedValue(sampleRow);

			const result = await repository.findById("key-1");

			expect(result).not.toBeNull();
			expect(result?.id).toBe("key-1");
		});

		it("should return null for nonexistent ID", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.findById("nonexistent");

			expect(result).toBeNull();
		});
	});

	describe("listByOrganization", () => {
		it("should return all keys for an organization", async () => {
			mockDb._mockAll.mockResolvedValue({
				results: [
					sampleRow,
					{ ...sampleRow, id: "key-2", name: "Staging Key" },
				],
			});

			const result = await repository.listByOrganization("org-1");

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe("key-1");
			expect(result[1].id).toBe("key-2");
		});

		it("should return empty array when no keys exist", async () => {
			mockDb._mockAll.mockResolvedValue({ results: [] });

			const result = await repository.listByOrganization("org-empty");

			expect(result).toHaveLength(0);
		});
	});

	describe("create", () => {
		it("should insert a new key and return it", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });
			mockDb._mockFirst.mockResolvedValue(sampleRow);

			const result = await repository.create(
				"key-1",
				"abc123hash",
				"jnvx_abc123",
				{
					name: "Production Key",
					organizationId: "org-1",
					createdById: "user-1",
				},
			);

			expect(result.id).toBe("key-1");
			expect(mockDb.prepare).toHaveBeenCalled();
		});
	});

	describe("revoke", () => {
		it("should call update with revoked_at timestamp", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.revoke("key-1");

			expect(mockDb.prepare).toHaveBeenCalled();
		});
	});

	describe("updateLastUsedAt", () => {
		it("should update the last_used_at timestamp", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.updateLastUsedAt("key-1");

			expect(mockDb.prepare).toHaveBeenCalled();
		});
	});
});
