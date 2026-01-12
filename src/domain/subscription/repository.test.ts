import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubscriptionRepository } from "./repository";
import type { SubscriptionPlan, PlanTier } from "./types";

// Mock D1Database
function createMockDb() {
	const mockStatement = {
		bind: vi.fn().mockReturnThis(),
		first: vi.fn(),
		all: vi.fn(),
		run: vi.fn(),
	};

	return {
		prepare: vi.fn().mockReturnValue(mockStatement),
		_mockStatement: mockStatement,
	};
}

describe("SubscriptionRepository", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let repository: SubscriptionRepository;

	beforeEach(() => {
		mockDb = createMockDb();
		repository = new SubscriptionRepository(mockDb as unknown as D1Database);
	});

	const createMockPlanRecord = (overrides = {}) => ({
		id: "plan-123",
		name: "Business Plan",
		tier: "business",
		billing_interval: "month",
		stripe_price_id: "price_123",
		base_price: 999,
		notices_included: 50,
		users_included: 5,
		transactions_included: null,
		alerts_included: null,
		overage_price_id: "price_overage",
		overage_price: 15,
		features: '["data_capture", "compliance_validation"]',
		active: 1,
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-01T00:00:00.000Z",
		...overrides,
	});

	const createMockSubscriptionRecord = (overrides = {}) => ({
		id: "sub-123",
		organization_id: "org-456",
		stripe_customer_id: "cus_123",
		plan_id: "plan-123",
		stripe_subscription_id: "sub_stripe_123",
		stripe_subscription_item_id: "si_123",
		status: "active",
		current_period_start: "2024-01-01T00:00:00.000Z",
		current_period_end: "2024-02-01T00:00:00.000Z",
		cancel_at_period_end: 0,
		notices_used: 25,
		alerts_used: 10,
		transactions_used: 100,
		users_count: 3,
		license_id: null,
		billing_email: "billing@test.com",
		billing_name: "Test Company",
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-15T00:00:00.000Z",
		...overrides,
	});

	const createMockUsageRecord = (overrides = {}) => ({
		id: "usage-123",
		organization_id: "org-456",
		subscription_id: "sub-123",
		period_start: "2024-01-01T00:00:00.000Z",
		period_end: "2024-02-01T00:00:00.000Z",
		notices_created: 50,
		alerts_created: 10,
		transactions_created: 100,
		notices_overage: 5,
		overage_reported_at: "2024-01-15T00:00:00.000Z",
		stripe_usage_record_ids: '["ur_123", "ur_456"]',
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-15T00:00:00.000Z",
		...overrides,
	});

	describe("Subscription Plans", () => {
		describe("getActivePlans", () => {
			it("should return all active plans", async () => {
				const mockPlans = [
					createMockPlanRecord({ id: "plan-1", tier: "business" }),
					createMockPlanRecord({ id: "plan-2", tier: "pro", base_price: 1999 }),
				];
				mockDb._mockStatement.all.mockResolvedValue({ results: mockPlans });

				const result = await repository.getActivePlans();

				expect(result).toHaveLength(2);
				expect(result[0].tier).toBe("business");
				expect(result[1].tier).toBe("pro");
			});

			it("should return empty array when no plans", async () => {
				mockDb._mockStatement.all.mockResolvedValue({ results: [] });

				const result = await repository.getActivePlans();

				expect(result).toEqual([]);
			});
		});

		describe("getPlanById", () => {
			it("should return plan when found", async () => {
				const mockPlan = createMockPlanRecord();
				mockDb._mockStatement.first.mockResolvedValue(mockPlan);

				const result = await repository.getPlanById("plan-123");

				expect(result).not.toBeNull();
				expect(result?.id).toBe("plan-123");
				expect(result?.tier).toBe("business");
				expect(result?.features).toEqual([
					"data_capture",
					"compliance_validation",
				]);
			});

			it("should return null when not found", async () => {
				mockDb._mockStatement.first.mockResolvedValue(null);

				const result = await repository.getPlanById("non-existent");

				expect(result).toBeNull();
			});
		});

		describe("getPlanByStripePriceId", () => {
			it("should return plan by Stripe price ID", async () => {
				const mockPlan = createMockPlanRecord();
				mockDb._mockStatement.first.mockResolvedValue(mockPlan);

				const result = await repository.getPlanByStripePriceId("price_123");

				expect(result?.stripePriceId).toBe("price_123");
			});
		});

		describe("getPlanByTier", () => {
			it("should return plan by tier", async () => {
				const mockPlan = createMockPlanRecord();
				mockDb._mockStatement.first.mockResolvedValue(mockPlan);

				const result = await repository.getPlanByTier("business");

				expect(result?.tier).toBe("business");
			});

			it("should return null when tier not found", async () => {
				mockDb._mockStatement.first.mockResolvedValue(null);

				const result = await repository.getPlanByTier("enterprise");

				expect(result).toBeNull();
			});
		});

		describe("upsertPlan", () => {
			it("should upsert a plan", async () => {
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				const plan: Omit<SubscriptionPlan, "createdAt" | "updatedAt"> = {
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
					overagePriceId: null,
					overagePrice: null,
					features: ["data_capture"],
					active: true,
				};

				await repository.upsertPlan(plan);

				expect(mockDb._mockStatement.bind).toHaveBeenCalledWith(
					plan.id,
					plan.name,
					plan.tier,
					plan.billingInterval,
					plan.stripePriceId,
					plan.basePrice,
					plan.noticesIncluded,
					plan.usersIncluded,
					plan.transactionsIncluded,
					plan.alertsIncluded,
					plan.overagePriceId,
					plan.overagePrice,
					JSON.stringify(plan.features),
					1,
				);
			});
		});
	});

	describe("Organization Subscriptions", () => {
		describe("getByOrganizationId", () => {
			it("should return subscription with plan when found", async () => {
				const mockSubscription = createMockSubscriptionRecord();
				const mockPlan = createMockPlanRecord();

				// First call returns subscription
				mockDb._mockStatement.first
					.mockResolvedValueOnce(mockSubscription)
					.mockResolvedValueOnce(mockPlan);

				const result = await repository.getByOrganizationId("org-456");

				expect(result).not.toBeNull();
				expect(result?.organizationId).toBe("org-456");
				expect(result?.status).toBe("active");
				expect(result?.plan).toBeDefined();
				expect(result?.plan?.tier).toBe("business");
			});

			it("should return subscription without plan when planId is null", async () => {
				const mockSubscription = createMockSubscriptionRecord({
					plan_id: null,
				});
				mockDb._mockStatement.first.mockResolvedValue(mockSubscription);

				const result = await repository.getByOrganizationId("org-456");

				expect(result).not.toBeNull();
				expect(result?.planId).toBeNull();
				expect(result?.plan).toBeUndefined();
			});

			it("should return null when not found", async () => {
				mockDb._mockStatement.first.mockResolvedValue(null);

				const result = await repository.getByOrganizationId("non-existent");

				expect(result).toBeNull();
			});
		});

		describe("getByStripeSubscriptionId", () => {
			it("should return subscription by Stripe subscription ID", async () => {
				const mockSubscription = createMockSubscriptionRecord();
				const mockPlan = createMockPlanRecord();
				mockDb._mockStatement.first
					.mockResolvedValueOnce(mockSubscription)
					.mockResolvedValueOnce(mockPlan);

				const result =
					await repository.getByStripeSubscriptionId("sub_stripe_123");

				expect(result?.stripeSubscriptionId).toBe("sub_stripe_123");
			});
		});

		describe("getByStripeCustomerId", () => {
			it("should return subscription by Stripe customer ID", async () => {
				const mockSubscription = createMockSubscriptionRecord();
				const mockPlan = createMockPlanRecord();
				mockDb._mockStatement.first
					.mockResolvedValueOnce(mockSubscription)
					.mockResolvedValueOnce(mockPlan);

				const result = await repository.getByStripeCustomerId("cus_123");

				expect(result?.stripeCustomerId).toBe("cus_123");
			});
		});

		describe("updateSubscription", () => {
			it("should update subscription with all fields", async () => {
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				await repository.updateSubscription("org-456", {
					planId: "plan-new",
					stripeSubscriptionId: "sub_new",
					stripeSubscriptionItemId: "si_new",
					status: "active",
					currentPeriodStart: new Date("2024-02-01"),
					currentPeriodEnd: new Date("2024-03-01"),
					cancelAtPeriodEnd: false,
				});

				expect(mockDb._mockStatement.bind).toHaveBeenCalled();
				expect(mockDb._mockStatement.run).toHaveBeenCalled();
			});

			it("should handle null values", async () => {
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				await repository.updateSubscription("org-456", {
					planId: null,
					stripeSubscriptionId: null,
					currentPeriodStart: null,
					currentPeriodEnd: null,
				});

				expect(mockDb._mockStatement.run).toHaveBeenCalled();
			});
		});

		describe("updateUsage", () => {
			it("should update usage counters", async () => {
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				await repository.updateUsage("org-456", {
					noticesUsed: 30,
					alertsUsed: 15,
					transactionsUsed: 150,
					usersCount: 5,
				});

				expect(mockDb._mockStatement.run).toHaveBeenCalled();
			});
		});

		describe("incrementUsage", () => {
			it("should increment notices", async () => {
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				await repository.incrementUsage("org-456", "notices", 5);

				expect(mockDb._mockStatement.bind).toHaveBeenCalledWith(5, "org-456");
			});

			it("should increment alerts", async () => {
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				await repository.incrementUsage("org-456", "alerts", 3);

				expect(mockDb._mockStatement.bind).toHaveBeenCalledWith(3, "org-456");
			});

			it("should increment transactions", async () => {
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				await repository.incrementUsage("org-456", "transactions", 10);

				expect(mockDb._mockStatement.bind).toHaveBeenCalledWith(10, "org-456");
			});
		});

		describe("resetUsage", () => {
			it("should reset all usage counters", async () => {
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				await repository.resetUsage("org-456");

				expect(mockDb._mockStatement.bind).toHaveBeenCalledWith("org-456");
				expect(mockDb._mockStatement.run).toHaveBeenCalled();
			});
		});
	});

	describe("Usage Records", () => {
		describe("getOrCreateUsageRecord", () => {
			it("should return existing usage record", async () => {
				const mockUsage = createMockUsageRecord();
				mockDb._mockStatement.first.mockResolvedValue(mockUsage);

				const result = await repository.getOrCreateUsageRecord(
					"org-456",
					"sub-123",
					new Date("2024-01-01"),
					new Date("2024-02-01"),
				);

				expect(result.noticesCreated).toBe(50);
				expect(result.stripeUsageRecordIds).toEqual(["ur_123", "ur_456"]);
			});

			it("should create new usage record when not found", async () => {
				mockDb._mockStatement.first.mockResolvedValue(null);
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				const result = await repository.getOrCreateUsageRecord(
					"org-456",
					"sub-123",
					new Date("2024-01-01"),
					new Date("2024-02-01"),
				);

				expect(result.noticesCreated).toBe(0);
				expect(result.alertsCreated).toBe(0);
				expect(result.transactionsCreated).toBe(0);
				expect(mockDb._mockStatement.run).toHaveBeenCalled();
			});
		});

		describe("updateUsageRecord", () => {
			it("should update usage record", async () => {
				mockDb._mockStatement.run.mockResolvedValue({ success: true });

				await repository.updateUsageRecord("usage-123", {
					noticesCreated: 60,
					alertsCreated: 15,
					transactionsCreated: 120,
					noticesOverage: 10,
					overageReportedAt: new Date("2024-01-20"),
					stripeUsageRecordIds: ["ur_789"],
				});

				expect(mockDb._mockStatement.run).toHaveBeenCalled();
			});
		});
	});

	describe("Mappers", () => {
		it("should correctly map plan with all fields", async () => {
			const mockPlan = createMockPlanRecord({
				active: 0,
				billing_interval: "year",
			});
			mockDb._mockStatement.first.mockResolvedValue(mockPlan);

			const result = await repository.getPlanById("plan-123");

			expect(result?.active).toBe(false);
			expect(result?.billingInterval).toBe("year");
			expect(result?.createdAt).toBeInstanceOf(Date);
			expect(result?.updatedAt).toBeInstanceOf(Date);
		});

		it("should correctly map subscription with null dates", async () => {
			const mockSubscription = createMockSubscriptionRecord({
				current_period_start: null,
				current_period_end: null,
				plan_id: null,
				license_id: "lic-123",
			});
			mockDb._mockStatement.first.mockResolvedValue(mockSubscription);

			const result = await repository.getByOrganizationId("org-456");

			expect(result?.currentPeriodStart).toBeNull();
			expect(result?.currentPeriodEnd).toBeNull();
			expect(result?.licenseId).toBe("lic-123");
		});

		it("should correctly map cancel_at_period_end boolean", async () => {
			const mockSubscription = createMockSubscriptionRecord({
				cancel_at_period_end: 1,
				plan_id: null,
			});
			mockDb._mockStatement.first.mockResolvedValue(mockSubscription);

			const result = await repository.getByOrganizationId("org-456");

			expect(result?.cancelAtPeriodEnd).toBe(true);
		});

		it("should correctly map usage record with null fields", async () => {
			const mockUsage = createMockUsageRecord({
				overage_reported_at: null,
				stripe_usage_record_ids: null,
			});
			mockDb._mockStatement.first.mockResolvedValue(mockUsage);

			const result = await repository.getOrCreateUsageRecord(
				"org-456",
				"sub-123",
				new Date("2024-01-01"),
				new Date("2024-02-01"),
			);

			expect(result.overageReportedAt).toBeNull();
			expect(result.stripeUsageRecordIds).toBeNull();
		});
	});
});
