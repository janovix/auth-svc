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
			getLicenseByKey: vi.fn(),
			getLicenseById: vi.fn(),
			getLicenseByUserId: vi.fn(),
			activateLicense: vi.fn(),
		};
		service = new PricingService(
			mockRepository as unknown as PricingRepository,
		);
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
