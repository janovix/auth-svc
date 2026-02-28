/**
 * Subscription service unit tests
 *
 * Tests for metered billing (alerts) and seat-based billing (users)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubscriptionService } from "./service";
import type { SubscriptionRepository } from "./repository";
import type Stripe from "stripe";
import type { OrganizationUsage, UserSubscription, PlanLimits } from "./types";

// Mock repository
const createMockRepository = () => ({
	getUserSubscription: vi.fn(),
	getOrganizationUsage: vi.fn(),
	updateUsersCount: vi.fn(),
	markOverageReported: vi.fn(),
	countOrganizationMembers: vi.fn(),
	getOrganizationOwnerUserId: vi.fn(),
	countOrganizationsOwned: vi.fn(),
	getOwnedOrganizationsWithMemberCounts: vi.fn(),
	upsertOrganizationUsage: vi.fn(),
	incrementUsage: vi.fn(),
	resetUsage: vi.fn(),
	getByStripeSubscriptionId: vi.fn(),
	isCardFingerprintUsed: vi.fn(),
	storeCardFingerprint: vi.fn(),
	incrementCardFingerprintUsage: vi.fn(),
	getCardFingerprint: vi.fn(),
});

// Mock Stripe client
const createMockStripe = () => ({
	subscriptions: {
		retrieve: vi.fn(),
		update: vi.fn(),
	},
	subscriptionItems: {
		update: vi.fn(),
		create: vi.fn(),
		del: vi.fn(),
		createUsageRecord: vi.fn(),
	},
});

// Sample test data
const mockUsage: OrganizationUsage = {
	id: "usage-1",
	organizationId: "org-123",
	ownerUserId: "user-456",
	reportsUsed: 5,
	noticesUsed: 10,
	alertsUsed: 75, // Over the 50 limit for business
	operationsUsed: 300, // Over the 250 limit for business
	clientsUsed: 60, // Over the 50 limit for business
	usersCount: 3,
	periodStart: new Date("2024-01-01"),
	periodEnd: new Date("2024-01-31"),
	overageReportedAt: null,
	stripeUsageRecordId: null,
	createdAt: new Date("2024-01-01"),
	updatedAt: new Date("2024-01-15"),
};

const mockSubscription: UserSubscription = {
	id: "sub-1",
	plan: "business",
	referenceId: "user-456",
	stripeCustomerId: "cus_123",
	stripeSubscriptionId: "sub_stripe_123",
	licenseId: null,
	status: "active",
	periodStart: new Date("2024-01-01"),
	periodEnd: new Date("2024-01-31"),
	cancelAtPeriodEnd: false,
	seats: null,
	trialStart: null,
	trialEnd: null,
	createdAt: new Date("2024-01-01"),
	updatedAt: new Date("2024-01-15"),
};

// Business plan limits for reference in tests (updated January 2026)
const businessLimits: PlanLimits = {
	maxOrganizations: 1,
	usersPerOrg: 2,
	reportsPerMonth: 1,
	noticesPerMonth: 2,
	alertsPerMonth: 25, // 75 used - 25 limit = 50 overage for test
	operationsPerMonth: 50,
	clientsPerMonth: 25,
	watchlistQueriesPerMonth: 100,
};

// Mock PricingRepository for alert overage tests
const createMockPricingRepositoryForBusiness = () => ({
	getPlanByName: vi
		.fn()
		.mockResolvedValue({ id: "plan_business", name: "business" }),
	getLimitsForPlan: vi.fn().mockResolvedValue(businessLimits),
	getLicenseByUserId: vi.fn().mockResolvedValue(null),
	getActivePlans: vi.fn(),
	getAllPlans: vi.fn(),
	getPlanById: vi.fn(),
	getLimitsByPlanName: vi.fn(),
	getPricesForPlan: vi.fn(),
	getLicenseByKey: vi.fn(),
	getLicenseById: vi.fn(),
	activateLicense: vi.fn(),
	getPriceByStripePriceId: vi.fn(),
});

// Pro plan limits for multi-org tests
const proLimits: PlanLimits = {
	maxOrganizations: 3,
	usersPerOrg: 10,
	reportsPerMonth: 15,
	noticesPerMonth: 20,
	alertsPerMonth: 100,
	operationsPerMonth: 500,
	clientsPerMonth: 250,
	watchlistQueriesPerMonth: 600,
};

// Pro subscription for multi-org tests
const mockProSubscription: UserSubscription = {
	id: "sub-2",
	plan: "pro",
	referenceId: "user-789",
	stripeCustomerId: "cus_456",
	stripeSubscriptionId: "sub_stripe_456",
	licenseId: null,
	status: "active",
	periodStart: new Date("2024-01-01"),
	periodEnd: new Date("2024-01-31"),
	cancelAtPeriodEnd: false,
	seats: null,
	trialStart: null,
	trialEnd: null,
	createdAt: new Date("2024-01-01"),
	updatedAt: new Date("2024-01-15"),
};

// Enterprise license subscription for license-based tests
const mockLicenseSubscription: UserSubscription = {
	id: "sub-3",
	plan: "enterprise",
	referenceId: "user-license",
	stripeCustomerId: null,
	stripeSubscriptionId: null,
	licenseId: "license-001",
	status: "active",
	periodStart: null,
	periodEnd: null,
	cancelAtPeriodEnd: false,
	seats: null,
	trialStart: null,
	trialEnd: null,
	createdAt: new Date("2024-06-01"),
	updatedAt: new Date("2024-06-01"),
};

// Enterprise plan limits from license (used in inline test mocks)
const _enterpriseLimits: PlanLimits = {
	maxOrganizations: 0, // unlimited
	usersPerOrg: 50,
	reportsPerMonth: 500,
	noticesPerMonth: 500,
	alertsPerMonth: 1000,
	operationsPerMonth: 5000,
	clientsPerMonth: 2000,
	watchlistQueriesPerMonth: 0,
};

describe("SubscriptionService", () => {
	let mockRepository: ReturnType<typeof createMockRepository>;
	let mockStripe: ReturnType<typeof createMockStripe>;
	let service: SubscriptionService;

	beforeEach(() => {
		mockRepository = createMockRepository();
		mockStripe = createMockStripe();
		service = new SubscriptionService(
			mockRepository as unknown as SubscriptionRepository,
			mockStripe as unknown as Stripe,
		);
	});

	describe("reportAlertOverageToStripe", () => {
		it("should report alert overage when usage exceeds limit", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);
			mockStripe.subscriptionItems.createUsageRecord.mockResolvedValue({
				id: "usage_record_123",
			});

			// Create service with pricing repository so getUserPlanLimits works
			const mockPricingRepo = createMockPricingRepositoryForBusiness();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			await serviceWithPricing.reportAlertOverageToStripe(
				"org-123",
				"user-456",
				"si_alert_overage",
			);

			// Should have calculated 50 overage (75 used - 25 limit)
			expect(
				mockStripe.subscriptionItems.createUsageRecord,
			).toHaveBeenCalledWith("si_alert_overage", {
				quantity: 50,
				timestamp: "now",
				action: "set",
			});
			expect(mockRepository.markOverageReported).toHaveBeenCalledWith(
				"org-123",
				"usage_record_123",
			);
		});

		it("should not report overage when usage is within limit", async () => {
			const usageWithinLimit = { ...mockUsage, alertsUsed: 20 }; // Within 25 limit
			mockRepository.getOrganizationUsage.mockResolvedValue(usageWithinLimit);
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			// Create service with pricing repository so getUserPlanLimits works
			const mockPricingRepo = createMockPricingRepositoryForBusiness();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			await serviceWithPricing.reportAlertOverageToStripe(
				"org-123",
				"user-456",
				"si_alert_overage",
			);

			expect(
				mockStripe.subscriptionItems.createUsageRecord,
			).not.toHaveBeenCalled();
			expect(mockRepository.markOverageReported).not.toHaveBeenCalled();
		});

		it("should not report if no subscription exists", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);
			mockRepository.getUserSubscription.mockResolvedValue(null);

			await service.reportAlertOverageToStripe(
				"org-123",
				"user-456",
				"si_alert_overage",
			);

			expect(
				mockStripe.subscriptionItems.createUsageRecord,
			).not.toHaveBeenCalled();
		});

		it("should not report if Stripe is not configured", async () => {
			const serviceNoStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				null,
			);

			await serviceNoStripe.reportAlertOverageToStripe(
				"org-123",
				"user-456",
				"si_alert_overage",
			);

			expect(
				mockStripe.subscriptionItems.createUsageRecord,
			).not.toHaveBeenCalled();
		});
	});

	describe("updateTotalSeatQuantityForOwner", () => {
		const mockStripeSubscription = {
			id: "sub_stripe_456",
			items: {
				data: [
					{
						id: "si_base_plan",
						price: { id: "price_pro" },
					},
					{
						id: "si_seats",
						price: { id: "price_seat" },
					},
				],
			},
		};

		// Mock PricingRepository that returns pro limits
		const createMockPricingRepository = () => ({
			getPlanByName: vi.fn().mockResolvedValue({ id: "plan_pro", name: "pro" }),
			getLimitsForPlan: vi.fn().mockResolvedValue(proLimits),
			getLicenseByUserId: vi.fn().mockResolvedValue(null),
		});

		it("should aggregate extra seats across multiple organizations", async () => {
			// Pro plan: 10 users/org included
			// Org1: 12 users = 2 extra, Org2: 8 users = 0 extra, Org3: 15 users = 5 extra
			// Total extra seats = 7
			mockRepository.getUserSubscription.mockResolvedValue(mockProSubscription);
			mockRepository.getOwnedOrganizationsWithMemberCounts.mockResolvedValue([
				{ organizationId: "org-1", memberCount: 12 },
				{ organizationId: "org-2", memberCount: 8 },
				{ organizationId: "org-3", memberCount: 15 },
			]);
			mockStripe.subscriptions.retrieve.mockResolvedValue(
				mockStripeSubscription,
			);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			await serviceWithPricing.updateTotalSeatQuantityForOwner(
				"user-789",
				"price_seat",
			);

			// Should update with total of 7 extra seats (2 + 0 + 5)
			expect(mockStripe.subscriptionItems.update).toHaveBeenCalledWith(
				"si_seats",
				{
					quantity: 7,
					proration_behavior: "create_prorations",
				},
			);
			// Should update usage for all orgs
			expect(mockRepository.updateUsersCount).toHaveBeenCalledTimes(3);
		});

		it("should remove seat item when no extra seats across all orgs", async () => {
			// Pro plan: 10 users/org included
			// All orgs have less than 10 users = 0 total extra
			mockRepository.getUserSubscription.mockResolvedValue(mockProSubscription);
			mockRepository.getOwnedOrganizationsWithMemberCounts.mockResolvedValue([
				{ organizationId: "org-1", memberCount: 5 },
				{ organizationId: "org-2", memberCount: 8 },
				{ organizationId: "org-3", memberCount: 10 },
			]);
			mockStripe.subscriptions.retrieve.mockResolvedValue(
				mockStripeSubscription,
			);
			mockStripe.subscriptionItems.del = vi.fn().mockResolvedValue({});

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			await serviceWithPricing.updateTotalSeatQuantityForOwner(
				"user-789",
				"price_seat",
			);

			expect(mockStripe.subscriptionItems.del).toHaveBeenCalledWith(
				"si_seats",
				{
					proration_behavior: "create_prorations",
				},
			);
			expect(mockStripe.subscriptionItems.update).not.toHaveBeenCalled();
		});

		it("should create seat item if it does not exist and there are extra seats", async () => {
			const subscriptionWithoutSeatItem = {
				...mockStripeSubscription,
				items: {
					data: [{ id: "si_base_plan", price: { id: "price_pro" } }],
				},
			};
			mockRepository.getUserSubscription.mockResolvedValue(mockProSubscription);
			mockRepository.getOwnedOrganizationsWithMemberCounts.mockResolvedValue([
				{ organizationId: "org-1", memberCount: 13 }, // 3 extra
			]);
			mockStripe.subscriptions.retrieve.mockResolvedValue(
				subscriptionWithoutSeatItem,
			);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			await serviceWithPricing.updateTotalSeatQuantityForOwner(
				"user-789",
				"price_seat",
			);

			expect(mockStripe.subscriptionItems.create).toHaveBeenCalledWith({
				subscription: "sub_stripe_456",
				price: "price_seat",
				quantity: 3,
				proration_behavior: "create_prorations",
			});
		});

		it("should skip update if Stripe is not configured", async () => {
			const serviceNoStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				null,
			);

			await serviceNoStripe.updateTotalSeatQuantityForOwner(
				"user-789",
				"price_seat",
			);

			expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled();
		});

		it("should skip update if no subscription exists", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(null);

			await service.updateTotalSeatQuantityForOwner("user-789", "price_seat");

			expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled();
		});
	});

	describe("updateSubscriptionSeatQuantity (delegates to aggregated method)", () => {
		// Mock PricingRepository that returns pro limits
		const createMockPricingRepository = () => ({
			getPlanByName: vi.fn().mockResolvedValue({ id: "plan_pro", name: "pro" }),
			getLimitsForPlan: vi.fn().mockResolvedValue(proLimits),
			getLicenseByUserId: vi.fn().mockResolvedValue(null),
		});

		it("should delegate to updateTotalSeatQuantityForOwner", async () => {
			mockRepository.getOrganizationOwnerUserId.mockResolvedValue("user-789");
			mockRepository.getUserSubscription.mockResolvedValue(mockProSubscription);
			mockRepository.getOwnedOrganizationsWithMemberCounts.mockResolvedValue([
				{ organizationId: "org-123", memberCount: 12 },
			]);
			mockStripe.subscriptions.retrieve.mockResolvedValue({
				id: "sub_stripe_456",
				items: {
					data: [{ id: "si_seats", price: { id: "price_seat" } }],
				},
			});

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			// The newUserCount parameter is now ignored (kept for backwards compat)
			await serviceWithPricing.updateSubscriptionSeatQuantity(
				"org-123",
				999, // This value is ignored
				"price_seat",
			);

			// Should have gotten the owner and delegated
			expect(mockRepository.getOrganizationOwnerUserId).toHaveBeenCalledWith(
				"org-123",
			);
			expect(
				mockRepository.getOwnedOrganizationsWithMemberCounts,
			).toHaveBeenCalledWith("user-789");
		});

		it("should skip update if no organization owner found", async () => {
			mockRepository.getOrganizationOwnerUserId.mockResolvedValue(null);

			await service.updateSubscriptionSeatQuantity("org-123", 8, "price_seat");

			expect(
				mockRepository.getOwnedOrganizationsWithMemberCounts,
			).not.toHaveBeenCalled();
		});
	});

	describe("handleMemberAdded", () => {
		// Mock PricingRepository that returns pro limits
		const createMockPricingRepository = () => ({
			getPlanByName: vi.fn().mockResolvedValue({ id: "plan_pro", name: "pro" }),
			getLimitsForPlan: vi.fn().mockResolvedValue(proLimits),
			getLicenseByUserId: vi.fn().mockResolvedValue(null),
		});

		it("should count members and delegate to aggregated seat update", async () => {
			mockRepository.countOrganizationMembers.mockResolvedValue(7);
			mockRepository.getOrganizationOwnerUserId.mockResolvedValue("user-789");
			mockRepository.getUserSubscription.mockResolvedValue(mockProSubscription);
			mockRepository.getOwnedOrganizationsWithMemberCounts.mockResolvedValue([
				{ organizationId: "org-123", memberCount: 12 },
			]);
			mockStripe.subscriptions.retrieve.mockResolvedValue({
				id: "sub_stripe_456",
				items: {
					data: [{ id: "si_seats", price: { id: "price_seat" } }],
				},
			});

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			await serviceWithPricing.handleMemberAdded("org-123", "price_seat");

			expect(mockRepository.countOrganizationMembers).toHaveBeenCalledWith(
				"org-123",
			);
			// Should delegate to aggregated method
			expect(
				mockRepository.getOwnedOrganizationsWithMemberCounts,
			).toHaveBeenCalled();
		});
	});

	describe("handleMemberRemoved", () => {
		// Mock PricingRepository that returns pro limits
		const createMockPricingRepository = () => ({
			getPlanByName: vi.fn().mockResolvedValue({ id: "plan_pro", name: "pro" }),
			getLimitsForPlan: vi.fn().mockResolvedValue(proLimits),
			getLicenseByUserId: vi.fn().mockResolvedValue(null),
		});

		it("should count members and delegate to aggregated seat update", async () => {
			mockRepository.countOrganizationMembers.mockResolvedValue(4);
			mockRepository.getOrganizationOwnerUserId.mockResolvedValue("user-789");
			mockRepository.getUserSubscription.mockResolvedValue(mockProSubscription);
			mockRepository.getOwnedOrganizationsWithMemberCounts.mockResolvedValue([
				{ organizationId: "org-123", memberCount: 9 },
			]);
			mockStripe.subscriptions.retrieve.mockResolvedValue({
				id: "sub_stripe_456",
				items: {
					data: [{ id: "si_seats", price: { id: "price_seat" } }],
				},
			});

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			await serviceWithPricing.handleMemberRemoved("org-123", "price_seat");

			expect(mockRepository.countOrganizationMembers).toHaveBeenCalledWith(
				"org-123",
			);
			// Should delegate to aggregated method
			expect(
				mockRepository.getOwnedOrganizationsWithMemberCounts,
			).toHaveBeenCalled();
		});
	});

	describe("reportOverageToStripe (deprecated)", () => {
		it("should log deprecation warning and do nothing", async () => {
			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			await service.reportOverageToStripe(
				"org-123",
				"user-456",
				"price_overage",
			);

			expect(consoleSpy).toHaveBeenCalledWith(
				"[Subscription] reportOverageToStripe is deprecated, use reportAlertOverageToStripe instead",
			);
			consoleSpy.mockRestore();
		});
	});

	describe("getUserSubscriptionStatus", () => {
		it("should return no-subscription status when no record exists", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(null);
			mockRepository.countOrganizationsOwned.mockResolvedValue(0);

			const status = await service.getUserSubscriptionStatus("user-none");

			expect(status.hasSubscription).toBe(false);
			expect(status.isLicenseBased).toBe(false);
			expect(status.licenseExpiresAt).toBeNull();
			expect(status.organizationsLimit).toBe(0);
		});

		it("should return Stripe subscription status for non-license subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);
			mockRepository.countOrganizationsOwned.mockResolvedValue(1);

			const mockPricingRepo = createMockPricingRepositoryForBusiness();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const status =
				await serviceWithPricing.getUserSubscriptionStatus("user-456");

			expect(status.hasSubscription).toBe(true);
			expect(status.plan).toBe("business");
			expect(status.isLicenseBased).toBe(false);
			expect(status.licenseExpiresAt).toBeNull();
			expect(status.organizationsOwned).toBe(1);
		});

		it("should return license-based status for enterprise license subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(
				mockLicenseSubscription,
			);
			mockRepository.countOrganizationsOwned.mockResolvedValue(1);

			const mockPricingRepo = {
				...createMockPricingRepositoryForBusiness(),
				getLicenseByUserId: vi.fn().mockResolvedValue({
					id: "license-001",
					maxOrganizations: 0,
					maxUsers: 50,
					reportsPerMonth: 500,
					noticesPerMonth: 500,
					alertsPerMonth: 1000,
					operationsPerMonth: 5000,
					clientsPerMonth: 2000,
					watchlistQueriesPerMonth: 1000,
					expiresAt: new Date("2025-12-31"),
					status: "active",
				}),
			};
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const status =
				await serviceWithPricing.getUserSubscriptionStatus("user-license");

			expect(status.hasSubscription).toBe(true);
			expect(status.plan).toBe("enterprise");
			expect(status.isLicenseBased).toBe(true);
			expect(status.licenseExpiresAt).toBe("2025-12-31T00:00:00.000Z");
			expect(status.status).toBe("active");
		});

		it("should return null licenseExpiresAt for perpetual license", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(
				mockLicenseSubscription,
			);
			mockRepository.countOrganizationsOwned.mockResolvedValue(0);

			const mockPricingRepo = {
				...createMockPricingRepositoryForBusiness(),
				getLicenseByUserId: vi.fn().mockResolvedValue({
					id: "license-001",
					maxOrganizations: 0,
					maxUsers: 50,
					reportsPerMonth: 500,
					noticesPerMonth: 500,
					alertsPerMonth: 1000,
					operationsPerMonth: 5000,
					clientsPerMonth: 2000,
					watchlistQueriesPerMonth: 1000,
					expiresAt: null,
					status: "active",
				}),
			};
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const status =
				await serviceWithPricing.getUserSubscriptionStatus("user-license");

			expect(status.isLicenseBased).toBe(true);
			expect(status.licenseExpiresAt).toBeNull();
		});
	});

	describe("canCreateOrganization", () => {
		it("should deny creation when user has no subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(null);
			mockRepository.countOrganizationsOwned.mockResolvedValue(0);

			const result = await service.canCreateOrganization("user-none");

			expect(result.allowed).toBe(false);
			expect(result.reason).toMatch(/subscription is required/i);
		});

		it("should deny creation when subscription is canceled", async () => {
			mockRepository.getUserSubscription.mockResolvedValue({
				...mockSubscription,
				status: "canceled",
			});
			mockRepository.countOrganizationsOwned.mockResolvedValue(0);

			const result = await service.canCreateOrganization("user-456");

			expect(result.allowed).toBe(false);
			expect(result.reason).toMatch(/canceled/i);
		});

		it("should allow creation when limit is 0 (unlimited enterprise license)", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(
				mockLicenseSubscription,
			);
			// User already owns many orgs, but limit is 0 (unlimited)
			mockRepository.countOrganizationsOwned.mockResolvedValue(99);

			const mockPricingRepo = {
				...createMockPricingRepositoryForBusiness(),
				getLicenseByUserId: vi.fn().mockResolvedValue({
					id: "license-001",
					maxOrganizations: 0, // 0 = unlimited
					maxUsers: 0,
					reportsPerMonth: 0,
					noticesPerMonth: 0,
					alertsPerMonth: 0,
					operationsPerMonth: 0,
					clientsPerMonth: 0,
					watchlistQueriesPerMonth: 0,
					expiresAt: null,
					status: "active",
				}),
			};
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result =
				await serviceWithPricing.canCreateOrganization("user-license");

			expect(result.allowed).toBe(true);
		});

		it("should allow creation when orgs owned is below the plan limit", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);
			mockRepository.countOrganizationsOwned.mockResolvedValue(0); // 0 owned, limit is 1

			const mockPricingRepo = createMockPricingRepositoryForBusiness();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.canCreateOrganization("user-456");

			expect(result.allowed).toBe(true);
		});

		it("should deny creation when orgs owned meets the plan limit", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);
			mockRepository.countOrganizationsOwned.mockResolvedValue(1); // 1 owned, limit is 1

			const mockPricingRepo = createMockPricingRepositoryForBusiness();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.canCreateOrganization("user-456");

			expect(result.allowed).toBe(false);
			expect(result.reason).toMatch(/limit/i);
		});
	});

	describe("getUserFeatures", () => {
		it("should return enterprise features for license-based subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(
				mockLicenseSubscription,
			);

			const features = await service.getUserFeatures("user-license");

			expect(features).toContain("data_capture");
			expect(features).toContain("advanced_roles");
			expect(features).toContain("priority_support");
			expect(features.length).toBeGreaterThan(0);
		});

		it("should return enterprise features even for plan=enterprise without licenseId", async () => {
			const enterpriseSub: UserSubscription = {
				...mockSubscription,
				plan: "enterprise",
				licenseId: null,
			};
			mockRepository.getUserSubscription.mockResolvedValue(enterpriseSub);

			const features = await service.getUserFeatures("user-enterprise");

			expect(features).toContain("advanced_roles");
			expect(features).toContain("priority_support");
		});

		it("should return business features for business plan", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			const features = await service.getUserFeatures("user-456");

			expect(features).toContain("data_capture");
			expect(features).not.toContain("advanced_roles");
		});

		it("should return empty array when no subscription exists", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(null);

			const features = await service.getUserFeatures("user-none");

			expect(features).toEqual([]);
		});
	});
});
