import { describe, it, expect, vi, beforeEach } from "vitest";
import { LicenseRepository } from "./repository";
import type { EnterpriseLicense } from "./types";

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

describe("LicenseRepository", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let repository: LicenseRepository;

	beforeEach(() => {
		mockDb = createMockDb();
		repository = new LicenseRepository(mockDb as unknown as D1Database);
	});

	const createMockLicenseRecord = (overrides = {}) => ({
		id: "license-123",
		organization_id: "org-456",
		license_key: "jwt-license-key",
		notices_per_month: 1000,
		max_users: 50,
		max_transactions: 5000,
		max_alerts: 100,
		features: '["data_capture", "sso"]',
		stripe_subscription_id: "sub_123",
		stripe_invoice_id: "inv_456",
		issued_at: "2024-01-01T00:00:00.000Z",
		activated_at: "2024-01-15T00:00:00.000Z",
		expires_at: "2025-01-01T00:00:00.000Z",
		revoked_at: null,
		issued_by: "admin-user",
		customer_name: "Test Company",
		notes: "Test notes",
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-15T00:00:00.000Z",
		...overrides,
	});

	describe("create", () => {
		it("should create a new enterprise license", async () => {
			mockDb._mockStatement.run.mockResolvedValue({ success: true });

			const license: Omit<EnterpriseLicense, "createdAt" | "updatedAt"> = {
				id: "license-123",
				organizationId: null,
				licenseKey: "jwt-license-key",
				noticesPerMonth: 1000,
				maxUsers: 50,
				maxTransactions: 5000,
				maxAlerts: 100,
				features: ["data_capture", "sso"],
				stripeSubscriptionId: "sub_123",
				stripeInvoiceId: "inv_456",
				issuedAt: new Date("2024-01-01"),
				activatedAt: null,
				expiresAt: new Date("2025-01-01"),
				revokedAt: null,
				issuedBy: "admin-user",
				customerName: "Test Company",
				notes: "Test notes",
			};

			await repository.create(license);

			expect(mockDb.prepare).toHaveBeenCalled();
			expect(mockDb._mockStatement.bind).toHaveBeenCalledWith(
				license.id,
				license.organizationId,
				license.licenseKey,
				license.noticesPerMonth,
				license.maxUsers,
				license.maxTransactions,
				license.maxAlerts,
				JSON.stringify(license.features),
				license.stripeSubscriptionId,
				license.stripeInvoiceId,
				license.issuedAt.toISOString(),
				null,
				license.expiresAt.toISOString(),
				null,
				license.issuedBy,
				license.customerName,
				license.notes,
			);
			expect(mockDb._mockStatement.run).toHaveBeenCalled();
		});
	});

	describe("getById", () => {
		it("should return a license when found", async () => {
			const mockRecord = createMockLicenseRecord();
			mockDb._mockStatement.first.mockResolvedValue(mockRecord);

			const result = await repository.getById("license-123");

			expect(result).not.toBeNull();
			expect(result?.id).toBe("license-123");
			expect(result?.organizationId).toBe("org-456");
			expect(result?.features).toEqual(["data_capture", "sso"]);
			expect(result?.issuedAt).toBeInstanceOf(Date);
			expect(result?.activatedAt).toBeInstanceOf(Date);
			expect(result?.expiresAt).toBeInstanceOf(Date);
		});

		it("should return null when not found", async () => {
			mockDb._mockStatement.first.mockResolvedValue(null);

			const result = await repository.getById("non-existent");

			expect(result).toBeNull();
		});
	});

	describe("getByLicenseKey", () => {
		it("should return a license by license key", async () => {
			const mockRecord = createMockLicenseRecord();
			mockDb._mockStatement.first.mockResolvedValue(mockRecord);

			const result = await repository.getByLicenseKey("jwt-license-key");

			expect(result).not.toBeNull();
			expect(result?.licenseKey).toBe("jwt-license-key");
		});

		it("should return null when not found", async () => {
			mockDb._mockStatement.first.mockResolvedValue(null);

			const result = await repository.getByLicenseKey("non-existent");

			expect(result).toBeNull();
		});
	});

	describe("getByOrganizationId", () => {
		it("should return a license by organization ID", async () => {
			const mockRecord = createMockLicenseRecord();
			mockDb._mockStatement.first.mockResolvedValue(mockRecord);

			const result = await repository.getByOrganizationId("org-456");

			expect(result).not.toBeNull();
			expect(result?.organizationId).toBe("org-456");
		});

		it("should return null when not found", async () => {
			mockDb._mockStatement.first.mockResolvedValue(null);

			const result = await repository.getByOrganizationId("non-existent");

			expect(result).toBeNull();
		});
	});

	describe("getByStripeSubscriptionId", () => {
		it("should return a license by Stripe subscription ID", async () => {
			const mockRecord = createMockLicenseRecord();
			mockDb._mockStatement.first.mockResolvedValue(mockRecord);

			const result = await repository.getByStripeSubscriptionId("sub_123");

			expect(result).not.toBeNull();
			expect(result?.stripeSubscriptionId).toBe("sub_123");
		});

		it("should return null when not found", async () => {
			mockDb._mockStatement.first.mockResolvedValue(null);

			const result = await repository.getByStripeSubscriptionId("non-existent");

			expect(result).toBeNull();
		});
	});

	describe("getAll", () => {
		it("should return all licenses", async () => {
			const mockRecords = [
				createMockLicenseRecord({ id: "license-1" }),
				createMockLicenseRecord({ id: "license-2" }),
			];
			mockDb._mockStatement.all.mockResolvedValue({ results: mockRecords });

			const result = await repository.getAll();

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe("license-1");
			expect(result[1].id).toBe("license-2");
		});

		it("should return empty array when no licenses", async () => {
			mockDb._mockStatement.all.mockResolvedValue({ results: [] });

			const result = await repository.getAll();

			expect(result).toEqual([]);
		});
	});

	describe("getActiveLicenses", () => {
		it("should return only active licenses", async () => {
			const mockRecords = [createMockLicenseRecord({ revoked_at: null })];
			mockDb._mockStatement.all.mockResolvedValue({ results: mockRecords });

			const result = await repository.getActiveLicenses();

			expect(result).toHaveLength(1);
			expect(result[0].revokedAt).toBeNull();
		});
	});

	describe("activate", () => {
		it("should activate a license for an organization", async () => {
			mockDb._mockStatement.run.mockResolvedValue({ success: true });

			await repository.activate("license-123", "org-456");

			expect(mockDb._mockStatement.bind).toHaveBeenCalledWith(
				"org-456",
				"license-123",
			);
			expect(mockDb._mockStatement.run).toHaveBeenCalled();
		});
	});

	describe("revoke", () => {
		it("should revoke a license", async () => {
			mockDb._mockStatement.run.mockResolvedValue({ success: true });

			await repository.revoke("license-123");

			expect(mockDb._mockStatement.bind).toHaveBeenCalledWith("license-123");
			expect(mockDb._mockStatement.run).toHaveBeenCalled();
		});
	});

	describe("updateStripeReferences", () => {
		it("should update Stripe references", async () => {
			mockDb._mockStatement.run.mockResolvedValue({ success: true });

			await repository.updateStripeReferences(
				"license-123",
				"sub_new",
				"inv_new",
			);

			expect(mockDb._mockStatement.bind).toHaveBeenCalledWith(
				"sub_new",
				"inv_new",
				"license-123",
			);
		});

		it("should handle missing invoice ID", async () => {
			mockDb._mockStatement.run.mockResolvedValue({ success: true });

			await repository.updateStripeReferences("license-123", "sub_new");

			expect(mockDb._mockStatement.bind).toHaveBeenCalledWith(
				"sub_new",
				null,
				"license-123",
			);
		});
	});

	describe("extendExpiration", () => {
		it("should extend license expiration", async () => {
			mockDb._mockStatement.run.mockResolvedValue({ success: true });
			const newExpiry = new Date("2026-01-01");

			await repository.extendExpiration("license-123", newExpiry);

			expect(mockDb._mockStatement.bind).toHaveBeenCalledWith(
				newExpiry.toISOString(),
				"license-123",
			);
		});
	});

	describe("deactivate", () => {
		it("should deactivate a license", async () => {
			mockDb._mockStatement.run.mockResolvedValue({ success: true });

			await repository.deactivate("license-123");

			expect(mockDb._mockStatement.bind).toHaveBeenCalledWith("license-123");
			expect(mockDb._mockStatement.run).toHaveBeenCalled();
		});
	});

	describe("mapLicense", () => {
		it("should correctly map null fields", async () => {
			const mockRecord = createMockLicenseRecord({
				organization_id: null,
				activated_at: null,
				revoked_at: null,
				max_transactions: null,
				max_alerts: null,
				stripe_subscription_id: null,
				stripe_invoice_id: null,
				customer_name: null,
				notes: null,
			});
			mockDb._mockStatement.first.mockResolvedValue(mockRecord);

			const result = await repository.getById("license-123");

			expect(result?.organizationId).toBeNull();
			expect(result?.activatedAt).toBeNull();
			expect(result?.revokedAt).toBeNull();
			expect(result?.maxTransactions).toBeNull();
			expect(result?.maxAlerts).toBeNull();
			expect(result?.stripeSubscriptionId).toBeNull();
			expect(result?.stripeInvoiceId).toBeNull();
			expect(result?.customerName).toBeNull();
			expect(result?.notes).toBeNull();
		});
	});
});
