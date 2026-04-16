/**
 * API Keys service unit tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiKeyService } from "./service";
import { ApiKeyRepository } from "./repository";
import type { ApiKey } from "./types";

// Mock repository
const createMockRepository = () => {
	return {
		findActiveByHash: vi.fn(),
		findByHash: vi.fn(),
		findById: vi.fn(),
		listByOrganization: vi.fn(),
		create: vi.fn(),
		revoke: vi.fn(),
		updateLastUsedAt: vi.fn(),
	} as unknown as ApiKeyRepository;
};

const mockApiKey: ApiKey = {
	id: "key-1",
	name: "Test Key",
	keyPrefix: "jnvx_live_abc1",
	organizationId: "org-1",
	createdById: "user-1",
	environment: "production",
	lastUsedAt: null,
	expiresAt: null,
	revokedAt: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ApiKeyService", () => {
	let mockRepo: ReturnType<typeof createMockRepository>;
	let service: ApiKeyService;

	beforeEach(() => {
		mockRepo = createMockRepository();
		service = new ApiKeyService(mockRepo as unknown as ApiKeyRepository);
	});

	describe("create", () => {
		it("should create a new API key and return plain key", async () => {
			(mockRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
				mockApiKey,
			);

			const result = await service.create({
				name: "Test Key",
				organizationId: "org-1",
				createdById: "user-1",
			});

			expect(result.apiKey).toEqual(mockApiKey);
			expect(result.plainKey).toBeDefined();
			expect(result.plainKey).toMatch(/^jnvx_live_/);
			expect(result.plainKey.length).toBeGreaterThan(20);
		});

		it("should call repository.create with hashed key", async () => {
			(mockRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
				mockApiKey,
			);

			await service.create({
				name: "Test Key",
				organizationId: "org-1",
				createdById: "user-1",
			});

			expect(mockRepo.create).toHaveBeenCalledTimes(1);
			const callArgs = (mockRepo.create as ReturnType<typeof vi.fn>).mock
				.calls[0];
			// ID (UUID)
			expect(callArgs[0]).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);
			// Key hash (SHA-256 hex)
			expect(callArgs[1]).toMatch(/^[0-9a-f]{64}$/);
			// Key prefix (first 14 chars of plain key, includes env)
			expect(callArgs[2]).toMatch(/^jnvx_live_/);
		});
	});

	describe("listByOrganization", () => {
		it("should return keys from repository", async () => {
			(
				mockRepo.listByOrganization as ReturnType<typeof vi.fn>
			).mockResolvedValue([mockApiKey]);

			const result = await service.listByOrganization("org-1");

			expect(result).toEqual([mockApiKey]);
			expect(mockRepo.listByOrganization).toHaveBeenCalledWith(
				"org-1",
				undefined,
			);
		});
	});

	describe("revoke", () => {
		it("should revoke an existing key", async () => {
			(mockRepo.findById as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce(mockApiKey)
				.mockResolvedValueOnce({ ...mockApiKey, revokedAt: "2026-01-02" });

			const result = await service.revoke("key-1", "org-1");

			expect(result?.revokedAt).toBe("2026-01-02");
			expect(mockRepo.revoke).toHaveBeenCalledWith("key-1");
		});

		it("should return null if key belongs to different org", async () => {
			(mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
				mockApiKey,
			);

			const result = await service.revoke("key-1", "org-different");

			expect(result).toBeNull();
			expect(mockRepo.revoke).not.toHaveBeenCalled();
		});

		it("should return key as-is if already revoked", async () => {
			const revokedKey = { ...mockApiKey, revokedAt: "2026-01-01" };
			(mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
				revokedKey,
			);

			const result = await service.revoke("key-1", "org-1");

			expect(result).toEqual(revokedKey);
			expect(mockRepo.revoke).not.toHaveBeenCalled();
		});

		it("should return null if key not found", async () => {
			(mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await service.revoke("nonexistent", "org-1");

			expect(result).toBeNull();
		});
	});

	describe("rotate", () => {
		it("should revoke old key and create a new one", async () => {
			const newKey = { ...mockApiKey, id: "key-2" };
			(mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
				mockApiKey,
			);
			(mockRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(newKey);

			const result = await service.rotate("key-1", "org-1", "user-1");

			expect(result).not.toBeNull();
			expect(result?.apiKey).toEqual(newKey);
			expect(result?.plainKey).toMatch(/^jnvx_live_/);
			expect(mockRepo.revoke).toHaveBeenCalledWith("key-1");
		});

		it("should return null for already revoked key", async () => {
			(mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
				...mockApiKey,
				revokedAt: "2026-01-01",
			});

			const result = await service.rotate("key-1", "org-1", "user-1");

			expect(result).toBeNull();
			expect(mockRepo.revoke).not.toHaveBeenCalled();
		});

		it("should return null for wrong org", async () => {
			(mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
				mockApiKey,
			);

			const result = await service.rotate("key-1", "org-wrong", "user-1");

			expect(result).toBeNull();
		});
	});

	describe("validate", () => {
		it("should return valid for an active key", async () => {
			(mockRepo.findActiveByHash as ReturnType<typeof vi.fn>).mockResolvedValue(
				mockApiKey,
			);

			const result = await service.validate("jnvx_" + "a".repeat(48));

			expect(result.valid).toBe(true);
			expect(result.organizationId).toBe("org-1");
		});

		it("should return invalid for missing key", async () => {
			(mockRepo.findActiveByHash as ReturnType<typeof vi.fn>).mockResolvedValue(
				null,
			);
			(mockRepo.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await service.validate("jnvx_" + "b".repeat(48));

			expect(result.valid).toBe(false);
			expect(result.error).toBe("key_not_found");
		});

		it("should return key_revoked for revoked keys", async () => {
			(mockRepo.findActiveByHash as ReturnType<typeof vi.fn>).mockResolvedValue(
				null,
			);
			(mockRepo.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue({
				...mockApiKey,
				revokedAt: "2026-01-01",
			});

			const result = await service.validate("jnvx_" + "c".repeat(48));

			expect(result.valid).toBe(false);
			expect(result.error).toBe("key_revoked");
		});

		it("should reject keys without jnvx_ prefix", async () => {
			const result = await service.validate("invalid_key");

			expect(result.valid).toBe(false);
			expect(result.error).toBe("invalid_key_format");
		});

		it("should reject empty keys", async () => {
			const result = await service.validate("");

			expect(result.valid).toBe(false);
			expect(result.error).toBe("invalid_key_format");
		});
	});

	describe("isPlanEligible", () => {
		it("should allow pro plan", () => {
			expect(ApiKeyService.isPlanEligible("pro")).toBe(true);
		});

		it("should allow ultra plan", () => {
			expect(ApiKeyService.isPlanEligible("ultra")).toBe(true);
		});

		it("should allow business plan", () => {
			expect(ApiKeyService.isPlanEligible("business")).toBe(true);
		});

		it("should allow enterprise plan (license)", () => {
			expect(ApiKeyService.isPlanEligible("enterprise")).toBe(true);
		});

		it("should reject watchlist plan", () => {
			expect(ApiKeyService.isPlanEligible("watchlist")).toBe(false);
		});

		it("should reject null plan", () => {
			expect(ApiKeyService.isPlanEligible(null)).toBe(false);
		});
	});
});
