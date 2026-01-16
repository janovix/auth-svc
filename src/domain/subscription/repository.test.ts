/**
 * Subscription repository unit tests
 *
 * Tests for subscriptions, usage tracking, and card fingerprint management
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubscriptionRepository } from "./repository";

// Mock D1Database
const createMockDb = () => {
	const mockPrepare = vi.fn();
	const mockBind = vi.fn();
	const mockFirst = vi.fn();
	const mockRun = vi.fn();
	const mockAll = vi.fn();

	mockPrepare.mockReturnValue({
		bind: mockBind.mockReturnValue({
			first: mockFirst,
			run: mockRun,
			all: mockAll,
		}),
	});

	return {
		prepare: mockPrepare,
		_mockBind: mockBind,
		_mockFirst: mockFirst,
		_mockRun: mockRun,
		_mockAll: mockAll,
	};
};

// Sample subscription row
const mockSubscriptionRow = {
	id: "sub-1",
	plan: "business",
	referenceId: "user-456",
	stripeCustomerId: "cus_123",
	stripeSubscriptionId: "sub_stripe_123",
	status: "active",
	periodStart: "2024-01-01T00:00:00Z",
	periodEnd: "2024-01-31T00:00:00Z",
	cancelAtPeriodEnd: 0,
	seats: null,
	trialStart: null,
	trialEnd: null,
	createdAt: "2024-01-01T00:00:00Z",
	updatedAt: "2024-01-15T00:00:00Z",
};

// Sample usage row
const mockUsageRow = {
	id: "usage-1",
	organization_id: "org-123",
	owner_user_id: "user-456",
	reports_used: 5,
	notices_used: 10,
	alerts_used: 75,
	transactions_used: 300,
	clients_used: 60,
	users_count: 3,
	period_start: "2024-01-01T00:00:00Z",
	period_end: "2024-01-31T00:00:00Z",
	overage_reported_at: null,
	stripe_usage_record_id: null,
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-15T00:00:00Z",
};

// Sample card fingerprint row
const mockFingerprintRow = {
	id: "fp-1",
	fingerprint: "card_fp_123",
	first_user_id: "user-456",
	first_used_at: "2024-01-01T00:00:00Z",
	last_used_at: "2024-01-15T00:00:00Z",
	usage_count: 2,
	created_at: "2024-01-01T00:00:00Z",
};

describe("SubscriptionRepository", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let repository: SubscriptionRepository;

	beforeEach(() => {
		mockDb = createMockDb();
		repository = new SubscriptionRepository(mockDb as unknown as D1Database);
	});

	// =========================================================================
	// USER SUBSCRIPTIONS
	// =========================================================================

	describe("getUserSubscription", () => {
		it("should return user subscription when found", async () => {
			mockDb._mockFirst.mockResolvedValue(mockSubscriptionRow);

			const result = await repository.getUserSubscription("user-456");

			expect(result).not.toBeNull();
			expect(result?.id).toBe("sub-1");
			expect(result?.plan).toBe("business");
			expect(result?.referenceId).toBe("user-456");
			expect(result?.stripeCustomerId).toBe("cus_123");
			expect(result?.stripeSubscriptionId).toBe("sub_stripe_123");
			expect(result?.status).toBe("active");
			expect(result?.cancelAtPeriodEnd).toBe(false);
			expect(result?.periodStart).toBeInstanceOf(Date);
			expect(result?.periodEnd).toBeInstanceOf(Date);
		});

		it("should return subscription with trial dates", async () => {
			mockDb._mockFirst.mockResolvedValue({
				...mockSubscriptionRow,
				status: "trialing",
				trialStart: "2024-01-01T00:00:00Z",
				trialEnd: "2024-01-15T00:00:00Z",
			});

			const result = await repository.getUserSubscription("user-456");

			expect(result?.status).toBe("trialing");
			expect(result?.trialStart).toBeInstanceOf(Date);
			expect(result?.trialEnd).toBeInstanceOf(Date);
		});

		it("should return subscription with cancelAtPeriodEnd true", async () => {
			mockDb._mockFirst.mockResolvedValue({
				...mockSubscriptionRow,
				cancelAtPeriodEnd: 1,
			});

			const result = await repository.getUserSubscription("user-456");

			expect(result?.cancelAtPeriodEnd).toBe(true);
		});

		it("should handle null dates correctly", async () => {
			mockDb._mockFirst.mockResolvedValue({
				...mockSubscriptionRow,
				periodStart: null,
				periodEnd: null,
				trialStart: null,
				trialEnd: null,
			});

			const result = await repository.getUserSubscription("user-456");

			expect(result?.periodStart).toBeNull();
			expect(result?.periodEnd).toBeNull();
			expect(result?.trialStart).toBeNull();
			expect(result?.trialEnd).toBeNull();
		});

		it("should return null when no subscription found", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.getUserSubscription("user-456");

			expect(result).toBeNull();
		});
	});

	describe("getByStripeSubscriptionId", () => {
		it("should return subscription by Stripe ID", async () => {
			mockDb._mockFirst.mockResolvedValue(mockSubscriptionRow);

			const result =
				await repository.getByStripeSubscriptionId("sub_stripe_123");

			expect(result).not.toBeNull();
			expect(result?.stripeSubscriptionId).toBe("sub_stripe_123");
		});

		it("should return null when subscription not found", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.getByStripeSubscriptionId("nonexistent");

			expect(result).toBeNull();
		});

		it("should handle subscription with all fields populated", async () => {
			mockDb._mockFirst.mockResolvedValue({
				...mockSubscriptionRow,
				seats: 10,
				trialStart: "2024-01-01T00:00:00Z",
				trialEnd: "2024-01-15T00:00:00Z",
			});

			const result =
				await repository.getByStripeSubscriptionId("sub_stripe_123");

			expect(result?.seats).toBe(10);
			expect(result?.trialStart).toBeInstanceOf(Date);
			expect(result?.trialEnd).toBeInstanceOf(Date);
		});
	});

	// =========================================================================
	// ORGANIZATION USAGE
	// =========================================================================

	describe("getOrganizationUsage", () => {
		it("should return organization usage record", async () => {
			mockDb._mockFirst.mockResolvedValue(mockUsageRow);

			const result = await repository.getOrganizationUsage("org-123");

			expect(result).not.toBeNull();
			expect(result?.organizationId).toBe("org-123");
			expect(result?.ownerUserId).toBe("user-456");
			expect(result?.reportsUsed).toBe(5);
			expect(result?.noticesUsed).toBe(10);
			expect(result?.alertsUsed).toBe(75);
			expect(result?.transactionsUsed).toBe(300);
			expect(result?.clientsUsed).toBe(60);
			expect(result?.usersCount).toBe(3);
			expect(result?.periodStart).toBeInstanceOf(Date);
			expect(result?.periodEnd).toBeInstanceOf(Date);
			expect(result?.overageReportedAt).toBeNull();
			expect(result?.stripeUsageRecordId).toBeNull();
		});

		it("should return usage with overage reported", async () => {
			mockDb._mockFirst.mockResolvedValue({
				...mockUsageRow,
				overage_reported_at: "2024-01-20T00:00:00Z",
				stripe_usage_record_id: "usage_record_123",
			});

			const result = await repository.getOrganizationUsage("org-123");

			expect(result?.overageReportedAt).toBeInstanceOf(Date);
			expect(result?.stripeUsageRecordId).toBe("usage_record_123");
		});

		it("should return null when no usage record found", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.getOrganizationUsage("org-123");

			expect(result).toBeNull();
		});
	});

	describe("upsertOrganizationUsage", () => {
		it("should create or update organization usage", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });
			mockDb._mockFirst.mockResolvedValue(mockUsageRow);

			const result = await repository.upsertOrganizationUsage(
				"org-123",
				"user-456",
				new Date("2024-01-01"),
				new Date("2024-01-31"),
			);

			expect(result.organizationId).toBe("org-123");
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO organization_usage"),
			);
		});

		it("should throw error when creation fails", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });
			mockDb._mockFirst.mockResolvedValue(null);

			await expect(
				repository.upsertOrganizationUsage(
					"org-123",
					"user-456",
					new Date("2024-01-01"),
					new Date("2024-01-31"),
				),
			).rejects.toThrow("Failed to create organization usage record");
		});
	});

	describe("incrementUsage", () => {
		it("should increment alerts usage", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.incrementUsage("org-123", "alerts", 5);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("alerts_used = alerts_used + ?"),
			);
		});

		it("should increment reports usage", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.incrementUsage("org-123", "reports", 1);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("reports_used = reports_used + ?"),
			);
		});

		it("should increment notices usage", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.incrementUsage("org-123", "notices", 1);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("notices_used = notices_used + ?"),
			);
		});

		it("should increment transactions usage", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.incrementUsage("org-123", "transactions", 10);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("transactions_used = transactions_used + ?"),
			);
		});

		it("should increment clients usage", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.incrementUsage("org-123", "clients", 5);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("clients_used = clients_used + ?"),
			);
		});
	});

	describe("updateUsersCount", () => {
		it("should update users count for organization", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.updateUsersCount("org-123", 8);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("UPDATE organization_usage"),
			);
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("SET users_count = ?"),
			);
		});
	});

	describe("resetUsage", () => {
		it("should reset usage for new billing period", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.resetUsage(
				"org-123",
				new Date("2024-02-01"),
				new Date("2024-02-29"),
			);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("reports_used = 0"),
			);
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("notices_used = 0"),
			);
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("overage_reported_at = NULL"),
			);
		});
	});

	describe("markOverageReported", () => {
		it("should update overage reported timestamp and record ID", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.markOverageReported("org-123", "usage_record_456");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("SET overage_reported_at = datetime('now')"),
			);
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("stripe_usage_record_id = ?"),
			);
		});
	});

	// =========================================================================
	// MEMBER COUNTING
	// =========================================================================

	describe("countOrganizationMembers", () => {
		it("should return member count for organization", async () => {
			mockDb._mockFirst.mockResolvedValue({ count: 7 });

			const result = await repository.countOrganizationMembers("org-123");

			expect(result).toBe(7);
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("SELECT COUNT(*) as count FROM members"),
			);
		});

		it("should return 0 when no members found", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.countOrganizationMembers("org-123");

			expect(result).toBe(0);
		});
	});

	describe("getOrganizationOwnerUserId", () => {
		it("should return owner user ID", async () => {
			mockDb._mockFirst.mockResolvedValue({ userId: "user-456" });

			const result = await repository.getOrganizationOwnerUserId("org-123");

			expect(result).toBe("user-456");
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("WHERE organizationId = ? AND role = 'owner'"),
			);
		});

		it("should return null when no owner found", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.getOrganizationOwnerUserId("org-123");

			expect(result).toBeNull();
		});
	});

	describe("countOrganizationsOwned", () => {
		it("should return count of organizations owned by user", async () => {
			mockDb._mockFirst.mockResolvedValue({ count: 2 });

			const result = await repository.countOrganizationsOwned("user-456");

			expect(result).toBe(2);
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("WHERE userId = ? AND role = 'owner'"),
			);
		});

		it("should return 0 when user owns no organizations", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.countOrganizationsOwned("user-456");

			expect(result).toBe(0);
		});
	});

	describe("getOwnedOrganizationsWithMemberCounts", () => {
		it("should return owned organizations with member counts", async () => {
			mockDb._mockAll.mockResolvedValue({
				results: [
					{ organization_id: "org-1", member_count: 5 },
					{ organization_id: "org-2", member_count: 10 },
				],
			});

			const result =
				await repository.getOwnedOrganizationsWithMemberCounts("user-456");

			expect(result).toHaveLength(2);
			expect(result[0].organizationId).toBe("org-1");
			expect(result[0].memberCount).toBe(5);
			expect(result[1].organizationId).toBe("org-2");
			expect(result[1].memberCount).toBe(10);
		});

		it("should return empty array when no organizations owned", async () => {
			mockDb._mockAll.mockResolvedValue({ results: [] });

			const result =
				await repository.getOwnedOrganizationsWithMemberCounts("user-456");

			expect(result).toEqual([]);
		});

		it("should handle null results", async () => {
			mockDb._mockAll.mockResolvedValue({ results: null });

			const result =
				await repository.getOwnedOrganizationsWithMemberCounts("user-456");

			expect(result).toEqual([]);
		});
	});

	// =========================================================================
	// CARD FINGERPRINT (Trial abuse prevention)
	// =========================================================================

	describe("isCardFingerprintUsed", () => {
		it("should return true when fingerprint exists", async () => {
			mockDb._mockFirst.mockResolvedValue({ id: "fp-1" });

			const result = await repository.isCardFingerprintUsed("card_fp_123");

			expect(result).toBe(true);
		});

		it("should return false when fingerprint does not exist", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.isCardFingerprintUsed("card_fp_123");

			expect(result).toBe(false);
		});
	});

	describe("getCardFingerprint", () => {
		it("should return card fingerprint record", async () => {
			mockDb._mockFirst.mockResolvedValue(mockFingerprintRow);

			const result = await repository.getCardFingerprint("card_fp_123");

			expect(result).not.toBeNull();
			expect(result?.fingerprint).toBe("card_fp_123");
			expect(result?.firstUserId).toBe("user-456");
			expect(result?.usageCount).toBe(2);
			expect(result?.firstUsedAt).toBeInstanceOf(Date);
			expect(result?.lastUsedAt).toBeInstanceOf(Date);
			expect(result?.createdAt).toBeInstanceOf(Date);
		});

		it("should return null when fingerprint not found", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.getCardFingerprint("nonexistent");

			expect(result).toBeNull();
		});
	});

	describe("storeCardFingerprint", () => {
		it("should store new card fingerprint", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.storeCardFingerprint("card_fp_new", "user-789");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO used_card_fingerprints"),
			);
		});
	});

	describe("incrementCardFingerprintUsage", () => {
		it("should increment usage count for fingerprint", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.incrementCardFingerprintUsage("card_fp_123");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("usage_count = usage_count + 1"),
			);
		});
	});
});
