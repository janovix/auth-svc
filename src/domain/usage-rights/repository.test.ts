import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsageRightsRepository } from "./repository";

const createMockDb = () => {
	const mockRun = vi.fn().mockResolvedValue({});
	const mockFirst = vi.fn();
	const mockBind = vi.fn();
	const statement = { bind: mockBind, first: mockFirst, run: mockRun };
	mockBind.mockReturnValue(statement);
	const mockPrepare = vi.fn().mockReturnValue(statement);
	return {
		prepare: mockPrepare,
		_mockFirst: mockFirst,
		_mockRun: mockRun,
		_mockBind: mockBind,
	};
};

describe("UsageRightsRepository", () => {
	let db: ReturnType<typeof createMockDb>;
	let repo: UsageRightsRepository;

	beforeEach(() => {
		db = createMockDb();
		repo = new UsageRightsRepository(db as unknown as D1Database);
	});

	describe("getOrganizationOwnerUserId", () => {
		it("returns userId when owner exists", async () => {
			db._mockFirst.mockResolvedValue({ userId: "user-1" });
			const result = await repo.getOrganizationOwnerUserId("org-1");
			expect(result).toBe("user-1");
		});

		it("returns null when no owner", async () => {
			db._mockFirst.mockResolvedValue(null);
			const result = await repo.getOrganizationOwnerUserId("org-1");
			expect(result).toBeNull();
		});
	});

	describe("getLicenseByUserId", () => {
		const licenseRow = {
			id: "lic-1",
			key: "ENT-TEST-KEY",
			organization_name: "Test Org",
			user_id: "user-1",
			issued_by: "admin",
			status: "active",
			expires_at: "2030-01-01T00:00:00Z",
			activated_at: "2024-01-01T00:00:00Z",
			notes: "Test notes",
			max_organizations: 5,
			max_users: 50,
			reports_per_month: 100,
			notices_per_month: 200,
			alerts_per_month: 300,
			operations_per_month: 400,
			clients_per_month: 500,
			watchlist_queries_per_month: 1000,
			metadata: '{"tier":"enterprise"}',
			created_at: "2024-01-01T00:00:00Z",
			updated_at: "2024-01-01T00:00:00Z",
		};

		it("returns mapped license when found", async () => {
			db._mockFirst.mockResolvedValue(licenseRow);
			const result = await repo.getLicenseByUserId("user-1");

			expect(result).not.toBeNull();
			expect(result?.id).toBe("lic-1");
			expect(result?.key).toBe("ENT-TEST-KEY");
			expect(result?.organizationName).toBe("Test Org");
			expect(result?.maxOrganizations).toBe(5);
			expect(result?.reportsPerMonth).toBe(100);
			expect(result?.metadata).toEqual({ tier: "enterprise" });
			expect(result?.expiresAt).toBeInstanceOf(Date);
			expect(result?.activatedAt).toBeInstanceOf(Date);
		});

		it("returns null when license not found", async () => {
			db._mockFirst.mockResolvedValue(null);
			const result = await repo.getLicenseByUserId("user-1");
			expect(result).toBeNull();
		});

		it("handles null nullable fields", async () => {
			db._mockFirst.mockResolvedValue({
				...licenseRow,
				expires_at: null,
				activated_at: null,
				notes: null,
				metadata: null,
				user_id: null,
				issued_by: null,
			});
			const result = await repo.getLicenseByUserId("user-1");

			expect(result?.expiresAt).toBeNull();
			expect(result?.activatedAt).toBeNull();
			expect(result?.notes).toBeNull();
			expect(result?.metadata).toBeNull();
		});
	});

	describe("getUserSubscription", () => {
		it("returns mapped subscription when found", async () => {
			db._mockFirst.mockResolvedValue({
				id: "sub-1",
				plan: "business",
				status: "active",
				stripeSubscriptionId: "sub_stripe_123",
				periodStart: "2024-01-01T00:00:00Z",
				periodEnd: "2024-02-01T00:00:00Z",
			});
			const result = await repo.getUserSubscription("user-1");

			expect(result).not.toBeNull();
			expect(result?.id).toBe("sub-1");
			expect(result?.plan).toBe("business");
			expect(result?.status).toBe("active");
			expect(result?.periodStart).toBeInstanceOf(Date);
			expect(result?.periodEnd).toBeInstanceOf(Date);
		});

		it("returns null when no subscription", async () => {
			db._mockFirst.mockResolvedValue(null);
			const result = await repo.getUserSubscription("user-1");
			expect(result).toBeNull();
		});

		it("query excludes license-backed rows so Step2 is Stripe-only", async () => {
			db._mockFirst.mockResolvedValue(null);
			await repo.getUserSubscription("user-1");
			expect(db.prepare).toHaveBeenCalledWith(
				expect.stringContaining("licenseId IS NULL"),
			);
		});

		it("handles null period dates", async () => {
			db._mockFirst.mockResolvedValue({
				id: "sub-1",
				plan: "free",
				status: "active",
				stripeSubscriptionId: null,
				periodStart: null,
				periodEnd: null,
			});
			const result = await repo.getUserSubscription("user-1");

			expect(result?.periodStart).toBeNull();
			expect(result?.periodEnd).toBeNull();
		});
	});

	describe("getOrganizationUsage", () => {
		it("returns mapped usage when found", async () => {
			db._mockFirst.mockResolvedValue({
				reports_used: 10,
				notices_used: 20,
				alerts_used: 30,
				operations_used: 40,
				clients_used: 50,
				users_count: 5,
			});
			const result = await repo.getOrganizationUsage("org-1");

			expect(result?.reportsUsed).toBe(10);
			expect(result?.noticesUsed).toBe(20);
			expect(result?.alertsUsed).toBe(30);
			expect(result?.usersCount).toBe(5);
		});

		it("returns null when no usage record", async () => {
			db._mockFirst.mockResolvedValue(null);
			const result = await repo.getOrganizationUsage("org-1");
			expect(result).toBeNull();
		});
	});

	describe("getDailyUsage", () => {
		it("returns watchlist queries used", async () => {
			db._mockFirst.mockResolvedValue({ watchlist_queries_used: 42 });
			const result = await repo.getDailyUsage("org-1", "2024-01-15");
			expect(result?.watchlistQueriesUsed).toBe(42);
		});

		it("returns null when no record", async () => {
			db._mockFirst.mockResolvedValue(null);
			const result = await repo.getDailyUsage("org-1", "2024-01-15");
			expect(result).toBeNull();
		});
	});

	describe("getMonthlyWatchlistQueriesUsed", () => {
		it("returns summed total", async () => {
			db._mockFirst.mockResolvedValue({ total: 150 });
			const result = await repo.getMonthlyWatchlistQueriesUsed(
				"org-1",
				"2024-01-01",
				"2024-01-31",
			);
			expect(result).toBe(150);
		});

		it("returns 0 when no records", async () => {
			db._mockFirst.mockResolvedValue(null);
			const result = await repo.getMonthlyWatchlistQueriesUsed(
				"org-1",
				"2024-01-01",
				"2024-01-31",
			);
			expect(result).toBe(0);
		});
	});

	describe("incrementMonthlyUsage", () => {
		it("increments reports metric", async () => {
			await repo.incrementMonthlyUsage("org-1", "reports", 1);
			expect(db._mockRun).toHaveBeenCalled();
			expect(db.prepare).toHaveBeenCalledWith(
				expect.stringContaining("reports_used"),
			);
		});

		it("increments alerts metric", async () => {
			await repo.incrementMonthlyUsage("org-1", "alerts", 5);
			expect(db._mockRun).toHaveBeenCalled();
		});

		it("throws for unknown metric", async () => {
			await expect(
				repo.incrementMonthlyUsage("org-1", "unknown_metric", 1),
			).rejects.toThrow("Unknown monthly metric: unknown_metric");
		});
	});

	describe("incrementDailyWatchlistQueries", () => {
		it("calls upsert query", async () => {
			await repo.incrementDailyWatchlistQueries("org-1", "2024-01-15", 3);
			expect(db._mockRun).toHaveBeenCalled();
			expect(db.prepare).toHaveBeenCalledWith(
				expect.stringContaining("ON CONFLICT"),
			);
		});
	});

	describe("countOrganizationsOwned", () => {
		it("returns count", async () => {
			db._mockFirst.mockResolvedValue({ count: 3 });
			const result = await repo.countOrganizationsOwned("user-1");
			expect(result).toBe(3);
		});

		it("returns 0 when no result", async () => {
			db._mockFirst.mockResolvedValue(null);
			const result = await repo.countOrganizationsOwned("user-1");
			expect(result).toBe(0);
		});
	});

	describe("ensureOrganizationUsage", () => {
		it("inserts when no existing record", async () => {
			db._mockFirst.mockResolvedValue(null);
			await repo.ensureOrganizationUsage("org-1", "user-1");
			expect(db._mockRun).toHaveBeenCalled();
			expect(db.prepare).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO organization_usage"),
			);
		});

		it("skips insert when record exists", async () => {
			db._mockFirst.mockResolvedValue({ id: "usage-1" });
			await repo.ensureOrganizationUsage("org-1", "user-1");
			expect(db._mockRun).not.toHaveBeenCalled();
		});
	});

	describe("cleanOldDailyUsage", () => {
		it("calls delete query", async () => {
			await repo.cleanOldDailyUsage("org-1", "2024-01-01");
			expect(db._mockRun).toHaveBeenCalled();
			expect(db.prepare).toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM organization_daily_usage"),
			);
		});
	});
});
