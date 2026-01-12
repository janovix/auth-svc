import { describe, it, expect, vi, beforeEach } from "vitest";
import { CustomerService } from "./service";
import type { OrganizationSubscriptionRecord } from "./types";

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

// Mock Stripe
function createMockStripe() {
	return {
		customers: {
			create: vi.fn(),
			retrieve: vi.fn(),
			update: vi.fn(),
		},
		billingPortal: {
			sessions: {
				create: vi.fn(),
			},
		},
	};
}

describe("CustomerService", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let mockStripe: ReturnType<typeof createMockStripe>;
	let service: CustomerService;

	beforeEach(() => {
		vi.clearAllMocks();

		mockDb = createMockDb();
		mockStripe = createMockStripe();

		service = new CustomerService(
			mockStripe as unknown as import("stripe").default,
			mockDb as unknown as D1Database,
		);
	});

	const createMockSubscriptionRecord = (
		overrides = {},
	): OrganizationSubscriptionRecord => ({
		id: "sub-123",
		organizationId: "org-456",
		stripeCustomerId: "cus_123",
		planId: null,
		stripeSubscriptionId: null,
		stripeSubscriptionItemId: null,
		status: "inactive",
		currentPeriodStart: null,
		currentPeriodEnd: null,
		cancelAtPeriodEnd: false,
		noticesUsed: 0,
		alertsUsed: 0,
		transactionsUsed: 0,
		usersCount: 0,
		licenseId: null,
		billingEmail: null,
		billingName: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	});

	describe("createCustomer", () => {
		it("should create a Stripe customer and database record", async () => {
			mockStripe.customers.create.mockResolvedValue({
				id: "cus_123",
				email: "test@example.com",
				name: "Test Company",
				metadata: {
					organizationId: "org-456",
					organizationName: "Test Company",
					organizationSlug: "test-company",
					planType: "none",
					isEnterprise: "false",
				},
				created: 1704067200,
				currency: "mxn",
				default_source: null,
				invoice_prefix: "ABC123",
			});
			mockDb._mockStatement.run.mockResolvedValue({ success: true });

			const result = await service.createCustomer({
				organizationId: "org-456",
				organizationName: "Test Company",
				organizationSlug: "test-company",
				email: "test@example.com",
				rfc: "RFC123456ABC",
			});

			expect(result.id).toBe("cus_123");
			expect(result.email).toBe("test@example.com");
			expect(result.metadata.organizationId).toBe("org-456");
			expect(mockStripe.customers.create).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "test@example.com",
					name: "Test Company",
					metadata: expect.objectContaining({
						organizationId: "org-456",
						organizationName: "Test Company",
						organizationSlug: "test-company",
						rfc: "RFC123456ABC",
						planType: "none",
						isEnterprise: "false",
					}),
				}),
			);
			expect(mockDb._mockStatement.run).toHaveBeenCalled();
		});

		it("should create customer without optional fields", async () => {
			mockStripe.customers.create.mockResolvedValue({
				id: "cus_123",
				email: null,
				name: "Test Company",
				metadata: {},
				created: 1704067200,
				currency: null,
				default_source: null,
				invoice_prefix: null,
			});
			mockDb._mockStatement.run.mockResolvedValue({ success: true });

			const result = await service.createCustomer({
				organizationId: "org-456",
				organizationName: "Test Company",
				organizationSlug: "test-company",
			});

			expect(result.id).toBe("cus_123");
			expect(result.email).toBeNull();
		});
	});

	describe("getCustomerByOrganizationId", () => {
		it("should return null when no subscription record", async () => {
			mockDb._mockStatement.first.mockResolvedValue(null);

			const result = await service.getCustomerByOrganizationId("org-456");

			expect(result).toBeNull();
		});

		it("should return null when Stripe customer not found", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);
			mockStripe.customers.retrieve.mockRejectedValue(
				new Error("Customer not found"),
			);

			const result = await service.getCustomerByOrganizationId("org-456");

			expect(result).toBeNull();
		});

		it("should return null when customer is deleted", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);
			mockStripe.customers.retrieve.mockResolvedValue({
				deleted: true,
			});

			const result = await service.getCustomerByOrganizationId("org-456");

			expect(result).toBeNull();
		});

		it("should return customer when found", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);
			mockStripe.customers.retrieve.mockResolvedValue({
				id: "cus_123",
				email: "test@example.com",
				name: "Test Company",
				metadata: {
					organizationId: "org-456",
				},
				created: 1704067200,
				currency: "mxn",
				default_source: "card_123",
				invoice_prefix: "ABC123",
			});

			const result = await service.getCustomerByOrganizationId("org-456");

			expect(result?.id).toBe("cus_123");
			expect(result?.defaultSource).toBe("card_123");
		});

		it("should handle default_source as object", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);
			mockStripe.customers.retrieve.mockResolvedValue({
				id: "cus_123",
				email: "test@example.com",
				name: "Test Company",
				metadata: {},
				created: 1704067200,
				currency: "mxn",
				default_source: { id: "card_123" },
				invoice_prefix: "ABC123",
			});

			const result = await service.getCustomerByOrganizationId("org-456");

			expect(result?.defaultSource).toBe("card_123");
		});
	});

	describe("getSubscriptionByOrganizationId", () => {
		it("should return subscription record when found", async () => {
			const mockRecord = createMockSubscriptionRecord();
			mockDb._mockStatement.first.mockResolvedValue({
				id: mockRecord.id,
				organizationId: mockRecord.organizationId,
				stripeCustomerId: mockRecord.stripeCustomerId,
				status: mockRecord.status,
			});

			const result = await service.getSubscriptionByOrganizationId("org-456");

			expect(result).toBeDefined();
		});

		it("should return null when not found", async () => {
			mockDb._mockStatement.first.mockResolvedValue(null);

			const result = await service.getSubscriptionByOrganizationId("org-456");

			expect(result).toBeNull();
		});
	});

	describe("getSubscriptionByStripeCustomerId", () => {
		it("should return subscription by Stripe customer ID", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);

			const result = await service.getSubscriptionByStripeCustomerId("cus_123");

			expect(result).toBeDefined();
		});
	});

	describe("updateCustomer", () => {
		it("should return null when subscription not found", async () => {
			mockDb._mockStatement.first.mockResolvedValue(null);

			const result = await service.updateCustomer("org-456", {
				email: "new@example.com",
			});

			expect(result).toBeNull();
		});

		it("should update customer email and name", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);
			mockDb._mockStatement.run.mockResolvedValue({ success: true });
			mockStripe.customers.update.mockResolvedValue({
				id: "cus_123",
				email: "new@example.com",
				name: "New Name",
				metadata: {},
				created: 1704067200,
				currency: "mxn",
				default_source: null,
				invoice_prefix: null,
			});

			const result = await service.updateCustomer("org-456", {
				email: "new@example.com",
				name: "New Name",
			});

			expect(result?.email).toBe("new@example.com");
			expect(mockDb._mockStatement.run).toHaveBeenCalled();
			expect(mockStripe.customers.update).toHaveBeenCalledWith(
				"cus_123",
				expect.objectContaining({
					email: "new@example.com",
					name: "New Name",
				}),
			);
		});

		it("should update organization metadata", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);
			mockStripe.customers.update.mockResolvedValue({
				id: "cus_123",
				email: null,
				name: "Updated Org",
				metadata: { organizationName: "Updated Org" },
				created: 1704067200,
				currency: null,
				default_source: null,
				invoice_prefix: null,
			});

			const result = await service.updateCustomer("org-456", {
				organizationName: "Updated Org",
				organizationSlug: "updated-org",
				rfc: "NEW123",
			});

			expect(result?.name).toBe("Updated Org");
			expect(mockStripe.customers.update).toHaveBeenCalledWith(
				"cus_123",
				expect.objectContaining({
					name: "Updated Org",
					metadata: expect.objectContaining({
						organizationName: "Updated Org",
						organizationSlug: "updated-org",
						rfc: "NEW123",
					}),
				}),
			);
		});

		it("should update plan type metadata", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);
			mockStripe.customers.update.mockResolvedValue({
				id: "cus_123",
				email: null,
				name: null,
				metadata: { planType: "enterprise", isEnterprise: "true" },
				created: 1704067200,
				currency: null,
				default_source: null,
				invoice_prefix: null,
			});

			await service.updateCustomer("org-456", {
				planType: "enterprise",
			});

			expect(mockStripe.customers.update).toHaveBeenCalledWith(
				"cus_123",
				expect.objectContaining({
					metadata: expect.objectContaining({
						planType: "enterprise",
						isEnterprise: "true",
					}),
				}),
			);
		});

		it("should set isEnterprise to false for non-enterprise plans", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);
			mockStripe.customers.update.mockResolvedValue({
				id: "cus_123",
				email: null,
				name: null,
				metadata: { planType: "business", isEnterprise: "false" },
				created: 1704067200,
				currency: null,
				default_source: null,
				invoice_prefix: null,
			});

			await service.updateCustomer("org-456", {
				planType: "business",
			});

			expect(mockStripe.customers.update).toHaveBeenCalledWith(
				"cus_123",
				expect.objectContaining({
					metadata: expect.objectContaining({
						planType: "business",
						isEnterprise: "false",
					}),
				}),
			);
		});
	});

	describe("createPortalSession", () => {
		it("should return null when subscription not found", async () => {
			mockDb._mockStatement.first.mockResolvedValue(null);

			const result = await service.createPortalSession(
				"org-456",
				"https://app.example.com/billing",
			);

			expect(result).toBeNull();
		});

		it("should create portal session", async () => {
			mockDb._mockStatement.first.mockResolvedValue(
				createMockSubscriptionRecord(),
			);
			mockStripe.billingPortal.sessions.create.mockResolvedValue({
				id: "bps_123",
				url: "https://billing.stripe.com/session/bps_123",
				created: 1704067200,
			});

			const result = await service.createPortalSession(
				"org-456",
				"https://app.example.com/billing",
			);

			expect(result?.id).toBe("bps_123");
			expect(result?.url).toBe("https://billing.stripe.com/session/bps_123");
			expect(result?.expiresAt).toBe(1704067200 + 300);
			expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
				customer: "cus_123",
				return_url: "https://app.example.com/billing",
			});
		});
	});

	describe("hasCustomer", () => {
		it("should return true when customer exists", async () => {
			mockDb._mockStatement.first.mockResolvedValue({ 1: 1 });

			const result = await service.hasCustomer("org-456");

			expect(result).toBe(true);
		});

		it("should return false when customer does not exist", async () => {
			mockDb._mockStatement.first.mockResolvedValue(null);

			const result = await service.hasCustomer("org-456");

			expect(result).toBe(false);
		});
	});

	describe("deleteCustomerRecord", () => {
		it("should delete customer record from database", async () => {
			mockDb._mockStatement.run.mockResolvedValue({ success: true });

			await service.deleteCustomerRecord("org-456");

			expect(mockDb._mockStatement.bind).toHaveBeenCalledWith("org-456");
			expect(mockDb._mockStatement.run).toHaveBeenCalled();
		});
	});
});
