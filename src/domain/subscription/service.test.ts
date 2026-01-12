import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubscriptionService } from "./service";
import { SubscriptionRepository } from "./repository";
import type {
	SubscriptionPlan,
	OrganizationSubscription,
	PlanTier,
	Feature,
} from "./types";

// Mock Stripe
function createMockStripe() {
	return {
		checkout: {
			sessions: {
				create: vi.fn(),
			},
		},
		subscriptions: {
			retrieve: vi.fn(),
			update: vi.fn(),
		},
		invoices: {
			list: vi.fn(),
		},
	};
}

describe("SubscriptionService", () => {
	let mockRepository: {
		getActivePlans: ReturnType<typeof vi.fn>;
		getPlanById: ReturnType<typeof vi.fn>;
		getPlanByStripePriceId: ReturnType<typeof vi.fn>;
		getPlanByTier: ReturnType<typeof vi.fn>;
		getByOrganizationId: ReturnType<typeof vi.fn>;
		getByStripeSubscriptionId: ReturnType<typeof vi.fn>;
		getByStripeCustomerId: ReturnType<typeof vi.fn>;
		updateSubscription: ReturnType<typeof vi.fn>;
		resetUsage: ReturnType<typeof vi.fn>;
	};
	let mockStripe: ReturnType<typeof createMockStripe>;
	let service: SubscriptionService;

	beforeEach(() => {
		vi.clearAllMocks();

		mockRepository = {
			getActivePlans: vi.fn(),
			getPlanById: vi.fn(),
			getPlanByStripePriceId: vi.fn(),
			getPlanByTier: vi.fn(),
			getByOrganizationId: vi.fn(),
			getByStripeSubscriptionId: vi.fn(),
			getByStripeCustomerId: vi.fn(),
			updateSubscription: vi.fn(),
			resetUsage: vi.fn(),
		};

		mockStripe = createMockStripe();

		service = new SubscriptionService(
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
		features: ["data_capture", "compliance_validation"] as Feature[],
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

	describe("getAvailablePlans", () => {
		it("should return plan comparisons excluding enterprise", async () => {
			const mockPlans = [
				createMockPlan({ id: "plan-1", tier: "business" as PlanTier }),
				createMockPlan({
					id: "plan-2",
					tier: "pro" as PlanTier,
					basePrice: 1999,
				}),
				createMockPlan({ id: "plan-3", tier: "enterprise" as PlanTier }),
			];
			mockRepository.getActivePlans.mockResolvedValue(mockPlans);

			const result = await service.getAvailablePlans();

			expect(result).toHaveLength(2);
			expect(result.find((p) => p.tier === "enterprise")).toBeUndefined();
		});

		it("should mark pro plan as recommended", async () => {
			const mockPlans = [
				createMockPlan({ tier: "business" as PlanTier }),
				createMockPlan({ tier: "pro" as PlanTier }),
			];
			mockRepository.getActivePlans.mockResolvedValue(mockPlans);

			const result = await service.getAvailablePlans();

			expect(result.find((p) => p.tier === "pro")?.recommended).toBe(true);
			expect(
				result.find((p) => p.tier === "business")?.recommended,
			).toBeFalsy();
		});
	});

	describe("getPlan", () => {
		it("should return plan by ID", async () => {
			const mockPlan = createMockPlan();
			mockRepository.getPlanById.mockResolvedValue(mockPlan);

			const result = await service.getPlan("plan-123");

			expect(result).toBe(mockPlan);
		});
	});

	describe("getSubscriptionStatus", () => {
		it("should return null when no subscription found", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			const result = await service.getSubscriptionStatus("org-456");

			expect(result).toBeNull();
		});

		it("should return full status for active subscription", async () => {
			const mockPlan = createMockPlan();
			const mockSubscription = createMockSubscription({ plan: mockPlan });
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.getSubscriptionStatus("org-456");

			expect(result).not.toBeNull();
			expect(result?.hasSubscription).toBe(true);
			expect(result?.isEnterprise).toBe(false);
			expect(result?.status).toBe("active");
			expect(result?.planTier).toBe("business");
			expect(result?.planName).toBe("Business");
			expect(result?.features).toContain("data_capture");
		});

		it("should return enterprise status when license exists", async () => {
			const mockSubscription = createMockSubscription({
				licenseId: "lic-123",
				plan: null,
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.getSubscriptionStatus("org-456");

			expect(result?.isEnterprise).toBe(true);
			expect(result?.planTier).toBe("enterprise");
			expect(result?.planName).toBe("Enterprise");
		});

		it("should return none tier when no plan and no license", async () => {
			const mockSubscription = createMockSubscription({
				planId: null,
				plan: null,
				licenseId: null,
				status: "inactive",
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.getSubscriptionStatus("org-456");

			expect(result?.planTier).toBe("none");
			expect(result?.hasSubscription).toBe(false);
		});

		it("should calculate usage correctly", async () => {
			const mockPlan = createMockPlan({
				noticesIncluded: 100,
				usersIncluded: 10,
			});
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 120,
				usersCount: 5,
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.getSubscriptionStatus("org-456");

			expect(result?.usage.notices.used).toBe(120);
			expect(result?.usage.notices.included).toBe(100);
			expect(result?.usage.notices.overage).toBe(20);
			expect(result?.usage.users.used).toBe(5);
			expect(result?.usage.users.remaining).toBe(5);
		});
	});

	describe("createCheckoutSession", () => {
		it("should throw when subscription not found", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			await expect(
				service.createCheckoutSession(
					"org-456",
					"plan-123",
					"/success",
					"/cancel",
				),
			).rejects.toThrow("Organization subscription record not found");
		});

		it("should throw when plan not found", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(
				createMockSubscription(),
			);
			mockRepository.getPlanById.mockResolvedValue(null);

			await expect(
				service.createCheckoutSession(
					"org-456",
					"plan-123",
					"/success",
					"/cancel",
				),
			).rejects.toThrow("Plan not found");
		});

		it("should create checkout session with base price", async () => {
			const mockSubscription = createMockSubscription();
			const mockPlan = createMockPlan({ overagePriceId: null });
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);
			mockRepository.getPlanById.mockResolvedValue(mockPlan);
			mockStripe.checkout.sessions.create.mockResolvedValue({
				id: "cs_123",
				url: "https://checkout.stripe.com/cs_123",
			});

			const result = await service.createCheckoutSession(
				"org-456",
				"plan-123",
				"/success",
				"/cancel",
			);

			expect(result.sessionId).toBe("cs_123");
			expect(result.url).toBe("https://checkout.stripe.com/cs_123");
			expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
				expect.objectContaining({
					customer: "cus_123",
					mode: "subscription",
					line_items: [{ price: "price_123", quantity: 1 }],
				}),
			);
		});

		it("should include overage price when available", async () => {
			const mockSubscription = createMockSubscription();
			const mockPlan = createMockPlan({ overagePriceId: "price_overage" });
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);
			mockRepository.getPlanById.mockResolvedValue(mockPlan);
			mockStripe.checkout.sessions.create.mockResolvedValue({
				id: "cs_123",
				url: "https://checkout.stripe.com/cs_123",
			});

			await service.createCheckoutSession(
				"org-456",
				"plan-123",
				"/success",
				"/cancel",
			);

			expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
				expect.objectContaining({
					line_items: expect.arrayContaining([
						{ price: "price_123", quantity: 1 },
						{ price: "price_overage" },
					]),
				}),
			);
		});
	});

	describe("changePlan", () => {
		it("should throw when no active subscription", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			await expect(service.changePlan("org-456", "plan-new")).rejects.toThrow(
				"No active subscription found",
			);
		});

		it("should throw when new plan not found", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(
				createMockSubscription(),
			);
			mockRepository.getPlanById.mockResolvedValue(null);

			await expect(service.changePlan("org-456", "plan-new")).rejects.toThrow(
				"Plan not found",
			);
		});

		it("should throw when no main subscription item found", async () => {
			const mockSubscription = createMockSubscription();
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);
			mockRepository.getPlanById.mockResolvedValue(createMockPlan());
			mockStripe.subscriptions.retrieve.mockResolvedValue({
				items: { data: [] },
			});

			await expect(service.changePlan("org-456", "plan-new")).rejects.toThrow(
				"No main subscription item found",
			);
		});

		it("should update subscription with new plan", async () => {
			const mockSubscription = createMockSubscription();
			const mockPlan = createMockPlan({
				id: "plan-new",
				stripePriceId: "price_new",
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);
			mockRepository.getPlanById.mockResolvedValue(mockPlan);
			mockStripe.subscriptions.retrieve.mockResolvedValue({
				items: {
					data: [
						{ id: "si_main", price: { recurring: { usage_type: "licensed" } } },
					],
				},
			});
			mockStripe.subscriptions.update.mockResolvedValue({});

			await service.changePlan("org-456", "plan-new");

			expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
				"sub_stripe_123",
				expect.objectContaining({
					items: [{ id: "si_main", price: "price_new" }],
					proration_behavior: "create_prorations",
				}),
			);
		});
	});

	describe("cancelSubscription", () => {
		it("should throw when no active subscription", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			await expect(service.cancelSubscription("org-456")).rejects.toThrow(
				"No active subscription found",
			);
		});

		it("should cancel at period end", async () => {
			const mockSubscription = createMockSubscription();
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);
			mockStripe.subscriptions.update.mockResolvedValue({});
			mockRepository.updateSubscription.mockResolvedValue(undefined);

			await service.cancelSubscription("org-456");

			expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
				"sub_stripe_123",
				{ cancel_at_period_end: true },
			);
			expect(mockRepository.updateSubscription).toHaveBeenCalledWith(
				"org-456",
				{
					cancelAtPeriodEnd: true,
				},
			);
		});
	});

	describe("reactivateSubscription", () => {
		it("should throw when no subscription", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			await expect(service.reactivateSubscription("org-456")).rejects.toThrow(
				"No subscription found",
			);
		});

		it("should reactivate subscription", async () => {
			const mockSubscription = createMockSubscription({
				cancelAtPeriodEnd: true,
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);
			mockStripe.subscriptions.update.mockResolvedValue({});
			mockRepository.updateSubscription.mockResolvedValue(undefined);

			await service.reactivateSubscription("org-456");

			expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
				"sub_stripe_123",
				{ cancel_at_period_end: false },
			);
			expect(mockRepository.updateSubscription).toHaveBeenCalledWith(
				"org-456",
				{
					cancelAtPeriodEnd: false,
				},
			);
		});
	});

	describe("getInvoices", () => {
		it("should return empty array when no subscription", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			const result = await service.getInvoices("org-456");

			expect(result).toEqual([]);
		});

		it("should return invoices from Stripe", async () => {
			const mockSubscription = createMockSubscription();
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);
			mockStripe.invoices.list.mockResolvedValue({
				data: [
					{
						id: "inv_123",
						number: "INV-001",
						status: "paid",
						amount_due: 1000,
						amount_paid: 1000,
						currency: "mxn",
						period_start: 1704067200,
						period_end: 1706745600,
						created: 1704067200,
						hosted_invoice_url: "https://invoice.stripe.com/inv_123",
						invoice_pdf: "https://invoice.stripe.com/inv_123/pdf",
					},
				],
			});

			const result = await service.getInvoices("org-456", 5);

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("inv_123");
			expect(result[0].status).toBe("paid");
			expect(mockStripe.invoices.list).toHaveBeenCalledWith({
				customer: "cus_123",
				limit: 5,
			});
		});
	});

	describe("checkUsage", () => {
		it("should return not allowed when no subscription", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			const result = await service.checkUsage("org-456", "notices");

			expect(result.allowed).toBe(false);
			expect(result.planTier).toBe("none");
		});

		it("should check notices usage", async () => {
			const mockPlan = createMockPlan({ noticesIncluded: 100 });
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				noticesUsed: 75,
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.checkUsage("org-456", "notices");

			expect(result.allowed).toBe(true);
			expect(result.used).toBe(75);
			expect(result.included).toBe(100);
			expect(result.remaining).toBe(25);
			expect(result.overage).toBe(0);
		});

		it("should check users usage", async () => {
			const mockPlan = createMockPlan({ usersIncluded: 10 });
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				usersCount: 8,
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.checkUsage("org-456", "users");

			expect(result.used).toBe(8);
			expect(result.included).toBe(10);
		});

		it("should check alerts usage with unlimited", async () => {
			const mockPlan = createMockPlan({ alertsIncluded: null });
			const mockSubscription = createMockSubscription({
				plan: mockPlan,
				alertsUsed: 1000,
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.checkUsage("org-456", "alerts");

			expect(result.allowed).toBe(true);
			expect(result.included).toBe(-1); // unlimited
			expect(result.remaining).toBe(-1);
		});
	});

	describe("checkFeature", () => {
		it("should return not allowed when no subscription", async () => {
			mockRepository.getByOrganizationId.mockResolvedValue(null);

			const result = await service.checkFeature("org-456", "data_capture");

			expect(result.allowed).toBe(false);
			expect(result.planTier).toBe("none");
		});

		it("should return allowed for included feature", async () => {
			const mockPlan = createMockPlan({ tier: "business" as PlanTier });
			const mockSubscription = createMockSubscription({ plan: mockPlan });
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.checkFeature("org-456", "data_capture");

			expect(result.allowed).toBe(true);
			expect(result.planTier).toBe("business");
		});

		it("should return required tier for missing feature", async () => {
			const mockPlan = createMockPlan({ tier: "business" as PlanTier });
			const mockSubscription = createMockSubscription({ plan: mockPlan });
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.checkFeature("org-456", "sso");

			expect(result.allowed).toBe(false);
			expect(result.requiredTier).toBe("enterprise");
		});

		it("should allow all features for enterprise", async () => {
			const mockSubscription = createMockSubscription({
				licenseId: "lic-123",
				plan: null,
			});
			mockRepository.getByOrganizationId.mockResolvedValue(mockSubscription);

			const result = await service.checkFeature("org-456", "sso");

			expect(result.allowed).toBe(true);
			expect(result.planTier).toBe("enterprise");
		});
	});

	describe("handleSubscriptionUpdated", () => {
		it("should do nothing when subscription not found", async () => {
			mockRepository.getByStripeCustomerId.mockResolvedValue(null);

			await service.handleSubscriptionUpdated({
				id: "sub_123",
				customer: "cus_unknown",
				items: { data: [] },
			} as unknown as import("stripe").Stripe.Subscription);

			expect(mockRepository.updateSubscription).not.toHaveBeenCalled();
		});

		it("should update subscription from Stripe webhook", async () => {
			const mockSubscription = createMockSubscription();
			mockRepository.getByStripeCustomerId.mockResolvedValue(mockSubscription);
			mockRepository.getPlanByStripePriceId.mockResolvedValue(createMockPlan());
			mockRepository.updateSubscription.mockResolvedValue(undefined);

			await service.handleSubscriptionUpdated({
				id: "sub_stripe_123",
				customer: "cus_123",
				status: "active",
				cancel_at_period_end: false,
				current_period_start: 1704067200,
				current_period_end: 1706745600,
				items: {
					data: [
						{
							id: "si_main",
							price: { id: "price_123", recurring: { usage_type: "licensed" } },
						},
						{
							id: "si_metered",
							price: {
								id: "price_metered",
								recurring: { usage_type: "metered" },
							},
						},
					],
				},
			} as unknown as import("stripe").Stripe.Subscription);

			expect(mockRepository.updateSubscription).toHaveBeenCalledWith(
				"org-456",
				expect.objectContaining({
					stripeSubscriptionId: "sub_stripe_123",
					stripeSubscriptionItemId: "si_metered",
					status: "active",
				}),
			);
		});
	});

	describe("handleSubscriptionDeleted", () => {
		it("should do nothing when subscription not found", async () => {
			mockRepository.getByStripeSubscriptionId.mockResolvedValue(null);

			await service.handleSubscriptionDeleted({
				id: "sub_unknown",
			} as import("stripe").Stripe.Subscription);

			expect(mockRepository.updateSubscription).not.toHaveBeenCalled();
		});

		it("should update subscription to canceled", async () => {
			mockRepository.getByStripeSubscriptionId.mockResolvedValue(
				createMockSubscription(),
			);
			mockRepository.updateSubscription.mockResolvedValue(undefined);

			await service.handleSubscriptionDeleted({
				id: "sub_stripe_123",
			} as import("stripe").Stripe.Subscription);

			expect(mockRepository.updateSubscription).toHaveBeenCalledWith(
				"org-456",
				{
					status: "canceled",
					stripeSubscriptionId: null,
					stripeSubscriptionItemId: null,
					planId: null,
				},
			);
		});
	});

	describe("handleInvoicePaid", () => {
		it("should do nothing when no subscription", async () => {
			await service.handleInvoicePaid({} as import("stripe").Stripe.Invoice);

			expect(mockRepository.resetUsage).not.toHaveBeenCalled();
		});

		it("should reset usage for new billing period", async () => {
			mockRepository.getByStripeSubscriptionId.mockResolvedValue(
				createMockSubscription(),
			);
			mockRepository.resetUsage.mockResolvedValue(undefined);

			await service.handleInvoicePaid({
				subscription: "sub_stripe_123",
			} as unknown as import("stripe").Stripe.Invoice);

			expect(mockRepository.resetUsage).toHaveBeenCalledWith("org-456");
		});
	});
});
