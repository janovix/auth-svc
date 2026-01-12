/**
 * License Service
 *
 * Business logic for enterprise license management
 */

import type Stripe from "stripe";
import { LicenseRepository } from "./repository";
import {
	signLicense,
	verifyLicense,
	createLicensePayload,
	decodeLicensePayload,
} from "./jwt-utils";
import type {
	EnterpriseLicense,
	GenerateLicenseInput,
	LicenseStatus,
	LicenseVerificationResult,
} from "./types";

export class LicenseService {
	constructor(
		private readonly repository: LicenseRepository,
		private readonly stripe: Stripe,
		private readonly privateKey: string,
		private readonly publicKey: string,
	) {}

	// =========================================================================
	// LICENSE GENERATION
	// =========================================================================

	/**
	 * Generate a new enterprise license
	 * Optionally creates a Stripe yearly subscription
	 */
	async generateLicense(
		input: GenerateLicenseInput,
		issuedBy: string,
	): Promise<EnterpriseLicense> {
		const licenseId = crypto.randomUUID();
		const issuedAt = new Date();
		const expiresAt = new Date(issuedAt);
		expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year validity

		let stripeSubscriptionId: string | undefined;
		let stripeInvoiceId: string | undefined;

		// Create Stripe yearly subscription if requested
		if (input.stripeCustomerId && input.stripeYearlyPrice) {
			const subscription = await this.createStripeYearlySubscription(
				input.stripeCustomerId,
				input.stripeYearlyPrice,
				input.customerName,
				licenseId,
			);
			stripeSubscriptionId = subscription.subscriptionId;
			stripeInvoiceId = subscription.invoiceId;
		}

		// Create the JWT payload
		const payload = createLicensePayload(
			licenseId,
			input.customerName,
			input.limits,
			input.features,
			expiresAt,
			input.stripeCustomerId,
			stripeSubscriptionId,
		);

		// Sign the license
		const licenseKey = await signLicense(payload, this.privateKey);

		// Create the license record
		const license: Omit<EnterpriseLicense, "createdAt" | "updatedAt"> = {
			id: licenseId,
			organizationId: null, // Not activated yet
			licenseKey,
			noticesPerMonth: input.limits.noticesPerMonth,
			maxUsers: input.limits.maxUsers,
			maxTransactions: input.limits.maxTransactions ?? null,
			maxAlerts: input.limits.maxAlerts ?? null,
			features: input.features,
			stripeSubscriptionId: stripeSubscriptionId ?? null,
			stripeInvoiceId: stripeInvoiceId ?? null,
			issuedAt,
			activatedAt: null,
			expiresAt,
			revokedAt: null,
			issuedBy,
			customerName: input.customerName,
			notes: input.notes ?? null,
		};

		await this.repository.create(license);

		return {
			...license,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	/**
	 * Create a Stripe yearly subscription for enterprise license
	 */
	private async createStripeYearlySubscription(
		customerId: string,
		yearlyPriceCentavos: number,
		customerName: string,
		licenseId: string,
	): Promise<{ subscriptionId: string; invoiceId?: string }> {
		// Create a one-time price for the yearly subscription
		const price = await this.stripe.prices.create({
			unit_amount: yearlyPriceCentavos,
			currency: "mxn",
			recurring: { interval: "year" },
			product_data: {
				name: `Janovix Enterprise - ${customerName}`,
				metadata: {
					licenseId,
					tier: "enterprise",
				},
			},
		});

		// Create the subscription
		const subscription = await this.stripe.subscriptions.create({
			customer: customerId,
			items: [{ price: price.id }],
			metadata: {
				licenseId,
				customerName,
				type: "enterprise_license",
			},
		});

		// Get the latest invoice
		const invoiceId = subscription.latest_invoice
			? typeof subscription.latest_invoice === "string"
				? subscription.latest_invoice
				: subscription.latest_invoice.id
			: undefined;

		return {
			subscriptionId: subscription.id,
			invoiceId,
		};
	}

	// =========================================================================
	// LICENSE ACTIVATION
	// =========================================================================

	/**
	 * Activate a license for an organization
	 */
	async activateLicense(
		licenseKey: string,
		organizationId: string,
	): Promise<EnterpriseLicense> {
		// First verify the license
		const verification = await this.verifyLicenseKey(licenseKey);

		if (!verification.valid) {
			throw new Error(verification.error || "Invalid license");
		}

		// Get the license from database
		const license = await this.repository.getByLicenseKey(licenseKey);

		if (!license) {
			throw new Error("License not found");
		}

		if (license.organizationId) {
			if (license.organizationId === organizationId) {
				throw new Error("License is already activated for this organization");
			}
			throw new Error("License is already activated for another organization");
		}

		if (license.revokedAt) {
			throw new Error("License has been revoked");
		}

		if (license.expiresAt < new Date()) {
			throw new Error("License has expired");
		}

		// Activate the license
		await this.repository.activate(license.id, organizationId);

		return {
			...license,
			organizationId,
			activatedAt: new Date(),
			updatedAt: new Date(),
		};
	}

	// =========================================================================
	// LICENSE VERIFICATION
	// =========================================================================

	/**
	 * Verify a license key
	 */
	async verifyLicenseKey(
		licenseKey: string,
	): Promise<LicenseVerificationResult> {
		// First verify the JWT signature and claims
		const jwtVerification = await verifyLicense(licenseKey, this.publicKey);

		if (!jwtVerification.valid) {
			return {
				valid: false,
				expired: jwtVerification.error === "License expired",
				revoked: false,
				error: jwtVerification.error,
			};
		}

		// Check if license is revoked in database
		const license = await this.repository.getByLicenseKey(licenseKey);

		if (!license) {
			return {
				valid: false,
				expired: false,
				revoked: false,
				payload: jwtVerification.payload,
				error: "License not found in database",
			};
		}

		if (license.revokedAt) {
			return {
				valid: false,
				expired: false,
				revoked: true,
				payload: jwtVerification.payload,
				error: "License has been revoked",
			};
		}

		return {
			valid: true,
			expired: false,
			revoked: false,
			payload: jwtVerification.payload,
		};
	}

	/**
	 * Verify license by organization ID (for internal use)
	 */
	async verifyOrganizationLicense(
		organizationId: string,
	): Promise<LicenseVerificationResult> {
		const license = await this.repository.getByOrganizationId(organizationId);

		if (!license) {
			return {
				valid: false,
				expired: false,
				revoked: false,
				error: "No license found for organization",
			};
		}

		return this.verifyLicenseKey(license.licenseKey);
	}

	// =========================================================================
	// LICENSE MANAGEMENT
	// =========================================================================

	/**
	 * Get license by ID
	 */
	async getLicense(id: string): Promise<EnterpriseLicense | null> {
		return this.repository.getById(id);
	}

	/**
	 * Get license by organization ID
	 */
	async getLicenseByOrganization(
		organizationId: string,
	): Promise<EnterpriseLicense | null> {
		return this.repository.getByOrganizationId(organizationId);
	}

	/**
	 * Get all licenses (admin)
	 */
	async getAllLicenses(): Promise<EnterpriseLicense[]> {
		return this.repository.getAll();
	}

	/**
	 * Get license status for display
	 */
	async getLicenseStatus(licenseId: string): Promise<LicenseStatus | null> {
		const license = await this.repository.getById(licenseId);

		if (!license) {
			return null;
		}

		const now = new Date();
		const isExpired = license.expiresAt < now;
		const isRevoked = license.revokedAt !== null;
		const isActive = !isExpired && !isRevoked && license.activatedAt !== null;

		const daysUntilExpiry = Math.ceil(
			(license.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
		);

		return {
			id: license.id,
			customerName: license.customerName,
			isActive,
			isExpired,
			isRevoked,
			expiresAt: license.expiresAt.toISOString(),
			daysUntilExpiry,
			limits: {
				noticesPerMonth: license.noticesPerMonth,
				maxUsers: license.maxUsers,
				maxTransactions: license.maxTransactions ?? undefined,
				maxAlerts: license.maxAlerts ?? undefined,
			},
			features: license.features,
			activatedAt: license.activatedAt?.toISOString() ?? null,
			organizationId: license.organizationId,
		};
	}

	/**
	 * Revoke a license
	 */
	async revokeLicense(licenseId: string): Promise<void> {
		const license = await this.repository.getById(licenseId);

		if (!license) {
			throw new Error("License not found");
		}

		// Cancel Stripe subscription if exists
		if (license.stripeSubscriptionId) {
			try {
				await this.stripe.subscriptions.cancel(license.stripeSubscriptionId);
			} catch (error) {
				console.error("Failed to cancel Stripe subscription:", error);
			}
		}

		await this.repository.revoke(licenseId);
	}

	/**
	 * Renew a license for another year
	 */
	async renewLicense(licenseId: string): Promise<EnterpriseLicense> {
		const license = await this.repository.getById(licenseId);

		if (!license) {
			throw new Error("License not found");
		}

		if (license.revokedAt) {
			throw new Error("Cannot renew a revoked license");
		}

		// Calculate new expiration (1 year from current expiration or now, whichever is later)
		const now = new Date();
		const baseDate = license.expiresAt > now ? license.expiresAt : now;
		const newExpiresAt = new Date(baseDate);
		newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

		await this.repository.extendExpiration(licenseId, newExpiresAt);

		return {
			...license,
			expiresAt: newExpiresAt,
			updatedAt: new Date(),
		};
	}

	/**
	 * Decode license payload without verification (for display)
	 */
	decodeLicenseKey(licenseKey: string) {
		return decodeLicensePayload(licenseKey);
	}

	// =========================================================================
	// WEBHOOK HANDLERS
	// =========================================================================

	/**
	 * Handle Stripe subscription canceled for enterprise license
	 */
	async handleStripeSubscriptionCanceled(
		stripeSubscriptionId: string,
	): Promise<void> {
		const license =
			await this.repository.getByStripeSubscriptionId(stripeSubscriptionId);

		if (license) {
			await this.repository.revoke(license.id);
		}
	}

	/**
	 * Handle Stripe invoice paid for enterprise renewal
	 */
	async handleStripeInvoicePaid(stripeSubscriptionId: string): Promise<void> {
		const license =
			await this.repository.getByStripeSubscriptionId(stripeSubscriptionId);

		if (license && license.expiresAt < new Date()) {
			// License was expired, renew it
			await this.renewLicense(license.id);
		}
	}
}
