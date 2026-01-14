import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubscriptionRepository } from "./repository";

const createMockDb = () => {
	const mockPrepare = vi.fn();
	const mockBind = vi.fn();
	const mockFirst = vi.fn();
	const mockRun = vi.fn();

	const statement = {
		bind: mockBind,
		first: mockFirst,
		run: mockRun,
	};

	mockBind.mockReturnValue(statement);
	mockPrepare.mockReturnValue(statement);

	return {
		prepare: mockPrepare,
		_mockBind: mockBind,
		_mockFirst: mockFirst,
		_mockRun: mockRun,
	};
};

const sampleSubscriptionRow = {
	id: "sub-1",
	plan: "business",
	referenceId: "user-1",
	stripeCustomerId: "cus_123",
	stripeSubscriptionId: "sub_123",
	status: "active",
	periodStart: "2024-01-01T00:00:00.000Z",
	periodEnd: "2024-02-01T00:00:00.000Z",
	cancelAtPeriodEnd: 0,
	seats: 5,
	trialStart: null,
	trialEnd: null,
	createdAt: "2024-01-01T00:00:00.000Z",
	updatedAt: "2024-01-15T00:00:00.000Z",
};

const sampleTrialingSubscriptionRow = {
	...sampleSubscriptionRow,
	id: "sub-2",
	status: "trialing",
	trialStart: "2024-01-01T00:00:00.000Z",
	trialEnd: "2024-01-15T00:00:00.000Z",
};

const sampleOrgUsageRow = {
	id: "usage-1",
	organization_id: "org-1",
	owner_user_id: "user-1",
	notices_used: 50,
	alerts_used: 10,
	transactions_used: 100,
	users_count: 3,
	period_start: "2024-01-01T00:00:00.000Z",
	period_end: "2024-02-01T00:00:00.000Z",
	overage_reported_at: null,
	stripe_usage_record_id: null,
	created_at: "2024-01-01T00:00:00.000Z",
	updated_at: "2024-01-15T00:00:00.000Z",
};

const sampleCardFingerprintRow = {
	id: "fp-1",
	fingerprint: "fp_abc123",
	first_user_id: "user-1",
	first_used_at: "2024-01-01T00:00:00.000Z",
	last_used_at: "2024-01-15T00:00:00.000Z",
	usage_count: 2,
	created_at: "2024-01-01T00:00:00.000Z",
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
		it("returns mapped subscription when found", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(sampleSubscriptionRow);

			const result = await repository.getUserSubscription("user-1");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("subscription"),
			);
			expect(result).toEqual({
				id: "sub-1",
				plan: "business",
				referenceId: "user-1",
				stripeCustomerId: "cus_123",
				stripeSubscriptionId: "sub_123",
				status: "active",
				periodStart: new Date("2024-01-01T00:00:00.000Z"),
				periodEnd: new Date("2024-02-01T00:00:00.000Z"),
				cancelAtPeriodEnd: false,
				seats: 5,
				trialStart: null,
				trialEnd: null,
				createdAt: new Date("2024-01-01T00:00:00.000Z"),
				updatedAt: new Date("2024-01-15T00:00:00.000Z"),
			});
		});

		it("returns null when subscription not found", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(null);

			const result = await repository.getUserSubscription("user-1");

			expect(result).toBeNull();
		});

		it("handles trialing subscription with trial dates", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(sampleTrialingSubscriptionRow);

			const result = await repository.getUserSubscription("user-1");

			expect(result?.status).toBe("trialing");
			expect(result?.trialStart).toEqual(new Date("2024-01-01T00:00:00.000Z"));
			expect(result?.trialEnd).toEqual(new Date("2024-01-15T00:00:00.000Z"));
		});

		it("handles cancelAtPeriodEnd as boolean", async () => {
			mockDb._mockFirst.mockResolvedValueOnce({
				...sampleSubscriptionRow,
				cancelAtPeriodEnd: 1,
			});

			const result = await repository.getUserSubscription("user-1");

			expect(result?.cancelAtPeriodEnd).toBe(true);
		});
	});

	describe("getByStripeSubscriptionId", () => {
		it("returns mapped subscription when found", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(sampleSubscriptionRow);

			const result = await repository.getByStripeSubscriptionId("sub_123");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("stripeSubscriptionId"),
			);
			expect(result?.stripeSubscriptionId).toBe("sub_123");
		});

		it("returns null when not found", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(null);

			const result = await repository.getByStripeSubscriptionId("nonexistent");

			expect(result).toBeNull();
		});
	});

	// =========================================================================
	// ORGANIZATION USAGE
	// =========================================================================

	describe("getOrganizationUsage", () => {
		it("returns mapped usage when found", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(sampleOrgUsageRow);

			const result = await repository.getOrganizationUsage("org-1");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("organization_usage"),
			);
			expect(result).toEqual({
				id: "usage-1",
				organizationId: "org-1",
				ownerUserId: "user-1",
				noticesUsed: 50,
				alertsUsed: 10,
				transactionsUsed: 100,
				usersCount: 3,
				periodStart: new Date("2024-01-01T00:00:00.000Z"),
				periodEnd: new Date("2024-02-01T00:00:00.000Z"),
				overageReportedAt: null,
				stripeUsageRecordId: null,
				createdAt: new Date("2024-01-01T00:00:00.000Z"),
				updatedAt: new Date("2024-01-15T00:00:00.000Z"),
			});
		});

		it("returns null when not found", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(null);

			const result = await repository.getOrganizationUsage("nonexistent");

			expect(result).toBeNull();
		});

		it("handles overage_reported_at date when present", async () => {
			mockDb._mockFirst.mockResolvedValueOnce({
				...sampleOrgUsageRow,
				overage_reported_at: "2024-01-20T00:00:00.000Z",
				stripe_usage_record_id: "ur_123",
			});

			const result = await repository.getOrganizationUsage("org-1");

			expect(result?.overageReportedAt).toEqual(
				new Date("2024-01-20T00:00:00.000Z"),
			);
			expect(result?.stripeUsageRecordId).toBe("ur_123");
		});
	});

	describe("upsertOrganizationUsage", () => {
		it("creates usage and returns it", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });
			mockDb._mockFirst.mockResolvedValueOnce(sampleOrgUsageRow);

			const result = await repository.upsertOrganizationUsage(
				"org-1",
				"user-1",
				new Date("2024-01-01"),
				new Date("2024-02-01"),
			);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO organization_usage"),
			);
			expect(result.organizationId).toBe("org-1");
		});

		it("throws error when get after insert fails", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });
			mockDb._mockFirst.mockResolvedValueOnce(null);

			await expect(
				repository.upsertOrganizationUsage(
					"org-1",
					"user-1",
					new Date("2024-01-01"),
					new Date("2024-02-01"),
				),
			).rejects.toThrow("Failed to create organization usage record");
		});
	});

	describe("incrementUsage", () => {
		it("increments notices_used", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });

			await repository.incrementUsage("org-1", "notices", 5);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("notices_used"),
			);
		});

		it("increments alerts_used", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });

			await repository.incrementUsage("org-1", "alerts", 1);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("alerts_used"),
			);
		});

		it("increments transactions_used", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });

			await repository.incrementUsage("org-1", "transactions", 10);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("transactions_used"),
			);
		});
	});

	describe("updateUsersCount", () => {
		it("updates users_count", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });

			await repository.updateUsersCount("org-1", 10);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("users_count"),
			);
		});
	});

	describe("resetUsage", () => {
		it("resets all usage metrics", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });

			await repository.resetUsage(
				"org-1",
				new Date("2024-02-01"),
				new Date("2024-03-01"),
			);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("notices_used = 0"),
			);
		});
	});

	describe("markOverageReported", () => {
		it("marks overage as reported", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });

			await repository.markOverageReported("org-1", "ur_123");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("overage_reported_at"),
			);
		});
	});

	describe("countOrganizationsOwned", () => {
		it("returns count of owned organizations", async () => {
			mockDb._mockFirst.mockResolvedValueOnce({ count: 3 });

			const result = await repository.countOrganizationsOwned("user-1");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("members"),
			);
			expect(result).toBe(3);
		});

		it("returns 0 when no organizations owned", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(null);

			const result = await repository.countOrganizationsOwned("user-1");

			expect(result).toBe(0);
		});
	});

	// =========================================================================
	// CARD FINGERPRINT
	// =========================================================================

	describe("isCardFingerprintUsed", () => {
		it("returns true when fingerprint exists", async () => {
			mockDb._mockFirst.mockResolvedValueOnce({ id: "fp-1" });

			const result = await repository.isCardFingerprintUsed("fp_abc123");

			expect(result).toBe(true);
		});

		it("returns false when fingerprint not found", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(null);

			const result = await repository.isCardFingerprintUsed("fp_unknown");

			expect(result).toBe(false);
		});
	});

	describe("getCardFingerprint", () => {
		it("returns mapped fingerprint when found", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(sampleCardFingerprintRow);

			const result = await repository.getCardFingerprint("fp_abc123");

			expect(result).toEqual({
				id: "fp-1",
				fingerprint: "fp_abc123",
				firstUserId: "user-1",
				firstUsedAt: new Date("2024-01-01T00:00:00.000Z"),
				lastUsedAt: new Date("2024-01-15T00:00:00.000Z"),
				usageCount: 2,
				createdAt: new Date("2024-01-01T00:00:00.000Z"),
			});
		});

		it("returns null when not found", async () => {
			mockDb._mockFirst.mockResolvedValueOnce(null);

			const result = await repository.getCardFingerprint("fp_unknown");

			expect(result).toBeNull();
		});
	});

	describe("storeCardFingerprint", () => {
		it("stores new fingerprint", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });

			await repository.storeCardFingerprint("fp_new", "user-1");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO used_card_fingerprints"),
			);
		});
	});

	describe("incrementCardFingerprintUsage", () => {
		it("increments usage count", async () => {
			mockDb._mockRun.mockResolvedValueOnce({ success: true });

			await repository.incrementCardFingerprintUsage("fp_abc123");

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("usage_count = usage_count + 1"),
			);
		});
	});
});
