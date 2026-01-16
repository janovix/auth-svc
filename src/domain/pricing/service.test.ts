/**
 * Pricing Service Tests
 *
 * Tests for the pricing service that provides database-driven subscription plans,
 * prices, limits, and license management.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PricingService } from "./service";
import { PricingRepository } from "./repository";
import type {
	SubscriptionPlan,
	PlanPrice,
	PlanLimits,
	EnterpriseLicense,
} from "./types";

// Mock the repository
vi.mock("./repository");

describe("PricingService", () => {
	let service: PricingService;
	let mockRepository: {
		getActivePlans: ReturnType<typeof vi.fn>;
		getAllPlans: ReturnType<typeof vi.fn>;
		getPlanById: ReturnType<typeof vi.fn>;
		getPlanByName: ReturnType<typeof vi.fn>;
		getLimitsForPlan: ReturnType<typeof vi.fn>;
		getLimitsByPlanName: ReturnType<typeof vi.fn>;
		getPricesForPlan: ReturnType<typeof vi.fn>;
		getPriceByStripePriceId: ReturnType<typeof vi.fn>;
		getLicenseByKey: ReturnType<typeof vi.fn>;
		getLicenseById: ReturnType<typeof vi.fn>;
		getLicenseByUserId: ReturnType<typeof vi.fn>;
		activateLicense: ReturnType<typeof vi.fn>;
	};

	const mockBusinessPlan: SubscriptionPlan = {
		id: "plan_business",
		name: "business",
		displayName: "Janovix Business",
		description: "Business plan",
		isActive: true,
		sortOrder: 1,
		trialDays: 14,
		metadata: null,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
	};

	const mockProPlan: SubscriptionPlan = {
		id: "plan_pro",
		name: "pro",
		displayName: "Janovix Pro",
		description: "Pro plan",
		isActive: true,
		sortOrder: 2,
		trialDays: 14,
		metadata: null,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
	};

	const mockBusinessLimits: PlanLimits = {
		id: "limit_business",
		planId: "plan_business",
		maxOrganizations: 1,
		usersPerOrg: 5,
		reportsPerMonth: 0,
		noticesPerMonth: 3,
		alertsPerMonth: 50,
		transactionsPerMonth: 250,
		clientsPerMonth: 50,
		watchlistQueriesPerDay: 50,
		metadata: null,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
	};

	const mockProLimits: PlanLimits = {
		id: "limit_pro",
		planId: "plan_pro",
		maxOrganizations: 3,
		usersPerOrg: 10,
		reportsPerMonth: 10,
		noticesPerMonth: 15,
		alertsPerMonth: 250,
		transactionsPerMonth: 1500,
		clientsPerMonth: 300,
		watchlistQueriesPerDay: 200,
		metadata: null,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
	};

	const mockBusinessPrices: PlanPrice[] = [
		{
			id: "price_1",
			planId: "plan_business",
			stripePriceId: "price_business_monthly",
			priceType: "subscription",
			amount: 999900,
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Monthly subscription",
			isActive: true,
			metadata: null,
			createdAt: new Date("2024-01-01"),
			updatedAt: new Date("2024-01-01"),
		},
		{
			id: "price_2",
			planId: "plan_business",
			stripePriceId: "price_seat_business",
			priceType: "seat",
			amount: 25000,
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Extra user",
			isActive: true,
			metadata: null,
			createdAt: new Date("2024-01-01"),
			updatedAt: new Date("2024-01-01"),
		},
	];

	beforeEach(() => {
		mockRepository = {
			getActivePlans: vi.fn(),
			getAllPlans: vi.fn(),
			getPlanById: vi.fn(),
			getPlanByName: vi.fn(),
			getLimitsForPlan: vi.fn(),
			getLimitsByPlanName: vi.fn(),
			getPricesForPlan: vi.fn(),
			getPriceByStripePriceId: vi.fn(),
			getLicenseByKey: vi.fn(),
			getLicenseById: vi.fn(),
			getLicenseByUserId: vi.fn(),
			activateLicense: vi.fn(),
		};
		service = new PricingService(
			mockRepository as unknown as PricingRepository,
		);
	});

	// =========================================================================
	// PLANS
	// =========================================================================

	describe("getActivePlans", () => {
		it("should return active plans", async () => {
			mockRepository.getActivePlans.mockResolvedValue([
				mockBusinessPlan,
				mockProPlan,
			]);

			const plans = await service.getActivePlans();

			expect(plans).toHaveLength(2);
			expect(plans[0].name).toBe("business");
		});
	});

	describe("getAllPlans", () => {
		it("should return all plans including inactive", async () => {
			mockRepository.getAllPlans.mockResolvedValue([
				mockBusinessPlan,
				{ ...mockProPlan, isActive: false },
			]);

			const plans = await service.getAllPlans();

			expect(plans).toHaveLength(2);
		});
	});

	describe("getPlanByName", () => {
		it("should return plan when found", async () => {
			mockRepository.getPlanByName.mockResolvedValue(mockBusinessPlan);

			const plan = await service.getPlanByName("business");

			expect(plan).not.toBeNull();
			expect(plan?.name).toBe("business");
		});

		it("should return null when plan not found", async () => {
			mockRepository.getPlanByName.mockResolvedValue(null);

			const plan = await service.getPlanByName("nonexistent");

			expect(plan).toBeNull();
		});
	});

	describe("getPlanById", () => {
		it("should return plan when found", async () => {
			mockRepository.getPlanById.mockResolvedValue(mockBusinessPlan);

			const plan = await service.getPlanById("plan_business");

			expect(plan).not.toBeNull();
			expect(plan?.id).toBe("plan_business");
		});
	});

	describe("getPlanWithDetailsByName", () => {
		it("should return plan with details", async () => {
			mockRepository.getPlanByName.mockResolvedValue(mockBusinessPlan);
			mockRepository.getLimitsForPlan.mockResolvedValue(mockBusinessLimits);
			mockRepository.getPricesForPlan.mockResolvedValue(mockBusinessPrices);

			const result = await service.getPlanWithDetailsByName("business");

			expect(result).not.toBeNull();
			expect(result?.plan.name).toBe("business");
			expect(result?.limits).toEqual(mockBusinessLimits);
			expect(result?.prices).toEqual(mockBusinessPrices);
		});

		it("should return null when plan not found", async () => {
			mockRepository.getPlanByName.mockResolvedValue(null);

			const result = await service.getPlanWithDetailsByName("nonexistent");

			expect(result).toBeNull();
		});
	});

	describe("getPublicPlanByName", () => {
		it("should return public plan info without stripe price IDs", async () => {
			mockRepository.getPlanByName.mockResolvedValue(mockBusinessPlan);
			mockRepository.getLimitsForPlan.mockResolvedValue(mockBusinessLimits);
			mockRepository.getPricesForPlan.mockResolvedValue(mockBusinessPrices);

			const result = await service.getPublicPlanByName("business");

			expect(result).not.toBeNull();
			expect(result?.name).toBe("business");
			expect(result?.limits?.maxOrganizations).toBe(1);
			expect(result?.prices[0]).not.toHaveProperty("stripePriceId");
		});

		it("should return null when plan not found", async () => {
			mockRepository.getPlanByName.mockResolvedValue(null);

			const result = await service.getPublicPlanByName("nonexistent");

			expect(result).toBeNull();
		});

		it("should handle plan with null limits", async () => {
			mockRepository.getPlanByName.mockResolvedValue(mockBusinessPlan);
			mockRepository.getLimitsForPlan.mockResolvedValue(null);
			mockRepository.getPricesForPlan.mockResolvedValue([]);

			const result = await service.getPublicPlanByName("business");

			expect(result?.limits).toBeNull();
		});
	});

	// =========================================================================
	// LIMITS
	// =========================================================================

	describe("getLimitsByPlanId", () => {
		it("should return limits for plan", async () => {
			mockRepository.getLimitsForPlan.mockResolvedValue(mockBusinessLimits);

			const limits = await service.getLimitsByPlanId("plan_business");

			expect(limits).toEqual(mockBusinessLimits);
		});
	});

	// =========================================================================
	// PRICES
	// =========================================================================

	describe("getPricesForPlan", () => {
		it("should return prices for plan", async () => {
			mockRepository.getPricesForPlan.mockResolvedValue(mockBusinessPrices);

			const prices = await service.getPricesForPlan("plan_business");

			expect(prices).toHaveLength(2);
			expect(prices[0].priceType).toBe("subscription");
		});
	});

	describe("getPriceByStripePriceId", () => {
		it("should return price when found", async () => {
			mockRepository.getPriceByStripePriceId.mockResolvedValue(
				mockBusinessPrices[0],
			);

			const price = await service.getPriceByStripePriceId(
				"price_business_monthly",
			);

			expect(price).not.toBeNull();
			expect(price?.stripePriceId).toBe("price_business_monthly");
		});
	});

	describe("getSubscriptionPriceForPlan", () => {
		it("should return subscription price", async () => {
			mockRepository.getPricesForPlan.mockResolvedValue(mockBusinessPrices);

			const price = await service.getSubscriptionPriceForPlan("plan_business");

			expect(price).not.toBeNull();
			expect(price?.priceType).toBe("subscription");
		});

		it("should return null when no subscription price", async () => {
			mockRepository.getPricesForPlan.mockResolvedValue([
				{ ...mockBusinessPrices[1], priceType: "seat" },
			]);

			const price = await service.getSubscriptionPriceForPlan("plan_business");

			expect(price).toBeNull();
		});
	});

	describe("getSeatPriceForPlan", () => {
		it("should return seat price", async () => {
			mockRepository.getPricesForPlan.mockResolvedValue(mockBusinessPrices);

			const price = await service.getSeatPriceForPlan("plan_business");

			expect(price).not.toBeNull();
			expect(price?.priceType).toBe("seat");
		});

		it("should return null when no seat price", async () => {
			mockRepository.getPricesForPlan.mockResolvedValue([
				mockBusinessPrices[0],
			]);

			const price = await service.getSeatPriceForPlan("plan_business");

			expect(price).toBeNull();
		});
	});

	describe("getPlanNameFromStripePriceId", () => {
		it("should return plan name for valid price", async () => {
			mockRepository.getPriceByStripePriceId.mockResolvedValue(
				mockBusinessPrices[0],
			);
			mockRepository.getPlanById.mockResolvedValue(mockBusinessPlan);

			const planName = await service.getPlanNameFromStripePriceId(
				"price_business_monthly",
			);

			expect(planName).toBe("business");
		});

		it("should return null when price not found", async () => {
			mockRepository.getPriceByStripePriceId.mockResolvedValue(null);

			const planName =
				await service.getPlanNameFromStripePriceId("nonexistent");

			expect(planName).toBeNull();
		});

		it("should return null when plan not found", async () => {
			mockRepository.getPriceByStripePriceId.mockResolvedValue(
				mockBusinessPrices[0],
			);
			mockRepository.getPlanById.mockResolvedValue(null);

			const planName = await service.getPlanNameFromStripePriceId(
				"price_business_monthly",
			);

			expect(planName).toBeNull();
		});
	});

	describe("getAllSubscriptionPrices", () => {
		it("should return map of plan names to stripe price IDs", async () => {
			mockRepository.getAllPlans.mockResolvedValue([
				mockBusinessPlan,
				mockProPlan,
			]);
			mockRepository.getPricesForPlan.mockImplementation((planId: string) => {
				if (planId === "plan_business")
					return Promise.resolve(mockBusinessPrices);
				if (planId === "plan_pro")
					return Promise.resolve([
						{ ...mockBusinessPrices[0], stripePriceId: "price_pro_monthly" },
					]);
				return Promise.resolve([]);
			});

			const priceMap = await service.getAllSubscriptionPrices();

			expect(priceMap.size).toBe(2);
			expect(priceMap.get("business")).toBe("price_business_monthly");
			expect(priceMap.get("pro")).toBe("price_pro_monthly");
		});

		it("should skip plans without subscription price", async () => {
			mockRepository.getAllPlans.mockResolvedValue([mockBusinessPlan]);
			mockRepository.getPricesForPlan.mockResolvedValue([
				{ ...mockBusinessPrices[1], priceType: "seat" },
			]);

			const priceMap = await service.getAllSubscriptionPrices();

			expect(priceMap.size).toBe(0);
		});
	});

	describe("getSubscriptionPriceIdByPlanName", () => {
		it("should return stripe price ID for plan", async () => {
			mockRepository.getPlanByName.mockResolvedValue(mockBusinessPlan);
			mockRepository.getPricesForPlan.mockResolvedValue(mockBusinessPrices);

			const priceId =
				await service.getSubscriptionPriceIdByPlanName("business");

			expect(priceId).toBe("price_business_monthly");
		});

		it("should return null when plan not found", async () => {
			mockRepository.getPlanByName.mockResolvedValue(null);

			const priceId =
				await service.getSubscriptionPriceIdByPlanName("nonexistent");

			expect(priceId).toBeNull();
		});

		it("should return null when no subscription price", async () => {
			mockRepository.getPlanByName.mockResolvedValue(mockBusinessPlan);
			mockRepository.getPricesForPlan.mockResolvedValue([]);

			const priceId =
				await service.getSubscriptionPriceIdByPlanName("business");

			expect(priceId).toBeNull();
		});
	});

	// =========================================================================
	// LICENSES
	// =========================================================================

	describe("getLicenseByKey", () => {
		it("should return license when found", async () => {
			const mockLicense: EnterpriseLicense = {
				id: "lic_1",
				key: "ENT-TEST",
				organizationName: "Test Corp",
				planId: "plan_pro",
				userId: null,
				status: "active",
				expiresAt: null,
				activatedAt: null,
				maxOrganizations: null,
				maxUsers: null,
				reportsIncluded: null,
				noticesIncluded: null,
				alertsIncluded: null,
				transactionsIncluded: null,
				clientsIncluded: null,
				metadata: null,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			};
			mockRepository.getLicenseByKey.mockResolvedValue(mockLicense);

			const license = await service.getLicenseByKey("ENT-TEST");

			expect(license).not.toBeNull();
			expect(license?.key).toBe("ENT-TEST");
		});
	});

	describe("getLicenseByUserId", () => {
		it("should return license when found", async () => {
			const mockLicense: EnterpriseLicense = {
				id: "lic_1",
				key: "ENT-TEST",
				organizationName: "Test Corp",
				planId: "plan_pro",
				userId: "user_123",
				status: "active",
				expiresAt: null,
				activatedAt: new Date("2024-01-15"),
				maxOrganizations: null,
				maxUsers: null,
				reportsIncluded: null,
				noticesIncluded: null,
				alertsIncluded: null,
				transactionsIncluded: null,
				clientsIncluded: null,
				metadata: null,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-15"),
			};
			mockRepository.getLicenseByUserId.mockResolvedValue(mockLicense);

			const license = await service.getLicenseByUserId("user_123");

			expect(license).not.toBeNull();
			expect(license?.userId).toBe("user_123");
		});
	});

	describe("activateLicense", () => {
		const mockLicense: EnterpriseLicense = {
			id: "lic_1",
			key: "ENT-ACTIVATE",
			organizationName: "Test Corp",
			planId: "plan_pro",
			userId: null,
			status: "active",
			expiresAt: null,
			activatedAt: null,
			maxOrganizations: null,
			maxUsers: null,
			reportsIncluded: null,
			noticesIncluded: null,
			alertsIncluded: null,
			transactionsIncluded: null,
			clientsIncluded: null,
			metadata: null,
			createdAt: new Date("2024-01-01"),
			updatedAt: new Date("2024-01-01"),
		};

		it("should activate license successfully", async () => {
			mockRepository.getLicenseByKey.mockResolvedValue(mockLicense);
			mockRepository.activateLicense.mockResolvedValue(undefined);
			mockRepository.getLicenseById.mockResolvedValue({
				...mockLicense,
				userId: "user_123",
				activatedAt: new Date(),
			});

			const result = await service.activateLicense("ENT-ACTIVATE", "user_123");

			expect(result.success).toBe(true);
			expect(result.license?.userId).toBe("user_123");
		});

		it("should fail when license not found", async () => {
			mockRepository.getLicenseByKey.mockResolvedValue(null);

			const result = await service.activateLicense("INVALID", "user_123");

			expect(result.success).toBe(false);
			expect(result.error).toBe("License key not found");
		});

		it("should fail when license is revoked", async () => {
			mockRepository.getLicenseByKey.mockResolvedValue({
				...mockLicense,
				status: "revoked",
			});

			const result = await service.activateLicense("ENT-REVOKED", "user_123");

			expect(result.success).toBe(false);
			expect(result.error).toBe("License is revoked");
		});

		it("should fail when license is already in use by another user", async () => {
			mockRepository.getLicenseByKey.mockResolvedValue({
				...mockLicense,
				userId: "other_user",
			});

			const result = await service.activateLicense("ENT-INUSE", "user_123");

			expect(result.success).toBe(false);
			expect(result.error).toBe("License is already in use");
		});

		it("should succeed when activating license for same user", async () => {
			mockRepository.getLicenseByKey.mockResolvedValue({
				...mockLicense,
				userId: "user_123",
			});
			mockRepository.activateLicense.mockResolvedValue(undefined);
			mockRepository.getLicenseById.mockResolvedValue({
				...mockLicense,
				userId: "user_123",
			});

			const result = await service.activateLicense("ENT-SAME", "user_123");

			expect(result.success).toBe(true);
		});
	});

	describe("getEffectiveLimitsForUser with invalid license plan", () => {
		it("should fall back to plan limits when license references invalid plan", async () => {
			const mockLicense: EnterpriseLicense = {
				id: "lic_1",
				key: "ENT-INVALID-PLAN",
				organizationName: "Test Corp",
				planId: "plan_invalid",
				userId: "user_123",
				status: "active",
				expiresAt: null,
				activatedAt: new Date("2024-01-15"),
				maxOrganizations: null,
				maxUsers: null,
				reportsIncluded: null,
				noticesIncluded: null,
				alertsIncluded: null,
				transactionsIncluded: null,
				clientsIncluded: null,
				metadata: null,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-15"),
			};

			mockRepository.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockRepository.getPlanById.mockResolvedValue(null); // Invalid plan
			mockRepository.getLimitsForPlan.mockResolvedValue(null);
			mockRepository.getPlanByName.mockResolvedValue(mockBusinessPlan);

			// Mock for fallback
			mockRepository.getLimitsForPlan.mockResolvedValueOnce(null);
			mockRepository.getLimitsForPlan.mockResolvedValueOnce(mockBusinessLimits);

			const limits = await service.getEffectiveLimitsForUser(
				"user_123",
				"business",
			);

			expect(limits).toBeDefined();
			expect(limits?.source).toBe("plan");
		});

		it("should return null when plan not found", async () => {
			mockRepository.getLicenseByUserId.mockResolvedValue(null);
			mockRepository.getPlanByName.mockResolvedValue(null);

			const limits = await service.getEffectiveLimitsForUser(
				"user_123",
				"nonexistent",
			);

			expect(limits).toBeNull();
		});

		it("should return null when limits not found", async () => {
			mockRepository.getLicenseByUserId.mockResolvedValue(null);
			mockRepository.getPlanByName.mockResolvedValue(mockBusinessPlan);
			mockRepository.getLimitsForPlan.mockResolvedValue(null);

			const limits = await service.getEffectiveLimitsForUser(
				"user_123",
				"business",
			);

			expect(limits).toBeNull();
		});
	});

	describe("getEffectiveLimitsForLicense edge cases", () => {
		it("should return null when plan not found for license", async () => {
			const mockLicense: EnterpriseLicense = {
				id: "lic_1",
				key: "ENT-TEST",
				organizationName: "Test Corp",
				planId: "plan_invalid",
				userId: "user_123",
				status: "active",
				expiresAt: null,
				activatedAt: new Date(),
				maxOrganizations: null,
				maxUsers: null,
				reportsIncluded: null,
				noticesIncluded: null,
				alertsIncluded: null,
				transactionsIncluded: null,
				clientsIncluded: null,
				metadata: null,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			};

			mockRepository.getLicenseById.mockResolvedValue(mockLicense);
			mockRepository.getPlanById.mockResolvedValue(null);
			mockRepository.getLimitsForPlan.mockResolvedValue(null);

			const limits = await service.getEffectiveLimitsForLicense("lic_1");

			expect(limits).toBeNull();
		});
	});

	describe("getPublicPlans", () => {
		it("should return plans without Stripe price IDs", async () => {
			mockRepository.getActivePlans.mockResolvedValue([
				mockBusinessPlan,
				mockProPlan,
			]);
			mockRepository.getLimitsForPlan.mockImplementation((planId: string) => {
				if (planId === "plan_business")
					return Promise.resolve(mockBusinessLimits);
				if (planId === "plan_pro") return Promise.resolve(mockProLimits);
				return Promise.resolve(null);
			});
			mockRepository.getPricesForPlan.mockImplementation((planId: string) => {
				if (planId === "plan_business")
					return Promise.resolve(mockBusinessPrices);
				return Promise.resolve([]);
			});

			const plans = await service.getPublicPlans();

			expect(plans).toHaveLength(2);

			// Check first plan
			expect(plans[0].name).toBe("business");
			expect(plans[0].displayName).toBe("Janovix Business");
			expect(plans[0].limits).toBeDefined();
			expect(plans[0].limits?.maxOrganizations).toBe(1);
			expect(plans[0].limits?.usersPerOrg).toBe(5);

			// Verify no Stripe price IDs in public response
			expect(plans[0].prices[0]).not.toHaveProperty("stripePriceId");
			expect(plans[0].prices[0].priceType).toBe("subscription");
			expect(plans[0].prices[0].amount).toBe(999900);
		});
	});

	describe("getPlansWithDetails", () => {
		it("should return plans with full details including price IDs", async () => {
			mockRepository.getActivePlans.mockResolvedValue([mockBusinessPlan]);
			mockRepository.getLimitsForPlan.mockResolvedValue(mockBusinessLimits);
			mockRepository.getPricesForPlan.mockResolvedValue(mockBusinessPrices);

			const plans = await service.getPlansWithDetails();

			expect(plans).toHaveLength(1);
			expect(plans[0].plan.name).toBe("business");
			expect(plans[0].limits).toEqual(mockBusinessLimits);
			expect(plans[0].prices).toEqual(mockBusinessPrices);
			expect(plans[0].prices[0].stripePriceId).toBe("price_business_monthly");
		});
	});

	describe("getLimitsByPlanName", () => {
		it("should return legacy format limits", async () => {
			mockRepository.getLimitsByPlanName.mockResolvedValue(mockBusinessLimits);

			const limits = await service.getLimitsByPlanName("business");

			expect(limits).toEqual({
				maxOrganizations: 1,
				usersPerOrg: 5,
				reportsPerMonth: 0,
				noticesPerMonth: 3,
				alertsPerMonth: 50,
				transactionsPerMonth: 250,
				clientsPerMonth: 50,
				watchlistQueriesPerDay: 50,
			});
		});

		it("should return null when plan not found", async () => {
			mockRepository.getLimitsByPlanName.mockResolvedValue(null);

			const limits = await service.getLimitsByPlanName("nonexistent");

			expect(limits).toBeNull();
		});
	});

	describe("validateLicenseKey", () => {
		it("should return valid for active license", async () => {
			const mockLicense: EnterpriseLicense = {
				id: "lic_1",
				key: "ENT-XXXX-XXXX-XXXX",
				organizationName: "Acme Corp",
				planId: "plan_pro",
				userId: null,
				status: "active",
				expiresAt: null,
				activatedAt: null,
				maxOrganizations: null,
				maxUsers: null,
				reportsIncluded: null,
				noticesIncluded: null,
				alertsIncluded: null,
				transactionsIncluded: null,
				clientsIncluded: null,
				metadata: null,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			};

			mockRepository.getLicenseByKey.mockResolvedValue(mockLicense);

			const result = await service.validateLicenseKey("ENT-XXXX-XXXX-XXXX");

			expect(result.valid).toBe(true);
			expect(result.license).toBeDefined();
			expect(result.license?.key).toBe("ENT-XXXX-XXXX-XXXX");
		});

		it("should return invalid for non-existent license", async () => {
			mockRepository.getLicenseByKey.mockResolvedValue(null);

			const result = await service.validateLicenseKey("INVALID-KEY");

			expect(result.valid).toBe(false);
			expect(result.error).toBe("License key not found");
		});

		it("should return invalid for revoked license", async () => {
			const mockLicense: EnterpriseLicense = {
				id: "lic_1",
				key: "ENT-REVOKED",
				organizationName: "Acme Corp",
				planId: "plan_pro",
				userId: null,
				status: "revoked",
				expiresAt: null,
				activatedAt: null,
				maxOrganizations: null,
				maxUsers: null,
				reportsIncluded: null,
				noticesIncluded: null,
				alertsIncluded: null,
				transactionsIncluded: null,
				clientsIncluded: null,
				metadata: null,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			};

			mockRepository.getLicenseByKey.mockResolvedValue(mockLicense);

			const result = await service.validateLicenseKey("ENT-REVOKED");

			expect(result.valid).toBe(false);
			expect(result.error).toBe("License is revoked");
		});

		it("should return invalid for expired license", async () => {
			const mockLicense: EnterpriseLicense = {
				id: "lic_1",
				key: "ENT-EXPIRED",
				organizationName: "Acme Corp",
				planId: "plan_pro",
				userId: null,
				status: "active",
				expiresAt: new Date("2023-01-01"), // Past date
				activatedAt: null,
				maxOrganizations: null,
				maxUsers: null,
				reportsIncluded: null,
				noticesIncluded: null,
				alertsIncluded: null,
				transactionsIncluded: null,
				clientsIncluded: null,
				metadata: null,
				createdAt: new Date("2022-01-01"),
				updatedAt: new Date("2022-01-01"),
			};

			mockRepository.getLicenseByKey.mockResolvedValue(mockLicense);

			const result = await service.validateLicenseKey("ENT-EXPIRED");

			expect(result.valid).toBe(false);
			expect(result.error).toBe("License has expired");
		});
	});

	describe("getEffectiveLimitsForUser", () => {
		it("should return plan limits when no license", async () => {
			mockRepository.getLicenseByUserId.mockResolvedValue(null);
			mockRepository.getPlanByName.mockResolvedValue(mockBusinessPlan);
			mockRepository.getLimitsForPlan.mockResolvedValue(mockBusinessLimits);

			const limits = await service.getEffectiveLimitsForUser(
				"user_123",
				"business",
			);

			expect(limits).toBeDefined();
			expect(limits?.source).toBe("plan");
			expect(limits?.planName).toBe("business");
			expect(limits?.maxOrganizations).toBe(1);
		});

		it("should return license limits with overrides when license exists", async () => {
			const mockLicense: EnterpriseLicense = {
				id: "lic_1",
				key: "ENT-CUSTOM",
				organizationName: "Acme Corp",
				planId: "plan_pro",
				userId: "user_123",
				status: "active",
				expiresAt: null,
				activatedAt: new Date("2024-01-15"),
				maxOrganizations: 10, // Override
				maxUsers: 100, // Override
				reportsIncluded: null, // Use plan default
				noticesIncluded: 50, // Override
				alertsIncluded: null,
				transactionsIncluded: null,
				clientsIncluded: null,
				metadata: null,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-15"),
			};

			mockRepository.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockRepository.getPlanById.mockResolvedValue(mockProPlan);
			mockRepository.getLimitsForPlan.mockResolvedValue(mockProLimits);

			const limits = await service.getEffectiveLimitsForUser(
				"user_123",
				"business", // Original plan doesn't matter when license exists
			);

			expect(limits).toBeDefined();
			expect(limits?.source).toBe("license");
			expect(limits?.planName).toBe("pro");
			// Check overrides
			expect(limits?.maxOrganizations).toBe(10);
			expect(limits?.usersPerOrg).toBe(100);
			expect(limits?.noticesPerMonth).toBe(50);
			// Check plan defaults
			expect(limits?.reportsPerMonth).toBe(10); // From pro plan
			expect(limits?.alertsPerMonth).toBe(250); // From pro plan
		});
	});

	describe("getEffectiveLimitsForLicense", () => {
		it("should merge license overrides with plan defaults", async () => {
			const mockLicense: EnterpriseLicense = {
				id: "lic_1",
				key: "ENT-PARTIAL",
				organizationName: "Acme Corp",
				planId: "plan_business",
				userId: "user_123",
				status: "active",
				expiresAt: null,
				activatedAt: new Date("2024-01-15"),
				maxOrganizations: 5, // Override
				maxUsers: null, // Use plan default (5)
				reportsIncluded: 20, // Override
				noticesIncluded: null, // Use plan default (3)
				alertsIncluded: null, // Use plan default (50)
				transactionsIncluded: 1000, // Override
				clientsIncluded: null, // Use plan default (50)
				metadata: null,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-15"),
			};

			mockRepository.getLicenseById.mockResolvedValue(mockLicense);
			mockRepository.getPlanById.mockResolvedValue(mockBusinessPlan);
			mockRepository.getLimitsForPlan.mockResolvedValue(mockBusinessLimits);

			const limits = await service.getEffectiveLimitsForLicense("lic_1");

			expect(limits).toBeDefined();
			expect(limits?.source).toBe("license");
			// Overridden values
			expect(limits?.maxOrganizations).toBe(5);
			expect(limits?.reportsPerMonth).toBe(20);
			expect(limits?.transactionsPerMonth).toBe(1000);
			// Plan defaults
			expect(limits?.usersPerOrg).toBe(5);
			expect(limits?.noticesPerMonth).toBe(3);
			expect(limits?.alertsPerMonth).toBe(50);
			expect(limits?.clientsPerMonth).toBe(50);
		});

		it("should return null when license not found", async () => {
			mockRepository.getLicenseById.mockResolvedValue(null);

			const limits = await service.getEffectiveLimitsForLicense("nonexistent");

			expect(limits).toBeNull();
		});
	});
});
