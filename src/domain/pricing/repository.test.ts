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

// Common mock data
const mockPlanRow = {
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

const mockPriceRow = {
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
};

const mockLimitsRow = {
	id: "limit_business",
	plan_id: "plan_business",
	max_organizations: 1,
	users_per_org: 5,
	reports_per_month: 0,
	notices_per_month: 3,
	alerts_per_month: 50,
	transactions_per_month: 250,
	clients_per_month: 50,
	watchlist_queries_per_day: 100,
	metadata: null,
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-01T00:00:00Z",
};

const mockLicenseRow = {
	id: "lic_1",
	key: "ENT-XXXX-XXXX-XXXX",
	organization_name: "Acme Corp",
	plan_id: "plan_pro",
	user_id: null,
	status: "active",
	expires_at: null,
	activated_at: null,
	max_organizations: 5,
	max_users: 50,
	reports_included: 100,
	notices_included: null,
	alerts_included: null,
	transactions_included: null,
	clients_included: null,
	metadata: null,
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-01T00:00:00Z",
};

describe("PricingRepository", () => {
	let repository: PricingRepository;
	let mockDb: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		mockDb = createMockDb();
		repository = new PricingRepository(mockDb as unknown as D1Database);
	});

	// =========================================================================
	// SUBSCRIPTION PLANS
	// =========================================================================

	describe("getActivePlans", () => {
		it("should return active plans sorted by sort_order", async () => {
			const mockPlans = [
				mockPlanRow,
				{
					...mockPlanRow,
					id: "plan_pro",
					name: "pro",
					display_name: "Janovix Pro",
					sort_order: 2,
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

	describe("getAllPlans", () => {
		it("should return all plans including inactive", async () => {
			const mockPlans = [
				mockPlanRow,
				{ ...mockPlanRow, id: "plan_inactive", name: "inactive", is_active: 0 },
			];

			mockDb._mock.all.mockResolvedValue({ results: mockPlans });

			const plans = await repository.getAllPlans();

			expect(plans).toHaveLength(2);
			expect(plans[0].isActive).toBe(true);
			expect(plans[1].isActive).toBe(false);
		});
	});

	describe("getPlanById", () => {
		it("should return plan when found", async () => {
			mockDb._mock.first.mockResolvedValue(mockPlanRow);

			const plan = await repository.getPlanById("plan_business");

			expect(plan).not.toBeNull();
			expect(plan?.id).toBe("plan_business");
			expect(plan?.name).toBe("business");
		});

		it("should return null when plan not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const plan = await repository.getPlanById("nonexistent");

			expect(plan).toBeNull();
		});
	});

	describe("getPlanByName", () => {
		it("should return plan when found", async () => {
			mockDb._mock.first.mockResolvedValue(mockPlanRow);

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

	describe("createPlan", () => {
		it("should create a new plan with all fields", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(mockPlanRow);

			const plan = await repository.createPlan({
				name: "business",
				displayName: "Janovix Business",
				description: "Business plan",
				isActive: true,
				sortOrder: 1,
				trialDays: 14,
			});

			expect(plan.name).toBe("business");
			expect(plan.displayName).toBe("Janovix Business");
			expect(mockDb.prepare).toHaveBeenCalled();
		});

		it("should create plan with default values", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(mockPlanRow);

			const plan = await repository.createPlan({
				name: "basic",
				displayName: "Basic Plan",
			});

			expect(plan).toBeDefined();
		});

		it("should throw error when plan creation fails", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(null);

			await expect(
				repository.createPlan({
					name: "test",
					displayName: "Test",
				}),
			).rejects.toThrow("Failed to create plan");
		});
	});

	describe("updatePlan", () => {
		it("should update plan fields", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue({
				...mockPlanRow,
				display_name: "Updated Name",
			});

			const plan = await repository.updatePlan("plan_business", {
				displayName: "Updated Name",
				description: "Updated description",
				isActive: false,
				sortOrder: 5,
				trialDays: 30,
			});

			expect(plan?.displayName).toBe("Updated Name");
		});

		it("should update plan name", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue({
				...mockPlanRow,
				name: "new_name",
			});

			const plan = await repository.updatePlan("plan_business", {
				name: "new_name",
			});

			expect(plan?.name).toBe("new_name");
		});

		it("should return existing plan when no updates provided", async () => {
			mockDb._mock.first.mockResolvedValue(mockPlanRow);

			const plan = await repository.updatePlan("plan_business", {});

			expect(plan?.name).toBe("business");
		});
	});

	describe("deletePlan", () => {
		it("should soft delete a plan by marking inactive", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });

			await repository.deletePlan("plan_business");

			expect(mockDb.prepare).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// PLAN PRICES
	// =========================================================================

	describe("getPricesForPlan", () => {
		it("should return all active prices for plan", async () => {
			const mockPrices = [
				mockPriceRow,
				{ ...mockPriceRow, id: "price_2", price_type: "seat", amount: 25000 },
			];

			mockDb._mock.all.mockResolvedValue({ results: mockPrices });

			const prices = await repository.getPricesForPlan("plan_business");

			expect(prices).toHaveLength(2);
			expect(prices[0].priceType).toBe("subscription");
			expect(prices[0].amount).toBe(999900);
		});
	});

	describe("getAllActivePrices", () => {
		it("should return all active prices", async () => {
			mockDb._mock.all.mockResolvedValue({ results: [mockPriceRow] });

			const prices = await repository.getAllActivePrices();

			expect(prices).toHaveLength(1);
			expect(prices[0].isActive).toBe(true);
		});
	});

	describe("getPriceByStripePriceId", () => {
		it("should return price when found", async () => {
			mockDb._mock.first.mockResolvedValue(mockPriceRow);

			const price = await repository.getPriceByStripePriceId("price_business");

			expect(price).not.toBeNull();
			expect(price?.stripePriceId).toBe("price_business");
		});

		it("should return null when price not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const price = await repository.getPriceByStripePriceId("nonexistent");

			expect(price).toBeNull();
		});
	});

	describe("getPriceById", () => {
		it("should return price when found", async () => {
			mockDb._mock.first.mockResolvedValue(mockPriceRow);

			const price = await repository.getPriceById("price_1");

			expect(price).not.toBeNull();
			expect(price?.id).toBe("price_1");
		});

		it("should return null when price not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const price = await repository.getPriceById("nonexistent");

			expect(price).toBeNull();
		});
	});

	describe("createPrice", () => {
		it("should create a new price", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(mockPriceRow);

			const price = await repository.createPrice({
				planId: "plan_business",
				stripePriceId: "price_business",
				priceType: "subscription",
				amount: 999900,
				currency: "MXN",
				interval: "month",
				intervalCount: 1,
				description: "Monthly subscription",
			});

			expect(price.stripePriceId).toBe("price_business");
			expect(price.amount).toBe(999900);
		});

		it("should create price with minimal fields", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(mockPriceRow);

			const price = await repository.createPrice({
				planId: "plan_business",
				stripePriceId: "price_test",
				priceType: "subscription",
				amount: 100,
			});

			expect(price).toBeDefined();
		});

		it("should throw error when price creation fails", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(null);

			await expect(
				repository.createPrice({
					planId: "plan_business",
					stripePriceId: "price_test",
					priceType: "subscription",
					amount: 100,
				}),
			).rejects.toThrow("Failed to create price");
		});
	});

	describe("updatePrice", () => {
		it("should update price fields", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue({
				...mockPriceRow,
				amount: 500000,
			});

			const price = await repository.updatePrice("price_1", {
				amount: 500000,
				description: "Updated",
				stripePriceId: "new_price_id",
				priceType: "seat",
				currency: "USD",
				interval: "year",
				intervalCount: 1,
				isActive: false,
			});

			expect(price?.amount).toBe(500000);
		});

		it("should return existing price when no updates provided", async () => {
			mockDb._mock.first.mockResolvedValue(mockPriceRow);

			const price = await repository.updatePrice("price_1", {});

			expect(price?.amount).toBe(999900);
		});
	});

	describe("updatePriceByStripePriceId", () => {
		it("should update price by stripe price ID", async () => {
			mockDb._mock.first
				.mockResolvedValueOnce(mockPriceRow)
				.mockResolvedValueOnce({ ...mockPriceRow, amount: 500000 });
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });

			const price = await repository.updatePriceByStripePriceId(
				"price_business",
				{ amount: 500000 },
			);

			expect(price?.amount).toBe(500000);
		});

		it("should return null when price not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const price = await repository.updatePriceByStripePriceId("nonexistent", {
				amount: 500000,
			});

			expect(price).toBeNull();
		});
	});

	describe("deletePrice", () => {
		it("should soft delete a price", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });

			await repository.deletePrice("price_1");

			expect(mockDb.prepare).toHaveBeenCalled();
		});
	});

	describe("deletePriceByStripePriceId", () => {
		it("should soft delete price by stripe price ID", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });

			await repository.deletePriceByStripePriceId("price_business");

			expect(mockDb.prepare).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// PLAN LIMITS
	// =========================================================================

	describe("getLimitsForPlan", () => {
		it("should return limits for plan", async () => {
			mockDb._mock.first.mockResolvedValue(mockLimitsRow);

			const limits = await repository.getLimitsForPlan("plan_business");

			expect(limits).not.toBeNull();
			expect(limits?.maxOrganizations).toBe(1);
			expect(limits?.usersPerOrg).toBe(5);
			expect(limits?.watchlistQueriesPerDay).toBe(100);
		});

		it("should return null when limits not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const limits = await repository.getLimitsForPlan("nonexistent");

			expect(limits).toBeNull();
		});
	});

	describe("getLimitsByPlanName", () => {
		it("should return limits for valid plan", async () => {
			mockDb._mock.first.mockResolvedValue(mockLimitsRow);

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

	describe("upsertLimits", () => {
		it("should create or update limits", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(mockLimitsRow);

			const limits = await repository.upsertLimits({
				planId: "plan_business",
				maxOrganizations: 1,
				usersPerOrg: 5,
				reportsPerMonth: 0,
				noticesPerMonth: 3,
				alertsPerMonth: 50,
				transactionsPerMonth: 250,
				clientsPerMonth: 50,
				watchlistQueriesPerDay: 100,
			});

			expect(limits.maxOrganizations).toBe(1);
		});

		it("should use default values when not provided", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(mockLimitsRow);

			const limits = await repository.upsertLimits({
				planId: "plan_business",
			});

			expect(limits).toBeDefined();
		});

		it("should throw error when limits creation fails", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(null);

			await expect(
				repository.upsertLimits({
					planId: "plan_business",
				}),
			).rejects.toThrow("Failed to create/update limits");
		});
	});

	// =========================================================================
	// ENTERPRISE LICENSES
	// =========================================================================

	describe("getLicenseByKey", () => {
		it("should return license when found", async () => {
			mockDb._mock.first.mockResolvedValue(mockLicenseRow);

			const license = await repository.getLicenseByKey("ENT-XXXX-XXXX-XXXX");

			expect(license).not.toBeNull();
			expect(license?.key).toBe("ENT-XXXX-XXXX-XXXX");
			expect(license?.organizationName).toBe("Acme Corp");
			expect(license?.maxOrganizations).toBe(5);
			expect(license?.maxUsers).toBe(50);
			expect(license?.reportsIncluded).toBe(100);
		});

		it("should return null when license not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const license = await repository.getLicenseByKey("INVALID-KEY");

			expect(license).toBeNull();
		});
	});

	describe("getLicenseById", () => {
		it("should return license when found", async () => {
			mockDb._mock.first.mockResolvedValue(mockLicenseRow);

			const license = await repository.getLicenseById("lic_1");

			expect(license).not.toBeNull();
			expect(license?.id).toBe("lic_1");
		});

		it("should return null when license not found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const license = await repository.getLicenseById("nonexistent");

			expect(license).toBeNull();
		});
	});

	describe("getLicenseByUserId", () => {
		it("should return active non-expired license for user", async () => {
			const userLicense = {
				...mockLicenseRow,
				user_id: "user_123",
				activated_at: "2024-01-15T00:00:00Z",
			};
			mockDb._mock.first.mockResolvedValue(userLicense);

			const license = await repository.getLicenseByUserId("user_123");

			expect(license).not.toBeNull();
			expect(license?.userId).toBe("user_123");
			expect(license?.status).toBe("active");
		});

		it("should return null when no license found", async () => {
			mockDb._mock.first.mockResolvedValue(null);

			const license = await repository.getLicenseByUserId(
				"user_without_license",
			);

			expect(license).toBeNull();
		});
	});

	describe("createLicense", () => {
		it("should create a new license", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(mockLicenseRow);

			const license = await repository.createLicense({
				key: "ENT-XXXX-XXXX-XXXX",
				organizationName: "Acme Corp",
				planId: "plan_pro",
				maxOrganizations: 5,
				maxUsers: 50,
				reportsIncluded: 100,
				noticesIncluded: 200,
				alertsIncluded: 300,
				transactionsIncluded: 400,
				clientsIncluded: 500,
				expiresAt: new Date("2025-01-01"),
			});

			expect(license.key).toBe("ENT-XXXX-XXXX-XXXX");
			expect(license.organizationName).toBe("Acme Corp");
		});

		it("should create license with minimal fields", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(mockLicenseRow);

			const license = await repository.createLicense({
				key: "ENT-TEST",
				organizationName: "Test Corp",
				planId: "plan_pro",
			});

			expect(license).toBeDefined();
		});

		it("should throw error when license creation fails", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });
			mockDb._mock.first.mockResolvedValue(null);

			await expect(
				repository.createLicense({
					key: "ENT-TEST",
					organizationName: "Test Corp",
					planId: "plan_pro",
				}),
			).rejects.toThrow("Failed to create license");
		});
	});

	describe("activateLicense", () => {
		it("should activate a license for a user", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });

			await repository.activateLicense("lic_1", "user_123");

			expect(mockDb.prepare).toHaveBeenCalled();
		});
	});

	describe("revokeLicense", () => {
		it("should revoke a license", async () => {
			mockDb._mock.run.mockResolvedValue({ meta: { changes: 1 } });

			await repository.revokeLicense("lic_1");

			expect(mockDb.prepare).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// METADATA AND MAPPING
	// =========================================================================

	describe("metadata parsing", () => {
		it("should parse JSON metadata correctly for plans", async () => {
			const mockPlan = {
				...mockPlanRow,
				metadata: '{"custom_feature": true, "tier": "enterprise"}',
			};

			mockDb._mock.first.mockResolvedValue(mockPlan);

			const plan = await repository.getPlanByName("custom");

			expect(plan?.metadata).toEqual({
				custom_feature: true,
				tier: "enterprise",
			});
		});

		it("should handle null metadata for plans", async () => {
			mockDb._mock.first.mockResolvedValue(mockPlanRow);

			const plan = await repository.getPlanByName("business");

			expect(plan?.metadata).toBeNull();
		});

		it("should parse JSON metadata correctly for prices", async () => {
			const priceWithMeta = {
				...mockPriceRow,
				metadata: '{"discount": 10}',
			};

			mockDb._mock.first.mockResolvedValue(priceWithMeta);

			const price = await repository.getPriceById("price_1");

			expect(price?.metadata).toEqual({ discount: 10 });
		});

		it("should parse JSON metadata correctly for limits", async () => {
			const limitsWithMeta = {
				...mockLimitsRow,
				metadata: '{"feature_flags": ["beta"]}',
			};

			mockDb._mock.first.mockResolvedValue(limitsWithMeta);

			const limits = await repository.getLimitsForPlan("plan_business");

			expect(limits?.metadata).toEqual({ feature_flags: ["beta"] });
		});

		it("should parse JSON metadata correctly for licenses", async () => {
			const licenseWithMeta = {
				...mockLicenseRow,
				metadata: '{"custom_field": "value"}',
			};

			mockDb._mock.first.mockResolvedValue(licenseWithMeta);

			const license = await repository.getLicenseByKey("ENT-XXXX-XXXX-XXXX");

			expect(license?.metadata).toEqual({ custom_field: "value" });
		});

		it("should handle license with expires_at date", async () => {
			const licenseWithExpiry = {
				...mockLicenseRow,
				expires_at: "2025-12-31T00:00:00Z",
				activated_at: "2024-06-01T00:00:00Z",
			};

			mockDb._mock.first.mockResolvedValue(licenseWithExpiry);

			const license = await repository.getLicenseByKey("ENT-XXXX-XXXX-XXXX");

			expect(license?.expiresAt).toBeInstanceOf(Date);
			expect(license?.activatedAt).toBeInstanceOf(Date);
		});
	});
});
