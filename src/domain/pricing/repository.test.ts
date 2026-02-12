/**
 * Pricing Repository Tests
 *
 * Tests for database operations on subscription plans, prices, limits, and licenses.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PricingRepository } from "./repository";

// Mock D1Database
const createMockDb = () => {
	const mockFirst = vi.fn();
	const mockAll = vi.fn();
	const mockRun = vi.fn();
	const mockBind = vi.fn(() => ({
		first: mockFirst,
		all: mockAll,
		run: mockRun,
	}));
	const mockPrepare = vi.fn(() => ({
		bind: mockBind,
		first: mockFirst,
		all: mockAll,
		run: mockRun,
	}));

	return {
		prepare: mockPrepare,
		_mock: {
			prepare: mockPrepare,
			bind: mockBind,
			first: mockFirst,
			all: mockAll,
			run: mockRun,
		},
	};
};

describe("PricingRepository", () => {
	let repository: PricingRepository;
	let mockDb: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		mockDb = createMockDb();
		repository = new PricingRepository(mockDb as unknown as D1Database);
	});

	describe("getActivePlans", () => {
		it("should return active plans sorted by sort_order", async () => {
			const mockPlans = [
				{
					id: "plan_business",
					name: "business",
					display_name: "Janovix Business",
					description: "Business plan",
					is_active: 1,
					sort_order: 1,
					trial_days: 14,
					metadata: null,
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-01T00:00:00Z",
				},
				{
					id: "plan_pro",
					name: "pro",
					display_name: "Janovix Pro",
					description: "Pro plan",
					is_active: 1,
					sort_order: 2,
					trial_days: 14,
					metadata: null,
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-01T00:00:00Z",
				},
			];

			mockDb._mock.all.mockResolvedValue({ results: mockPlans });

			const plans = await repository.getActivePlans();

			expect(plans).toHaveLength(2);
			expect(plans[0].name).toBe("business");
			expect(plans[0].displayName).toBe("Janovix Business");
			expect(plans[0].isActive).toBe(true);
			expect(plans[1].name).toBe("pro");
		});

		it("should return empty array when no plans exist", async () => {
			mockDb._mock.all.mockResolvedValue({ results: [] });

			const plans = await repository.getActivePlans();

			expect(plans).toEqual([]);
		});
	});

	describe("getPlanByName", () => {
		it("should return plan when found", async () => {
			const mockPlan = {
				id: "plan_business",
				name: "business",
				display_name: "Janovix Business",
				description: "Business plan",
				is_active: 1,
				sort_order: 1,
				trial_days: 14,
				metadata: null,
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			};

			mockDb._mock.first.mockResolvedValue(mockPlan);

			const plan = await repository.getPlanByName("business");

			expect(plan).not.toBeNull();
			expect(plan?.name).toBe("business");
			expect(plan?.displayName).toBe("Janovix Business");
		});

		it("should return null when plan not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const plan = await repository.getPlanByName("nonexistent");

			expect(plan).toBeNull();
		});
	});

	describe("getLimitsByPlanName", () => {
		it("should return limits for valid plan", async () => {
			const mockLimits = {
				id: "limit_business",
				plan_id: "plan_business",
				max_organizations: 1,
				users_per_org: 5,
				reports_per_month: 0,
				notices_per_month: 3,
				alerts_per_month: 50,
				operations_per_month: 250,
				clients_per_month: 50,
				metadata: null,
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			};

			mockDb._mock.first.mockResolvedValue(mockLimits);

			const limits = await repository.getLimitsByPlanName("business");

			expect(limits).not.toBeNull();
			expect(limits?.maxOrganizations).toBe(1);
			expect(limits?.usersPerOrg).toBe(5);
			expect(limits?.noticesPerMonth).toBe(3);
			expect(limits?.alertsPerMonth).toBe(50);
		});

		it("should return null when plan not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const limits = await repository.getLimitsByPlanName("nonexistent");

			expect(limits).toBeNull();
		});
	});

	describe("getPricesForPlan", () => {
		it("should return all active prices for plan", async () => {
			const mockPrices = [
				{
					id: "price_1",
					plan_id: "plan_business",
					stripe_price_id: "price_business",
					price_type: "subscription",
					amount: 999900,
					currency: "MXN",
					interval: "month",
					interval_count: 1,
					description: "Monthly subscription",
					is_active: 1,
					metadata: null,
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-01T00:00:00Z",
				},
				{
					id: "price_2",
					plan_id: "plan_business",
					stripe_price_id: "price_seat",
					price_type: "seat",
					amount: 25000,
					currency: "MXN",
					interval: "month",
					interval_count: 1,
					description: "Extra user",
					is_active: 1,
					metadata: null,
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-01T00:00:00Z",
				},
			];

			mockDb._mock.all.mockResolvedValue({ results: mockPrices });

			const prices = await repository.getPricesForPlan("plan_business");

			expect(prices).toHaveLength(2);
			expect(prices[0].priceType).toBe("subscription");
			expect(prices[0].amount).toBe(999900);
			expect(prices[1].priceType).toBe("seat");
		});
	});

	describe("getLicenseByKey", () => {
		it("should return license when found", async () => {
			const mockLicense = {
				id: "lic_1",
				key: "ENT-XXXX-XXXX-XXXX",
				organization_name: "Acme Corp",
				user_id: null,
				issued_by: null,
				status: "active",
				expires_at: null,
				activated_at: null,
				notes: null,
				max_organizations: 5,
				max_users: 50,
				reports_per_month: 100,
				notices_per_month: 0,
				alerts_per_month: 0,
				operations_per_month: 0,
				clients_per_month: 0,
				watchlist_queries_per_day: 0,
				metadata: null,
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			};

			mockDb._mock.first.mockResolvedValue(mockLicense);

			const license = await repository.getLicenseByKey("ENT-XXXX-XXXX-XXXX");

			expect(license).not.toBeNull();
			expect(license?.key).toBe("ENT-XXXX-XXXX-XXXX");
			expect(license?.organizationName).toBe("Acme Corp");
			expect(license?.maxOrganizations).toBe(5);
			expect(license?.maxUsers).toBe(50);
			expect(license?.reportsPerMonth).toBe(100);
		});

		it("should return null when license not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const license = await repository.getLicenseByKey("INVALID-KEY");

			expect(license).toBeNull();
		});
	});

	describe("getLicenseByUserId", () => {
		it("should return active non-expired license for user", async () => {
			const mockLicense = {
				id: "lic_1",
				key: "ENT-XXXX-XXXX-XXXX",
				organization_name: "Acme Corp",
				plan_id: "plan_pro",
				user_id: "user_123",
				status: "active",
				expires_at: null,
				activated_at: "2024-01-15T00:00:00Z",
				max_organizations: null,
				max_users: null,
				reports_included: null,
				notices_included: null,
				alerts_included: null,
				operations_included: null,
				clients_included: null,
				metadata: null,
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-15T00:00:00Z",
			};

			mockDb._mock.first.mockResolvedValue(mockLicense);

			const license = await repository.getLicenseByUserId("user_123");

			expect(license).not.toBeNull();
			expect(license?.userId).toBe("user_123");
			expect(license?.status).toBe("active");
		});
	});

	describe("metadata parsing", () => {
		it("should parse JSON metadata correctly", async () => {
			const mockPlan = {
				id: "plan_custom",
				name: "custom",
				display_name: "Custom Plan",
				description: null,
				is_active: 1,
				sort_order: 3,
				trial_days: 30,
				metadata: '{"custom_feature": true, "tier": "enterprise"}',
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			};

			mockDb._mock.first.mockResolvedValue(mockPlan);

			const plan = await repository.getPlanByName("custom");

			expect(plan?.metadata).toEqual({
				custom_feature: true,
				tier: "enterprise",
			});
		});

		it("should handle null metadata", async () => {
			const mockPlan = {
				id: "plan_business",
				name: "business",
				display_name: "Business",
				description: null,
				is_active: 1,
				sort_order: 1,
				trial_days: 14,
				metadata: null,
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			};

			mockDb._mock.first.mockResolvedValue(mockPlan);

			const plan = await repository.getPlanByName("business");

			expect(plan?.metadata).toBeNull();
		});
	});
});
