/**
 * Usage Rights Service Tests
 *
 * Tests the entitlement resolution, usage checking, gate-and-meter,
 * and record usage flows for the UsageRightsService.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { UsageRightsService } from "./service";
import type { UsageRightsRepository } from "./repository";
import type { PricingRepository } from "../pricing/repository";
import type { EnterpriseLicense } from "../pricing/types";
import type { UsageMetric } from "./types";
import type { OverageRepository } from "../overage/repository";

vi.mock("./repository");
vi.mock("../pricing/repository");

const mockLicense: EnterpriseLicense = {
	id: "lic_1",
	key: "LIC-TEST-001",
	organizationName: "Test Corp",
	userId: "owner_1",
	issuedBy: "admin_1",
	status: "active",
	expiresAt: null,
	activatedAt: new Date("2024-06-01"),
	notes: null,
	maxOrganizations: 3,
	maxUsers: 10,
	reportsPerMonth: 50,
	noticesPerMonth: 20,
	alertsPerMonth: 100,
	operationsPerMonth: 500,
	clientsPerMonth: 200,
	watchlistQueriesPerMonth: 1000,
	metadata: null,
	createdAt: new Date("2024-01-01"),
	updatedAt: new Date("2024-01-01"),
};

const mockStripeLimits = {
	maxOrganizations: 1,
	usersPerOrg: 5,
	reportsPerMonth: 10,
	noticesPerMonth: 15,
	alertsPerMonth: 250,
	operationsPerMonth: 1500,
	clientsPerMonth: 300,
	watchlistQueriesPerMonth: 200,
};

const mockPlan = {
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

const mockPlanLimits = {
	id: "limit_business",
	planId: "plan_business",
	...mockStripeLimits,
	metadata: null,
	createdAt: new Date("2024-01-01"),
	updatedAt: new Date("2024-01-01"),
};

describe("UsageRightsService", () => {
	let service: UsageRightsService;
	let mockOverageRepo: {
		getByUserId: ReturnType<typeof vi.fn>;
		addPeriodOverageCharge: ReturnType<typeof vi.fn>;
	};
	let mockUsageRightsRepo: {
		getOrganizationLifecycleStatus: ReturnType<typeof vi.fn>;
		getOrganizationOwnerUserId: ReturnType<typeof vi.fn>;
		getLicenseByUserId: ReturnType<typeof vi.fn>;
		getUserSubscription: ReturnType<typeof vi.fn>;
		getOrganizationUsage: ReturnType<typeof vi.fn>;
		getDailyUsage: ReturnType<typeof vi.fn>;
		getMonthlyWatchlistQueriesUsed: ReturnType<typeof vi.fn>;
		incrementMonthlyUsage: ReturnType<typeof vi.fn>;
		incrementDailyWatchlistQueries: ReturnType<typeof vi.fn>;
		countOrganizationsOwned: ReturnType<typeof vi.fn>;
		ensureOrganizationUsage: ReturnType<typeof vi.fn>;
		cleanOldDailyUsage: ReturnType<typeof vi.fn>;
	};
	let mockPricingRepo: {
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
		getPriceByStripePriceId: ReturnType<typeof vi.fn>;
	};

	const ORG_ID = "org_1";
	const OWNER_ID = "owner_1";
	const TODAY = "2024-06-15";

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));

		mockOverageRepo = {
			getByUserId: vi.fn().mockResolvedValue(null),
			addPeriodOverageCharge: vi.fn().mockResolvedValue(undefined),
		};

		mockUsageRightsRepo = {
			getOrganizationLifecycleStatus: vi.fn().mockResolvedValue("active"),
			getOrganizationOwnerUserId: vi.fn(),
			getLicenseByUserId: vi.fn(),
			getUserSubscription: vi.fn(),
			getOrganizationUsage: vi.fn(),
			getDailyUsage: vi.fn(),
			getMonthlyWatchlistQueriesUsed: vi.fn().mockResolvedValue(0),
			incrementMonthlyUsage: vi.fn(),
			incrementDailyWatchlistQueries: vi.fn(),
			countOrganizationsOwned: vi.fn(),
			ensureOrganizationUsage: vi.fn(),
			cleanOldDailyUsage: vi.fn(),
		};

		mockPricingRepo = {
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
			getPriceByStripePriceId: vi.fn(),
		};

		service = new UsageRightsService(
			mockUsageRightsRepo as unknown as UsageRightsRepository,
			mockPricingRepo as unknown as PricingRepository,
			mockOverageRepo as unknown as OverageRepository,
			null,
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("resolveEntitlement", () => {
		it("returns 'none' when no org owner found", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(null);

			const result = await service.resolveEntitlement(ORG_ID);

			expect(result.type).toBe("none");
			expect(result.limits).toBeNull();
			expect(mockUsageRightsRepo.getLicenseByUserId).not.toHaveBeenCalled();
			expect(mockUsageRightsRepo.getUserSubscription).not.toHaveBeenCalled();
		});

		it("returns 'license' when owner has active license (license takes priority)", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);

			const result = await service.resolveEntitlement(ORG_ID);

			expect(result.type).toBe("license");
			expect(result).toMatchObject({
				ownerUserId: OWNER_ID,
				limits: {
					maxOrganizations: 3,
					usersPerOrg: 10,
					reportsPerMonth: 50,
					noticesPerMonth: 20,
					watchlistQueriesPerMonth: 1000,
				},
			});
			expect(mockUsageRightsRepo.getUserSubscription).not.toHaveBeenCalled();
		});

		it("returns 'stripe' when owner has active subscription but no license", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(null);
			mockUsageRightsRepo.getUserSubscription.mockResolvedValue({
				id: "sub_1",
				plan: "business",
				status: "active",
				stripeSubscriptionId: "sub_stripe_1",
				periodStart: new Date("2024-06-01"),
				periodEnd: new Date("2024-07-01"),
			});
			mockPricingRepo.getLicenseByUserId.mockResolvedValue(null);
			mockPricingRepo.getPlanByName.mockResolvedValue(mockPlan);
			mockPricingRepo.getLimitsForPlan.mockResolvedValue(mockPlanLimits);

			const result = await service.resolveEntitlement(ORG_ID);

			expect(result.type).toBe("stripe");
			expect(result).toMatchObject({
				ownerUserId: OWNER_ID,
				subscriptionPlan: "business",
				limits: mockStripeLimits,
			});
		});

		it("returns 'stripe' for trialing subscription", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(null);
			mockUsageRightsRepo.getUserSubscription.mockResolvedValue({
				id: "sub_1",
				plan: "business",
				status: "trialing",
				stripeSubscriptionId: null,
				periodStart: new Date("2024-06-01"),
				periodEnd: new Date("2024-07-01"),
			});
			mockPricingRepo.getLicenseByUserId.mockResolvedValue(null);
			mockPricingRepo.getPlanByName.mockResolvedValue(mockPlan);
			mockPricingRepo.getLimitsForPlan.mockResolvedValue(mockPlanLimits);

			const result = await service.resolveEntitlement(ORG_ID);

			expect(result.type).toBe("stripe");
			if (result.type === "stripe") {
				expect(result.subscriptionPlan).toBe("business");
			}
		});

		it("returns 'none' when owner has neither license nor subscription", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(null);
			mockUsageRightsRepo.getUserSubscription.mockResolvedValue(null);

			const result = await service.resolveEntitlement(ORG_ID);

			expect(result.type).toBe("none");
			expect(result.limits).toBeNull();
		});

		it("returns 'none' when subscription exists but is not active or trialing", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(null);
			mockUsageRightsRepo.getUserSubscription.mockResolvedValue({
				id: "sub_1",
				plan: "business",
				status: "canceled",
				stripeSubscriptionId: null,
				periodStart: null,
				periodEnd: null,
			});

			const result = await service.resolveEntitlement(ORG_ID);

			expect(result.type).toBe("none");
			expect(result.limits).toBeNull();
		});
	});

	describe("checkRight", () => {
		it("returns allowed=false for 'none' entitlement", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(null);

			const result = await service.checkRight(ORG_ID, "reports");

			expect(result).toMatchObject({
				allowed: false,
				metric: "reports",
				used: 0,
				limit: 0,
				remaining: 0,
				entitlementType: "none",
			});
		});

		it("returns allowed=true when usage is within limit", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.getOrganizationUsage.mockResolvedValue({
				reportsUsed: 10,
				noticesUsed: 5,
				alertsUsed: 20,
				operationsUsed: 100,
				clientsUsed: 50,
				usersCount: 3,
			});

			const result = await service.checkRight(ORG_ID, "reports");

			expect(result).toMatchObject({
				allowed: true,
				metric: "reports",
				used: 10,
				limit: 50,
				remaining: 40,
				entitlementType: "license",
			});
		});

		it("returns allowed=false when usage exceeds limit", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.getOrganizationUsage.mockResolvedValue({
				reportsUsed: 55,
				noticesUsed: 0,
				alertsUsed: 0,
				operationsUsed: 0,
				clientsUsed: 0,
				usersCount: 0,
			});

			const result = await service.checkRight(ORG_ID, "reports");

			expect(result).toMatchObject({
				allowed: false,
				metric: "reports",
				used: 55,
				limit: 50,
				remaining: 0,
				entitlementType: "license",
			});
		});

		it("handles 0=unlimited (always allowed)", async () => {
			const unlimitedLicense: EnterpriseLicense = {
				...mockLicense,
				reportsPerMonth: 0,
			};
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(
				unlimitedLicense,
			);
			mockUsageRightsRepo.getOrganizationUsage.mockResolvedValue({
				reportsUsed: 9999,
				noticesUsed: 0,
				alertsUsed: 0,
				operationsUsed: 0,
				clientsUsed: 0,
				usersCount: 0,
			});

			const result = await service.checkRight(ORG_ID, "reports");

			expect(result).toMatchObject({
				allowed: true,
				metric: "reports",
				used: 9999,
				limit: 0,
				remaining: -1,
				entitlementType: "license",
			});
		});

		it("returns allowed=true for watchlistQueries when within monthly limit", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.getMonthlyWatchlistQueriesUsed.mockResolvedValue(500);

			const result = await service.checkRight(ORG_ID, "watchlistQueries");

			expect(result).toMatchObject({
				allowed: true,
				metric: "watchlistQueries",
				used: 500,
				limit: 1000,
				remaining: 500,
				entitlementType: "license",
			});
		});

		it("returns allowed=true for organizations metric (structural limit)", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.countOrganizationsOwned.mockResolvedValue(1);

			const result = await service.checkRight(ORG_ID, "organizations");

			expect(result).toMatchObject({
				allowed: true,
				metric: "organizations",
				used: 1,
				limit: 3,
				remaining: 2,
				entitlementType: "license",
			});
		});
	});

	describe("gateAndMeter", () => {
		it("returns 403-style for 'none' entitlement", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(null);

			const result = await service.gateAndMeter(ORG_ID, "reports");

			expect(result).toMatchObject({
				allowed: false,
				metric: "reports",
				used: 0,
				limit: 0,
				remaining: 0,
				entitlementType: "none",
				error: "usage_limit_exceeded",
				upgradeRequired: true,
			});
			expect(mockUsageRightsRepo.incrementMonthlyUsage).not.toHaveBeenCalled();
		});

		it("allows and increments meter when within limit", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.getOrganizationUsage.mockResolvedValue({
				reportsUsed: 10,
				noticesUsed: 0,
				alertsUsed: 0,
				operationsUsed: 0,
				clientsUsed: 0,
				usersCount: 0,
			});

			const result = await service.gateAndMeter(ORG_ID, "reports", 1);

			expect(result).toMatchObject({
				allowed: true,
				metric: "reports",
				used: 11,
				limit: 50,
				remaining: 39,
				entitlementType: "license",
			});
			expect(mockUsageRightsRepo.ensureOrganizationUsage).toHaveBeenCalledWith(
				ORG_ID,
				OWNER_ID,
			);
			expect(mockUsageRightsRepo.incrementMonthlyUsage).toHaveBeenCalledWith(
				ORG_ID,
				"reports",
				1,
			);
		});

		it("blocks when at limit", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.getOrganizationUsage.mockResolvedValue({
				reportsUsed: 50,
				noticesUsed: 0,
				alertsUsed: 0,
				operationsUsed: 0,
				clientsUsed: 0,
				usersCount: 0,
			});

			const result = await service.gateAndMeter(ORG_ID, "reports", 1);

			expect(result).toMatchObject({
				allowed: false,
				metric: "reports",
				used: 50,
				limit: 50,
				remaining: 0,
				entitlementType: "license",
				error: "usage_limit_exceeded",
				upgradeRequired: true,
			});
			expect(mockUsageRightsRepo.incrementMonthlyUsage).not.toHaveBeenCalled();
		});

		it("handles 0=unlimited", async () => {
			const unlimitedLicense: EnterpriseLicense = {
				...mockLicense,
				reportsPerMonth: 0,
			};
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(
				unlimitedLicense,
			);
			mockUsageRightsRepo.getOrganizationUsage.mockResolvedValue({
				reportsUsed: 9999,
				noticesUsed: 0,
				alertsUsed: 0,
				operationsUsed: 0,
				clientsUsed: 0,
				usersCount: 0,
			});

			const result = await service.gateAndMeter(ORG_ID, "reports", 100);

			expect(result).toMatchObject({
				allowed: true,
				metric: "reports",
				used: 10099,
				limit: 0,
				remaining: -1,
				entitlementType: "license",
			});
			expect(mockUsageRightsRepo.incrementMonthlyUsage).toHaveBeenCalledWith(
				ORG_ID,
				"reports",
				100,
			);
		});

		it("calls ensureOrganizationUsage for watchlistQueries and increments daily row", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.getMonthlyWatchlistQueriesUsed.mockResolvedValue(100);

			await service.gateAndMeter(ORG_ID, "watchlistQueries", 1);

			expect(mockUsageRightsRepo.ensureOrganizationUsage).toHaveBeenCalledWith(
				ORG_ID,
				OWNER_ID,
			);
			expect(
				mockUsageRightsRepo.incrementDailyWatchlistQueries,
			).toHaveBeenCalledWith(ORG_ID, TODAY, 1);
		});

		it("does NOT call ensureOrganizationUsage for organizations metric", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.countOrganizationsOwned.mockResolvedValue(1);

			const result = await service.gateAndMeter(ORG_ID, "organizations");

			expect(
				mockUsageRightsRepo.ensureOrganizationUsage,
			).not.toHaveBeenCalled();
			expect(result.allowed).toBe(true);
		});

		it("calls ensureOrganizationUsage for monthly metrics (reports)", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.getOrganizationUsage.mockResolvedValue({
				reportsUsed: 0,
				noticesUsed: 0,
				alertsUsed: 0,
				operationsUsed: 0,
				clientsUsed: 0,
				usersCount: 0,
			});

			await service.gateAndMeter(ORG_ID, "reports");

			expect(mockUsageRightsRepo.ensureOrganizationUsage).toHaveBeenCalledWith(
				ORG_ID,
				OWNER_ID,
			);
		});
	});

	describe("recordUsage", () => {
		beforeEach(() => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
		});

		it("calls incrementDailyWatchlistQueries for watchlistQueries", async () => {
			await service.recordUsage(ORG_ID, "watchlistQueries", 5);

			expect(
				mockUsageRightsRepo.incrementDailyWatchlistQueries,
			).toHaveBeenCalledWith(ORG_ID, TODAY, 5);
			expect(mockUsageRightsRepo.incrementMonthlyUsage).not.toHaveBeenCalled();
		});

		it("calls incrementMonthlyUsage for reports metric", async () => {
			await service.recordUsage(ORG_ID, "reports", 2);

			expect(mockUsageRightsRepo.incrementMonthlyUsage).toHaveBeenCalledWith(
				ORG_ID,
				"reports",
				2,
			);
			expect(
				mockUsageRightsRepo.incrementDailyWatchlistQueries,
			).not.toHaveBeenCalled();
		});

		it("calls incrementMonthlyUsage for notices metric", async () => {
			await service.recordUsage(ORG_ID, "notices", 1);

			expect(mockUsageRightsRepo.incrementMonthlyUsage).toHaveBeenCalledWith(
				ORG_ID,
				"notices",
				1,
			);
		});

		it("calls incrementMonthlyUsage for alerts, operations, clients, users", async () => {
			const monthlyMetrics: UsageMetric[] = [
				"alerts",
				"operations",
				"clients",
				"users",
			];

			for (const metric of monthlyMetrics) {
				mockUsageRightsRepo.incrementMonthlyUsage.mockClear();
				await service.recordUsage(ORG_ID, metric, 1);
				expect(mockUsageRightsRepo.incrementMonthlyUsage).toHaveBeenCalledWith(
					ORG_ID,
					metric,
					1,
				);
			}
		});

		it("does nothing for organizations metric", async () => {
			await service.recordUsage(ORG_ID, "organizations", 1);

			expect(
				mockUsageRightsRepo.incrementDailyWatchlistQueries,
			).not.toHaveBeenCalled();
			expect(mockUsageRightsRepo.incrementMonthlyUsage).not.toHaveBeenCalled();
		});

		it("uses default count of 1 when not specified", async () => {
			await service.recordUsage(ORG_ID, "reports");

			expect(mockUsageRightsRepo.incrementMonthlyUsage).toHaveBeenCalledWith(
				ORG_ID,
				"reports",
				1,
			);
		});
	});

	describe("getEntitlementDetails", () => {
		it("returns full entitlement with usage for license org", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(
				OWNER_ID,
			);
			mockUsageRightsRepo.getLicenseByUserId.mockResolvedValue(mockLicense);
			mockUsageRightsRepo.getOrganizationUsage.mockResolvedValue({
				reportsUsed: 10,
				noticesUsed: 5,
				alertsUsed: 20,
				operationsUsed: 100,
				clientsUsed: 50,
				usersCount: 3,
			});
			mockUsageRightsRepo.getMonthlyWatchlistQueriesUsed.mockResolvedValue(250);

			const result = await service.getEntitlementDetails(ORG_ID);

			expect(result.type).toBe("license");
			expect(result.limits).toEqual({
				maxOrganizations: 3,
				usersPerOrg: 10,
				reportsPerMonth: 50,
				noticesPerMonth: 20,
				alertsPerMonth: 100,
				operationsPerMonth: 500,
				clientsPerMonth: 200,
				watchlistQueriesPerMonth: 1000,
			});
			expect(result.usage).toMatchObject({
				reportsUsed: 10,
				noticesUsed: 5,
				alertsUsed: 20,
				operationsUsed: 100,
				clientsUsed: 50,
				usersCount: 3,
				watchlistQueriesUsedThisMonth: 250,
			});
		});

		it("returns null usage for 'none' entitlement", async () => {
			mockUsageRightsRepo.getOrganizationOwnerUserId.mockResolvedValue(null);

			const result = await service.getEntitlementDetails(ORG_ID);

			expect(result.type).toBe("none");
			expect(result.limits).toBeNull();
			expect(result.usage).toBeNull();
		});
	});
});
