import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubscriptionService } from "./service";
import type { SubscriptionRepository } from "./repository";
import type { UserSubscription, OrganizationUsage } from "./types";

// Use actual PLAN_LIMITS from config (no mock needed)

type MockedRepository = {
	[K in keyof SubscriptionRepository]: ReturnType<typeof vi.fn>;
};

const createMockRepository = (): MockedRepository => {
	return {
		getUserSubscription: vi.fn(),
		getByStripeSubscriptionId: vi.fn(),
		getOrganizationUsage: vi.fn(),
		upsertOrganizationUsage: vi.fn(),
		incrementUsage: vi.fn(),
		updateUsersCount: vi.fn(),
		resetUsage: vi.fn(),
		markOverageReported: vi.fn(),
		countOrganizationsOwned: vi.fn(),
		isCardFingerprintUsed: vi.fn(),
		getCardFingerprint: vi.fn(),
		storeCardFingerprint: vi.fn(),
		incrementCardFingerprintUsage: vi.fn(),
	};
};

const createMockStripe = () => {
	return {
		subscriptions: {
			retrieve: vi.fn(),
			update: vi.fn(),
		},
	};
};

const sampleBusinessSubscription: UserSubscription = {
	id: "sub-1",
	plan: "business",
	referenceId: "user-1",
	stripeCustomerId: "cus_123",
	stripeSubscriptionId: "sub_123",
	status: "active",
	periodStart: new Date("2024-01-01"),
	periodEnd: new Date("2024-02-01"),
	cancelAtPeriodEnd: false,
	seats: 5,
	trialStart: null,
	trialEnd: null,
	createdAt: new Date("2024-01-01"),
	updatedAt: new Date("2024-01-15"),
};

const sampleProSubscription: UserSubscription = {
	...sampleBusinessSubscription,
	id: "sub-2",
	plan: "pro",
};

const sampleTrialingSubscription: UserSubscription = {
	...sampleBusinessSubscription,
	id: "sub-3",
	status: "trialing",
	trialStart: new Date("2024-01-01"),
	trialEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
};

const sampleOrgUsage: OrganizationUsage = {
	id: "usage-1",
	organizationId: "org-1",
	ownerUserId: "user-1",
	noticesUsed: 50,
	alertsUsed: 10,
	transactionsUsed: 100,
	usersCount: 3,
	periodStart: new Date("2024-01-01"),
	periodEnd: new Date("2024-02-01"),
	overageReportedAt: null,
	stripeUsageRecordId: null,
	createdAt: new Date("2024-01-01"),
	updatedAt: new Date("2024-01-15"),
};

describe("SubscriptionService", () => {
	let mockRepository: MockedRepository;
	let service: SubscriptionService;

	beforeEach(() => {
		mockRepository = createMockRepository();
		service = new SubscriptionService(
			mockRepository as unknown as SubscriptionRepository,
			null,
		);
	});

	// =========================================================================
	// USER SUBSCRIPTION STATUS
	// =========================================================================

	describe("getUserSubscriptionStatus", () => {
		it("returns no subscription status when user has no subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(null);
			mockRepository.countOrganizationsOwned.mockResolvedValueOnce(0);

			const result = await service.getUserSubscriptionStatus("user-1");

			expect(result).toEqual({
				hasSubscription: false,
				status: null,
				plan: null,
				limits: null,
				isTrialing: false,
				trialDaysRemaining: null,
				currentPeriodStart: null,
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false,
				organizationsOwned: 0,
				organizationsLimit: 0,
			});
		});

		it("returns full status for active business subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);
			mockRepository.countOrganizationsOwned.mockResolvedValueOnce(1);

			const result = await service.getUserSubscriptionStatus("user-1");

			expect(result.hasSubscription).toBe(true);
			expect(result.status).toBe("active");
			expect(result.plan).toBe("business");
			expect(result.isTrialing).toBe(false);
			expect(result.limits).toEqual({
				maxOrganizations: 1,
				noticesPerMonth: 50,
				usersPerOrg: 5,
				alertsPerMonth: null,
				transactionsPerMonth: null,
			});
			expect(result.organizationsOwned).toBe(1);
			expect(result.organizationsLimit).toBe(1);
		});

		it("returns trial days remaining for trialing subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleTrialingSubscription,
			);
			mockRepository.countOrganizationsOwned.mockResolvedValueOnce(0);

			const result = await service.getUserSubscriptionStatus("user-1");

			expect(result.isTrialing).toBe(true);
			expect(result.trialDaysRemaining).toBeGreaterThanOrEqual(4);
			expect(result.trialDaysRemaining).toBeLessThanOrEqual(6);
		});
	});

	describe("canCreateOrganization", () => {
		it("returns false when user has no subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(null);
			mockRepository.countOrganizationsOwned.mockResolvedValueOnce(0);

			const result = await service.canCreateOrganization("user-1");

			expect(result.allowed).toBe(false);
			expect(result.reason).toContain("subscription is required");
		});

		it("returns false when subscription is canceled", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce({
				...sampleBusinessSubscription,
				status: "canceled",
			});
			mockRepository.countOrganizationsOwned.mockResolvedValueOnce(0);

			const result = await service.canCreateOrganization("user-1");

			expect(result.allowed).toBe(false);
			expect(result.reason).toContain("canceled");
		});

		it("returns false when at organization limit", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);
			mockRepository.countOrganizationsOwned.mockResolvedValueOnce(1); // Business plan allows 1

			const result = await service.canCreateOrganization("user-1");

			expect(result.allowed).toBe(false);
			expect(result.reason).toContain("limit");
		});

		it("returns true when under organization limit", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleProSubscription,
			);
			mockRepository.countOrganizationsOwned.mockResolvedValueOnce(2); // Pro plan allows 5

			const result = await service.canCreateOrganization("user-1");

			expect(result.allowed).toBe(true);
			expect(result.reason).toBeUndefined();
		});

		it("allows trialing subscriptions", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleTrialingSubscription,
			);
			mockRepository.countOrganizationsOwned.mockResolvedValueOnce(0);

			const result = await service.canCreateOrganization("user-1");

			expect(result.allowed).toBe(true);
		});
	});

	describe("getUserPlanLimits", () => {
		it("returns limits for business plan", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);

			const result = await service.getUserPlanLimits("user-1");

			expect(result).toEqual({
				maxOrganizations: 1,
				noticesPerMonth: 50,
				usersPerOrg: 5,
				alertsPerMonth: null,
				transactionsPerMonth: null,
			});
		});

		it("returns null when no subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(null);

			const result = await service.getUserPlanLimits("user-1");

			expect(result).toBeNull();
		});
	});

	describe("getUserFeatures", () => {
		it("returns features for business plan", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);

			const result = await service.getUserFeatures("user-1");

			expect(result).toContain("data_capture");
			expect(result).toContain("compliance_validation");
			expect(result).not.toContain("advanced_roles");
		});

		it("returns features for pro plan", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleProSubscription,
			);

			const result = await service.getUserFeatures("user-1");

			expect(result).toContain("advanced_roles");
			expect(result).toContain("priority_support");
		});

		it("returns empty array when no subscription", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(null);

			const result = await service.getUserFeatures("user-1");

			expect(result).toEqual([]);
		});
	});

	describe("hasFeature", () => {
		it("returns true when user has feature", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleProSubscription,
			);

			const result = await service.hasFeature("user-1", "advanced_roles");

			expect(result).toBe(true);
		});

		it("returns false when user does not have feature", async () => {
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);

			const result = await service.hasFeature("user-1", "advanced_roles");

			expect(result).toBe(false);
		});
	});

	// =========================================================================
	// ORGANIZATION USAGE
	// =========================================================================

	describe("getOrCreateOrganizationUsage", () => {
		it("returns existing usage", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValueOnce(sampleOrgUsage);

			const result = await service.getOrCreateOrganizationUsage(
				"org-1",
				"user-1",
			);

			expect(result).toEqual(sampleOrgUsage);
			expect(mockRepository.upsertOrganizationUsage).not.toHaveBeenCalled();
		});

		it("creates new usage when not found", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValueOnce(null);
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);
			mockRepository.upsertOrganizationUsage.mockResolvedValueOnce(
				sampleOrgUsage,
			);

			const result = await service.getOrCreateOrganizationUsage(
				"org-1",
				"user-1",
			);

			expect(mockRepository.upsertOrganizationUsage).toHaveBeenCalled();
			expect(result).toEqual(sampleOrgUsage);
		});

		it("uses default period when user has no subscription", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValueOnce(null);
			mockRepository.getUserSubscription.mockResolvedValueOnce(null);
			mockRepository.upsertOrganizationUsage.mockResolvedValueOnce(
				sampleOrgUsage,
			);

			await service.getOrCreateOrganizationUsage("org-1", "user-1");

			expect(mockRepository.upsertOrganizationUsage).toHaveBeenCalledWith(
				"org-1",
				"user-1",
				expect.any(Date),
				expect.any(Date),
			);
		});
	});

	describe("checkUsage", () => {
		it("returns usage check for notices", async () => {
			// sampleOrgUsage has noticesUsed: 50, business plan has noticesPerMonth: 50
			mockRepository.getOrganizationUsage.mockResolvedValueOnce(sampleOrgUsage);
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);

			const result = await service.checkUsage("org-1", "user-1", "notices");

			expect(result).toEqual({
				allowed: true,
				used: 50,
				included: 50, // business plan limit
				remaining: 0, // 50 - 50 = 0
				overage: 0,
			});
		});

		it("returns overage when over limit", async () => {
			const overageUsage = { ...sampleOrgUsage, noticesUsed: 150 };
			mockRepository.getOrganizationUsage.mockResolvedValueOnce(overageUsage);
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);

			const result = await service.checkUsage("org-1", "user-1", "notices");

			expect(result.used).toBe(150);
			expect(result.included).toBe(50); // business plan limit
			expect(result.remaining).toBe(0);
			expect(result.overage).toBe(100); // 150 - 50 = 100
		});

		it("returns unlimited for pro plan alerts", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValueOnce(sampleOrgUsage);
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleProSubscription,
			);

			const result = await service.checkUsage("org-1", "user-1", "alerts");

			expect(result.included).toBe(-1);
			expect(result.remaining).toBe(-1);
			expect(result.overage).toBe(0);
		});

		it("returns not allowed when no limits", async () => {
			mockRepository.getOrganizationUsage.mockResolvedValueOnce(sampleOrgUsage);
			mockRepository.getUserSubscription.mockResolvedValueOnce(null);

			const result = await service.checkUsage("org-1", "user-1", "notices");

			expect(result.allowed).toBe(false);
		});
	});

	describe("reportUsage", () => {
		it("increments usage for metric", async () => {
			mockRepository.incrementUsage.mockResolvedValueOnce(undefined);

			await service.reportUsage("org-1", "notices", 5);

			expect(mockRepository.incrementUsage).toHaveBeenCalledWith(
				"org-1",
				"notices",
				5,
			);
		});
	});

	describe("updateUsersCount", () => {
		it("updates users count", async () => {
			mockRepository.updateUsersCount.mockResolvedValueOnce(undefined);

			await service.updateUsersCount("org-1", 10);

			expect(mockRepository.updateUsersCount).toHaveBeenCalledWith("org-1", 10);
		});
	});

	describe("resetUsageForPeriod", () => {
		it("resets usage for new period", async () => {
			mockRepository.resetUsage.mockResolvedValueOnce(undefined);

			const start = new Date("2024-02-01");
			const end = new Date("2024-03-01");
			await service.resetUsageForPeriod("org-1", start, end);

			expect(mockRepository.resetUsage).toHaveBeenCalledWith(
				"org-1",
				start,
				end,
			);
		});
	});

	// =========================================================================
	// METERED BILLING
	// =========================================================================

	describe("reportOverageToStripe", () => {
		it("does nothing when stripe not configured", async () => {
			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			await service.reportOverageToStripe("org-1", "user-1", "price_123");

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("Stripe client not configured"),
			);
			consoleSpy.mockRestore();
		});

		it("reports overage when stripe is configured", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			// Business plan has noticesPerMonth: 50, so 100 used = 50 overage
			const overageUsage = { ...sampleOrgUsage, noticesUsed: 100 };
			mockRepository.getOrganizationUsage.mockResolvedValueOnce(overageUsage);
			// getUserPlanLimits calls getUserSubscription
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);
			// reportOverageToStripe also calls getUserSubscription directly
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);
			mockRepository.markOverageReported.mockResolvedValueOnce(undefined);

			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			await serviceWithStripe.reportOverageToStripe(
				"org-1",
				"user-1",
				"price_123",
			);

			expect(mockRepository.markOverageReported).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});

		it("skips when no overage", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			// noticesUsed: 50 equals noticesPerMonth: 50 (business plan), so no overage
			mockRepository.getOrganizationUsage.mockResolvedValueOnce(sampleOrgUsage);
			// getUserPlanLimits calls getUserSubscription
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);
			// reportOverageToStripe also calls getUserSubscription directly
			mockRepository.getUserSubscription.mockResolvedValueOnce(
				sampleBusinessSubscription,
			);

			await serviceWithStripe.reportOverageToStripe(
				"org-1",
				"user-1",
				"price_123",
			);

			expect(mockRepository.markOverageReported).not.toHaveBeenCalled();
		});

		it("skips when missing data", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			mockRepository.getOrganizationUsage.mockResolvedValueOnce(null);

			await serviceWithStripe.reportOverageToStripe(
				"org-1",
				"user-1",
				"price_123",
			);

			expect(mockRepository.markOverageReported).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// CARD FINGERPRINT
	// =========================================================================

	describe("isCardUsedForTrial", () => {
		it("returns true when card used", async () => {
			mockRepository.isCardFingerprintUsed.mockResolvedValueOnce(true);

			const result = await service.isCardUsedForTrial("fp_123");

			expect(result).toBe(true);
		});

		it("returns false when card not used", async () => {
			mockRepository.isCardFingerprintUsed.mockResolvedValueOnce(false);

			const result = await service.isCardUsedForTrial("fp_123");

			expect(result).toBe(false);
		});
	});

	describe("storeCardFingerprint", () => {
		it("stores new fingerprint", async () => {
			mockRepository.isCardFingerprintUsed.mockResolvedValueOnce(false);
			mockRepository.storeCardFingerprint.mockResolvedValueOnce(undefined);

			await service.storeCardFingerprint("fp_new", "user-1");

			expect(mockRepository.storeCardFingerprint).toHaveBeenCalledWith(
				"fp_new",
				"user-1",
			);
		});

		it("increments existing fingerprint", async () => {
			mockRepository.isCardFingerprintUsed.mockResolvedValueOnce(true);
			mockRepository.incrementCardFingerprintUsage.mockResolvedValueOnce(
				undefined,
			);

			await service.storeCardFingerprint("fp_existing", "user-1");

			expect(mockRepository.incrementCardFingerprintUsage).toHaveBeenCalledWith(
				"fp_existing",
			);
		});
	});

	describe("handleCheckoutForTrialAbuse", () => {
		it("returns no skip when stripe not configured", async () => {
			const result = await service.handleCheckoutForTrialAbuse(
				"sub_123",
				"user-1",
			);

			expect(result.skipTrial).toBe(false);
		});

		it("handles stripe configured with new card", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
				default_payment_method: {
					type: "card",
					card: { fingerprint: "fp_new" },
				},
			});
			mockRepository.isCardFingerprintUsed.mockResolvedValueOnce(false);
			mockRepository.isCardFingerprintUsed.mockResolvedValueOnce(false);
			mockRepository.storeCardFingerprint.mockResolvedValueOnce(undefined);

			const result = await serviceWithStripe.handleCheckoutForTrialAbuse(
				"sub_123",
				"user-1",
			);

			expect(result.skipTrial).toBe(false);
		});

		it("skips trial when card was used before", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
				default_payment_method: {
					type: "card",
					card: { fingerprint: "fp_used" },
				},
			});
			mockRepository.isCardFingerprintUsed.mockResolvedValueOnce(true);
			mockStripe.subscriptions.update.mockResolvedValueOnce({});
			mockRepository.incrementCardFingerprintUsage.mockResolvedValueOnce(
				undefined,
			);

			const result = await serviceWithStripe.handleCheckoutForTrialAbuse(
				"sub_123",
				"user-1",
			);

			expect(result.skipTrial).toBe(true);
			expect(result.reason).toContain("used for a trial before");
			expect(mockStripe.subscriptions.update).toHaveBeenCalledWith("sub_123", {
				trial_end: "now",
			});
		});

		it("handles no payment method", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
				default_payment_method: null,
			});

			const result = await serviceWithStripe.handleCheckoutForTrialAbuse(
				"sub_123",
				"user-1",
			);

			expect(result.skipTrial).toBe(false);
		});

		it("handles string payment method", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
				default_payment_method: "pm_123", // string instead of object
			});

			const result = await serviceWithStripe.handleCheckoutForTrialAbuse(
				"sub_123",
				"user-1",
			);

			expect(result.skipTrial).toBe(false);
		});

		it("handles non-card payment method", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
				default_payment_method: {
					type: "bank_account",
				},
			});

			const result = await serviceWithStripe.handleCheckoutForTrialAbuse(
				"sub_123",
				"user-1",
			);

			expect(result.skipTrial).toBe(false);
		});

		it("handles missing fingerprint", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
				default_payment_method: {
					type: "card",
					card: { fingerprint: null },
				},
			});

			const result = await serviceWithStripe.handleCheckoutForTrialAbuse(
				"sub_123",
				"user-1",
			);

			expect(result.skipTrial).toBe(false);
		});

		it("handles stripe errors gracefully", async () => {
			const mockStripe = createMockStripe();
			const serviceWithStripe = new SubscriptionService(
				mockRepository as unknown as SubscriptionRepository,
				mockStripe as unknown as import("stripe").default,
			);

			mockStripe.subscriptions.retrieve.mockRejectedValueOnce(
				new Error("Stripe error"),
			);
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const result = await serviceWithStripe.handleCheckoutForTrialAbuse(
				"sub_123",
				"user-1",
			);

			expect(result.skipTrial).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});
});
