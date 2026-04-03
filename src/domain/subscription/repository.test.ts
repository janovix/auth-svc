/**
 * Subscription repository unit tests
 *
 * Tests for member counting and organization owner lookup
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

describe("SubscriptionRepository", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let repository: SubscriptionRepository;

	beforeEach(() => {
		mockDb = createMockDb();
		repository = new SubscriptionRepository(mockDb as unknown as D1Database);
	});

	describe("getUserSubscription", () => {
		it("should return subscription with licenseId mapped", async () => {
			mockDb._mockFirst.mockResolvedValue({
				id: "sub-1",
				plan: "enterprise",
				referenceId: "user-123",
				stripeCustomerId: null,
				stripeSubscriptionId: null,
				licenseId: "license-abc",
				status: "active",
				periodStart: null,
				periodEnd: null,
				cancelAtPeriodEnd: 0,
				seats: null,
				trialStart: null,
				trialEnd: null,
				createdAt: "2024-06-01T00:00:00Z",
				updatedAt: "2024-06-01T00:00:00Z",
			});

			const result = await repository.getUserSubscription("user-123");

			expect(result).not.toBeNull();
			expect(result?.licenseId).toBe("license-abc");
			expect(result?.plan).toBe("enterprise");
			expect(result?.stripeSubscriptionId).toBeNull();
		});

		it("should return null licenseId for Stripe subscriptions", async () => {
			mockDb._mockFirst.mockResolvedValue({
				id: "sub-2",
				plan: "business",
				referenceId: "user-456",
				stripeCustomerId: "cus_123",
				stripeSubscriptionId: "sub_stripe_123",
				licenseId: null,
				status: "active",
				periodStart: "2024-01-01T00:00:00Z",
				periodEnd: "2024-01-31T00:00:00Z",
				cancelAtPeriodEnd: 0,
				seats: null,
				trialStart: null,
				trialEnd: null,
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-15T00:00:00Z",
			});

			const result = await repository.getUserSubscription("user-456");

			expect(result).not.toBeNull();
			expect(result?.licenseId).toBeNull();
			expect(result?.stripeSubscriptionId).toBe("sub_stripe_123");
		});

		it("should return null when no subscription exists", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.getUserSubscription("user-none");

			expect(result).toBeNull();
		});

		it("should use ORDER BY that prioritizes active status over stripeSubscriptionId", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			await repository.getUserSubscription("user-123");

			// Verify the query prioritizes active/trialing status first
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining(
					"CASE WHEN status IN ('active', 'trialing') THEN 0 ELSE 1 END",
				),
			);
			// Verify the query considers both stripeSubscriptionId and licenseId
			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining(
					"CASE WHEN stripeSubscriptionId IS NOT NULL OR licenseId IS NOT NULL THEN 0 ELSE 1 END",
				),
			);
		});
	});

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
				expect.stringContaining(
					"WHERE m.userId = ? AND m.role = 'owner' AND o.status = 'active'",
				),
			);
		});

		it("should return 0 when user owns no organizations", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.countOrganizationsOwned("user-456");

			expect(result).toBe(0);
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

		it("should increment operations usage", async () => {
			mockDb._mockRun.mockResolvedValue({ success: true });

			await repository.incrementUsage("org-123", "operations", 10);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining("operations_used = operations_used + ?"),
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

	describe("getOrganizationUsage", () => {
		it("should return organization usage record", async () => {
			mockDb._mockFirst.mockResolvedValue({
				id: "usage-1",
				organization_id: "org-123",
				owner_user_id: "user-456",
				reports_used: 5,
				notices_used: 10,
				alerts_used: 75,
				operations_used: 300,
				clients_used: 60,
				users_count: 3,
				period_start: "2024-01-01T00:00:00Z",
				period_end: "2024-01-31T00:00:00Z",
				overage_reported_at: null,
				stripe_usage_record_id: null,
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-15T00:00:00Z",
			});

			const result = await repository.getOrganizationUsage("org-123");

			expect(result).not.toBeNull();
			expect(result?.organizationId).toBe("org-123");
			expect(result?.reportsUsed).toBe(5);
			expect(result?.noticesUsed).toBe(10);
			expect(result?.alertsUsed).toBe(75);
			expect(result?.operationsUsed).toBe(300);
			expect(result?.clientsUsed).toBe(60);
			expect(result?.usersCount).toBe(3);
		});

		it("should return null when no usage record found", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await repository.getOrganizationUsage("org-123");

			expect(result).toBeNull();
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
});
