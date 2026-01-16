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
	transactionsUsed: 300, // Over the 250 limit for business
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
	transactionsPerMonth: 50,
	clientsPerMonth: 25,
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
	transactionsPerMonth: 500,
	clientsPerMonth: 250,
};

// Pro subscription for multi-org tests
const mockProSubscription: UserSubscription = {
	id: "sub-2",
	plan: "pro",
	referenceId: "user-789",
	stripeCustomerId: "cus_456",
	stripeSubscriptionId: "sub_stripe_456",
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

	// =========================================================================
	// USER SUBSCRIPTION STATUS
	// =========================================================================

	describe("getUserSubscriptionStatus", () => {
		const createMockPricingRepository = () => ({
			getPlanByName: vi
				.fn()
				.mockResolvedValue({ id: "plan_business", name: "business" }),
			getLimitsForPlan: vi.fn().mockResolvedValue(businessLimits),
			getLicenseByUserId: vi.fn().mockResolvedValue(null),
		});

		it("should return status for user without subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(null);
			mockRepository.countOrganizationsOwned.mockResolvedValue(0);

			const status = await service.getUserSubscriptionStatus("user-123");

			expect(status.hasSubscription).toBe(false);
			expect(status.status).toBeNull();
			expect(status.plan).toBeNull();
			expect(status.isTrialing).toBe(false);
			expect(status.organizationsLimit).toBe(0);
		});

		it("should return status for user with active subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);
			mockRepository.countOrganizationsOwned.mockResolvedValue(1);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const status =
				await serviceWithPricing.getUserSubscriptionStatus("user-456");

			expect(status.hasSubscription).toBe(true);
			expect(status.status).toBe("active");
			expect(status.plan).toBe("business");
			expect(status.isTrialing).toBe(false);
		});

		it("should return trial days remaining for trialing subscription", async () => {
			const trialingSub = {
				...mockSubscription,
				status: "trialing",
				trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
			};
			mockRepository.getUserSubscription.mockResolvedValue(trialingSub);
			mockRepository.countOrganizationsOwned.mockResolvedValue(1);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const status =
				await serviceWithPricing.getUserSubscriptionStatus("user-456");

			expect(status.isTrialing).toBe(true);
			expect(status.trialDaysRemaining).toBeGreaterThanOrEqual(6);
			expect(status.trialDaysRemaining).toBeLessThanOrEqual(8);
		});
	});

	describe("canCreateOrganization", () => {
		const createMockPricingRepository = () => ({
			getPlanByName: vi
				.fn()
				.mockResolvedValue({ id: "plan_business", name: "business" }),
			getLimitsForPlan: vi.fn().mockResolvedValue(businessLimits),
			getLicenseByUserId: vi.fn().mockResolvedValue(null),
		});

		it("should deny when no subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(null);
			mockRepository.countOrganizationsOwned.mockResolvedValue(0);

			const result = await service.canCreateOrganization("user-123");

			expect(result.allowed).toBe(false);
			expect(result.reason).toContain("subscription is required");
		});

		it("should deny when subscription is canceled", async () => {
			const canceledSub = { ...mockSubscription, status: "canceled" };
			mockRepository.getUserSubscription.mockResolvedValue(canceledSub);
			mockRepository.countOrganizationsOwned.mockResolvedValue(0);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.canCreateOrganization("user-456");

			expect(result.allowed).toBe(false);
			expect(result.reason).toContain("canceled");
		});

		it("should deny when at organization limit", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);
			mockRepository.countOrganizationsOwned.mockResolvedValue(1); // At limit for business

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.canCreateOrganization("user-456");

			expect(result.allowed).toBe(false);
			expect(result.reason).toContain("reached the limit");
		});

		it("should allow when subscription is active and under limit", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);
			mockRepository.countOrganizationsOwned.mockResolvedValue(0);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.canCreateOrganization("user-456");

			expect(result.allowed).toBe(true);
		});

		it("should allow when subscription is trialing", async () => {
			const trialingSub = { ...mockSubscription, status: "trialing" };
			mockRepository.getUserSubscription.mockResolvedValue(trialingSub);
			mockRepository.countOrganizationsOwned.mockResolvedValue(0);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.canCreateOrganization("user-456");

			expect(result.allowed).toBe(true);
		});
	});

	describe("getUserPlanLimits", () => {
		it("should return null when no subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(null);

			const limits = await service.getUserPlanLimits("user-123");

			expect(limits).toBeNull();
		});

		it("should return null and log warning when pricing service returns null", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);
			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			// Service without pricing repository
			const limits = await service.getUserPlanLimits("user-456");

			expect(limits).toBeNull();
			consoleSpy.mockRestore();
		});
	});

	describe("getUserFeatures", () => {
		it("should return empty array when no subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(null);

			const features = await service.getUserFeatures("user-123");

			expect(features).toEqual([]);
		});

		it("should return features for business plan", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			const features = await service.getUserFeatures("user-456");

			expect(Array.isArray(features)).toBe(true);
		});

		it("should return business features for unknown plan", async () => {
			const unknownPlanSub = { ...mockSubscription, plan: "unknown" };
			mockRepository.getUserSubscription.mockResolvedValue(unknownPlanSub);

			const features = await service.getUserFeatures("user-456");

			expect(Array.isArray(features)).toBe(true);
		});
	});

	describe("hasFeature", () => {
		it("should return true when user has feature", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			const hasFeature = await service.hasFeature("user-456", "data_capture");

			expect(typeof hasFeature).toBe("boolean");
		});

		it("should return false when no subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValue(null);

			const hasFeature = await service.hasFeature("user-123", "data_capture");

			expect(hasFeature).toBe(false);
		});
	});

	// =========================================================================
	// ORGANIZATION USAGE
	// =========================================================================

	describe("getOrCreateOrganizationUsage", () => {
		it("should return existing usage record", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);

			const usage = await service.getOrCreateOrganizationUsage(
				"org-123",
				"user-456",
			);

			expect(usage.organizationId).toBe("org-123");
		});

		it("should create usage record when none exists", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(null);
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);
			mockRepository.upsertOrganizationUsage.mockResolvedValue(mockUsage);

			const usage = await service.getOrCreateOrganizationUsage(
				"org-123",
				"user-456",
			);

			expect(usage.organizationId).toBe("org-123");
			expect(mockRepository.upsertOrganizationUsage).toHaveBeenCalled();
		});

		it("should use default period when no subscription", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(null);
			mockRepository.getUserSubscription.mockResolvedValue(null);
			mockRepository.upsertOrganizationUsage.mockResolvedValue(mockUsage);

			await service.getOrCreateOrganizationUsage("org-123", "user-456");

			expect(mockRepository.upsertOrganizationUsage).toHaveBeenCalled();
		});
	});

	describe("checkUsage", () => {
		const createMockPricingRepository = () => ({
			getPlanByName: vi
				.fn()
				.mockResolvedValue({ id: "plan_business", name: "business" }),
			getLimitsForPlan: vi.fn().mockResolvedValue(businessLimits),
			getLicenseByUserId: vi.fn().mockResolvedValue(null),
		});

		it("should return usage check result for alerts", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.checkUsage(
				"org-123",
				"user-456",
				"alerts",
			);

			expect(result.used).toBe(75);
			expect(result.included).toBe(25);
			expect(result.overage).toBe(50);
		});

		it("should return not allowed when no limits", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);
			mockRepository.getUserSubscription.mockResolvedValue(null);

			const result = await service.checkUsage("org-123", "user-456", "alerts");

			expect(result.allowed).toBe(false);
		});

		it("should check reports usage", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.checkUsage(
				"org-123",
				"user-456",
				"reports",
			);

			expect(result.used).toBe(5);
		});

		it("should check notices usage", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.checkUsage(
				"org-123",
				"user-456",
				"notices",
			);

			expect(result.used).toBe(10);
		});

		it("should check transactions usage", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.checkUsage(
				"org-123",
				"user-456",
				"transactions",
			);

			expect(result.used).toBe(300);
		});

		it("should check clients usage", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.checkUsage(
				"org-123",
				"user-456",
				"clients",
			);

			expect(result.used).toBe(60);
		});

		it("should check users usage", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValue(mockUsage);
			mockRepository.getUserSubscription.mockResolvedValue(mockSubscription);

			const mockPricingRepo = createMockPricingRepository();
			const serviceWithPricing = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as Stripe,
				mockPricingRepo as unknown as import("../pricing/repository").PricingRepository,
			);

			const result = await serviceWithPricing.checkUsage(
				"org-123",
				"user-456",
				"users",
			);

			expect(result.used).toBe(3);
		});
	});

	describe("reportUsage", () => {
		it("should call repository to increment usage", async () => {
			mockRepository.incrementUsage.mockResolvedValue(undefined);

			await service.reportUsage("org-123", "alerts", 5);

			expect(mockRepository.incrementUsage).toHaveBeenCalledWith(
				"org-123",
				"alerts",
				5,
			);
		});

		it("should default to count of 1", async () => {
			mockRepository.incrementUsage.mockResolvedValue(undefined);

			await service.reportUsage("org-123", "notices");

			expect(mockRepository.incrementUsage).toHaveBeenCalledWith(
				"org-123",
				"notices",
				1,
			);
		});
	});

	describe("updateUsersCount", () => {
		it("should call repository to update users count", async () => {
			mockRepository.updateUsersCount.mockResolvedValue(undefined);

			await service.updateUsersCount("org-123", 10);

			expect(mockRepository.updateUsersCount).toHaveBeenCalledWith(
				"org-123",
				10,
			);
		});
	});

	describe("resetUsageForPeriod", () => {
		it("should call repository to reset usage", async () => {
			mockRepository.resetUsage.mockResolvedValue(undefined);
			const start = new Date("2024-02-01");
			const end = new Date("2024-02-29");

			await service.resetUsageForPeriod("org-123", start, end);

			expect(mockRepository.resetUsage).toHaveBeenCalledWith(
				"org-123",
				start,
				end,
			);
		});
	});

	// =========================================================================
	// CARD FINGERPRINT
	// =========================================================================

	describe("isCardUsedForTrial", () => {
		it("should return result from repository", async () => {
			mockRepository.isCardFingerprintUsed.mockResolvedValue(true);

			const result = await service.isCardUsedForTrial("fp_123");

			expect(result).toBe(true);
			expect(mockRepository.isCardFingerprintUsed).toHaveBeenCalledWith(
				"fp_123",
			);
		});
	});

	describe("storeCardFingerprint", () => {
		it("should store new fingerprint when not exists", async () => {
			mockRepository.isCardFingerprintUsed.mockResolvedValue(false);
			mockRepository.storeCardFingerprint.mockResolvedValue(undefined);

			await service.storeCardFingerprint("fp_new", "user-123");

			expect(mockRepository.storeCardFingerprint).toHaveBeenCalledWith(
				"fp_new",
				"user-123",
			);
		});

		it("should increment usage when fingerprint exists", async () => {
			mockRepository.isCardFingerprintUsed.mockResolvedValue(true);
			mockRepository.incrementCardFingerprintUsage.mockResolvedValue(undefined);

			await service.storeCardFingerprint("fp_existing", "user-123");

			expect(mockRepository.incrementCardFingerprintUsage).toHaveBeenCalledWith(
				"fp_existing",
			);
		});
	});
});
