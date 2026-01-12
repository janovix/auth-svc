import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsageService } from "./usage-service";
import { SubscriptionRepository } from "./repository";
import type {
	OrganizationSubscription,
	SubscriptionPlan,
	PlanTier,
	Feature,
} from "./types";

// Mock Stripe
function createMockStripe() {
	return {
		subscriptionItems: {
			createUsageRecord: vi.fn(),
		},
	};
}

describe("UsageService", () => {
	let mockRepository: {
		getByOrganizationId: ReturnType<typeof vi.fn>;
		incrementUsage: ReturnType<typeof vi.fn>;
		updateUsage: ReturnType<typeof vi.fn>;
		resetUsage: ReturnType<typeof vi.fn>;
		getOrCreateUsageRecord: ReturnType<typeof vi.fn>;
		updateUsageRecord: ReturnType<typeof vi.fn>;
	};
	let mockStripe: ReturnType<typeof createMockStripe>;
	let service: UsageService;

	beforeEach(() => {
		vi.clearAllMocks();

		mockRepository = {
			getByOrganizationId: vi.fn(),
			incrementUsage: vi.fn(),
			updateUsage: vi.fn(),
			resetUsage: vi.fn(),
			getOrCreateUsageRecord: vi.fn(),
			updateUsageRecord: vi.fn(),
		};

		mockStripe = createMockStripe();

		service = new UsageService(
			mockRepository as unknown as SubscriptionRepository,
			mockStripe as unknown as import("stripe").default,
		);
	});

	const createMockPlan = (overrides = {}): SubscriptionPlan => ({
		id: "plan-123",
		name: "Business",
		tier: "business" as PlanTier,
		billingInterval: "month",
		stripePriceId: "price_123",
		basePrice: 999,
		noticesIncluded: 50,
		usersIncluded: 5,
		transactionsIncluded: null,
		alertsIncluded: null,
		overagePriceId: "price_overage",
		overagePrice: 15,
		features: ["data_capture"] as Feature[],
		active: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	});

	const createMockSubscription = (
		overrides = {},
	): OrganizationSubscription => ({
		id: "sub-123",
		organizationId: "org-456",
		stripeCustomerId: "cus_123",
		planId: "plan-123",
		stripeSubscriptionId: "sub_stripe_123",
		stripeSubscriptionItemId: "si_123",
		status: "active",
		currentPeriodStart: new Date("2024-01-01"),
		currentPeriodEnd: new Date("2024-02-01"),
		cancelAtPeriodEnd: false,
		noticesUsed: 25,
		alertsUsed: 10,
		transactionsUsed: 100,
		usersCount: 3,
		licenseId: null,
		billingEmail: "billing@test.com",
		billingName: "Test Company",
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	});

	describe("reportUsage", () => {
		it("should return not allowed when no subscription", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			const result = await service.reportUsage("org-456", "notices", 1);

			expect(result.allowed).toBe(false);
			expect(result.planTier).toBe("none");
		});

		it("should throw when trying to report users", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(
				createMockSubscription(),
			);

			await expect(service.reportUsage("org-456", "users", 1)).rejects.toThrow(
				"Use updateUsersCount for user tracking",
			);
		});

		it("should increment notices usage", async () => {
			const mockPlan = createMockPlan({ noticesIncluded: 100 });
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 25,
			});
			const updatedSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 30,
			});

			mockRepository.getByOrganizationId
				.mockResolvedValueOnce(mockSubscription)
				.mockResolvedValueOnce(updatedSubscription);
			mockRepository.incrementUsage.mockResolvedValue(undefined);

			const result = await service.reportUsage("org-456", "notices", 5);

			expect(mockRepository.incrementUsage).toHaveBeenCalledWith(
				"org-456",
				"notices",
				5,
			);
			expect(result.used).toBe(30);
			expect(result.included).toBe(100);
			expect(result.remaining).toBe(70);
		});

		it("should increment alerts usage", async () => {
			const mockPlan = createMockPlan({ alertsIncluded: null }); // unlimited
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				alertsUsed: 10,
			});
			const updatedSubscription = createMockSubscription({
				plan: mockPlan,
				alertsUsed: 15,
			});

			mockRepository.getByOrganizationId
				.mockResolvedValueOnce(mockSubscription)
				.mockResolvedValueOnce(updatedSubscription);
			mockRepository.incrementUsage.mockResolvedValue(undefined);

			const result = await service.reportUsage("org-456", "alerts", 5);

			expect(result.used).toBe(15);
			expect(result.included).toBe(-1); // unlimited
		});

		it("should increment transactions usage", async () => {
			const mockPlan = createMockPlan({ transactionsIncluded: 1000 });
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				transactionsUsed: 100,
			});
			const updatedSubscription = createMockSubscription({
				plan: mockPlan,
				transactionsUsed: 110,
			});

			mockRepository.getByOrganizationId
				.mockResolvedValueOnce(mockSubscription)
				.mockResolvedValueOnce(updatedSubscription);
			mockRepository.incrementUsage.mockResolvedValue(undefined);

			const result = await service.reportUsage("org-456", "transactions", 10);

			expect(result.used).toBe(110);
			expect(result.included).toBe(1000);
		});

		it("should report overage to Stripe when notices exceed limit", async () => {
			const mockPlan = createMockPlan({ noticesIncluded: 50 });
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 45,
				stripeSubscriptionItemId: "si_123",
			});
			const updatedSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 55, // 5 overage
				stripeSubscriptionItemId: "si_123",
			});

			mockRepository.getByOrganizationId
				.mockResolvedValueOnce(mockSubscription)
				.mockResolvedValueOnce(updatedSubscription);
			mockRepository.incrementUsage.mockResolvedValue(undefined);
			mockRepository.getOrCreateUsageRecord.mockResolvedValue({
				id: "usage-123",
				noticesOverage: 0,
				stripeUsageRecordIds: null,
			});
			mockStripe.subscriptionItems.createUsageRecord.mockResolvedValue({
				id: "ur_123",
			});
			mockRepository.updateUsageRecord.mockResolvedValue(undefined);

			const result = await service.reportUsage("org-456", "notices", 10);

			expect(result.overage).toBe(5);
			expect(
				mockStripe.subscriptionItems.createUsageRecord,
			).toHaveBeenCalledWith(
				"si_123",
				expect.objectContaining({
					quantity: 5,
					action: "increment",
				}),
			);
		});

		it("should not report overage when already reported", async () => {
			const mockPlan = createMockPlan({ noticesIncluded: 50 });
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 55,
				stripeSubscriptionItemId: "si_123",
			});
			const updatedSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 60,
				stripeSubscriptionItemId: "si_123",
			});

			mockRepository.getByOrganizationId
				.mockResolvedValueOnce(mockSubscription)
				.mockResolvedValueOnce(updatedSubscription);
			mockRepository.incrementUsage.mockResolvedValue(undefined);
			mockRepository.getOrCreateUsageRecord.mockResolvedValue({
				id: "usage-123",
				noticesOverage: 10, // Already reported 10
				stripeUsageRecordIds: ["ur_old"],
			});

			const result = await service.reportUsage("org-456", "notices", 5);

			expect(result.overage).toBe(10);
			expect(
				mockStripe.subscriptionItems.createUsageRecord,
			).not.toHaveBeenCalled();
		});

		it("should handle Stripe error gracefully", async () => {
			const mockPlan = createMockPlan({ noticesIncluded: 50 });
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 45,
				stripeSubscriptionItemId: "si_123",
			});
			const updatedSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 55,
				stripeSubscriptionItemId: "si_123",
			});

			mockRepository.getByOrganizationId
				.mockResolvedValueOnce(mockSubscription)
				.mockResolvedValueOnce(updatedSubscription);
			mockRepository.incrementUsage.mockResolvedValue(undefined);
			mockRepository.getOrCreateUsageRecord.mockResolvedValue({
				id: "usage-123",
				noticesOverage: 0,
				stripeUsageRecordIds: null,
			});
			mockStripe.subscriptionItems.createUsageRecord.mockRejectedValue(
				new Error("Stripe error"),
			);

			// Should not throw
			const result = await service.reportUsage("org-456", "notices", 10);

			expect(result.overage).toBe(5);
		});

		it("should throw when updated subscription not found", async () => {
			const mockSubscription = createMockSubscription();

			mockRepository.getByOrganizationId
				.mockResolvedValueOnce(mockSubscription)
				.mockResolvedValueOnce(null);
			mockRepository.incrementUsage.mockResolvedValue(undefined);

			await expect(
				service.reportUsage("org-456", "notices", 1),
			).rejects.toThrow("Failed to get updated subscription");
		});

		it("should use default zero for missing plan limits", async () => {
			const mockSubscription = createMockSubscription({
				plan: null,
				noticesUsed: 10,
				stripeSubscriptionItemId: null, // No metered billing
			});
			const updatedSubscription = createMockSubscription({
				plan: null,
				noticesUsed: 15,
				stripeSubscriptionItemId: null,
			});

			mockRepository.getByOrganizationId
				.mockResolvedValueOnce(mockSubscription)
				.mockResolvedValueOnce(updatedSubscription);
			mockRepository.incrementUsage.mockResolvedValue(undefined);

			const result = await service.reportUsage("org-456", "notices", 5);

			expect(result.used).toBe(15);
			expect(result.included).toBe(0);
			expect(result.overage).toBe(15);
		});

		it("should handle enterprise tier", async () => {
			const mockSubscription = createMockSubscription({
				plan: null,
				licenseId: "lic-123",
				noticesUsed: 1000,
				stripeSubscriptionItemId: null, // No metered billing for enterprise
			});
			const updatedSubscription = createMockSubscription({
				plan: null,
				licenseId: "lic-123",
				noticesUsed: 1005,
				stripeSubscriptionItemId: null,
			});

			mockRepository.getByOrganizationId
				.mockResolvedValueOnce(mockSubscription)
				.mockResolvedValueOnce(updatedSubscription);
			mockRepository.incrementUsage.mockResolvedValue(undefined);

			const result = await service.reportUsage("org-456", "notices", 5);

			expect(result.planTier).toBe("enterprise");
		});
	});

	describe("updateUsersCount", () => {
		it("should update users count", async () => {
			mockRepository.updateUsage.mockResolvedValue(undefined);

			await service.updateUsersCount("org-456", 10);

			expect(mockRepository.updateUsage).toHaveBeenCalledWith("org-456", {
				usersCount: 10,
			});
		});
	});

	describe("getCurrentUsage", () => {
		it("should return null when no subscription", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			const result = await service.getCurrentUsage("org-456");

			expect(result).toBeNull();
		});

		it("should return current usage stats", async () => {
			const mockSubscription = createMockSubscription({
				noticesUsed: 30,
				alertsUsed: 15,
				transactionsUsed: 200,
				usersCount: 5,
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.getCurrentUsage("org-456");

			expect(result).toEqual({
				notices: 30,
				alerts: 15,
				transactions: 200,
				users: 5,
			});
		});
	});

	describe("resetUsageForNewPeriod", () => {
		it("should reset usage", async () => {
			mockRepository.resetUsage.mockResolvedValue(undefined);

			await service.resetUsageForNewPeriod("org-456");

			expect(mockRepository.resetUsage).toHaveBeenCalledWith("org-456");
		});
	});
});
