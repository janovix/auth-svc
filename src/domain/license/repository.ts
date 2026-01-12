/**
 * License Repository
 *
 * Database operations for enterprise licenses
 */

import type { EnterpriseLicense } from "./types";
import type { Feature } from "../subscription/types";

interface RawEnterpriseLicense {
	id: string;
	organization_id: string | null;
	license_key: string;
	notices_per_month: number;
	max_users: number;
	max_transactions: number | null;
	max_alerts: number | null;
	features: string;
	stripe_subscription_id: string | null;
	stripe_invoice_id: string | null;
	issued_at: string;
	activated_at: string | null;
	expires_at: string;
	revoked_at: string | null;
	issued_by: string;
	customer_name: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
}

export class LicenseRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Create a new enterprise license
	 */
	async create(
		license: Omit<EnterpriseLicense, "createdAt" | "updatedAt">,
	): Promise<void> {
		await this.db
			.prepare(
				`
			INSERT INTO enterprise_licenses (
				id, organization_id, license_key, notices_per_month, max_users,
				max_transactions, max_alerts, features, stripe_subscription_id,
				stripe_invoice_id, issued_at, activated_at, expires_at, revoked_at,
				issued_by, customer_name, notes, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
		`,
			)
			.bind(
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
				license.activatedAt?.toISOString() || null,
				license.expiresAt.toISOString(),
				license.revokedAt?.toISOString() || null,
				license.issuedBy,
				license.customerName,
				license.notes,
			)
			.run();
	}

	/**
	 * Get license by ID
	 */
	async getById(id: string): Promise<EnterpriseLicense | null> {
		const result = await this.db
			.prepare(`SELECT * FROM enterprise_licenses WHERE id = ?`)
			.bind(id)
			.first<RawEnterpriseLicense>();

		return result ? this.mapLicense(result) : null;
	}

	/**
	 * Get license by license key
	 */
	async getByLicenseKey(licenseKey: string): Promise<EnterpriseLicense | null> {
		const result = await this.db
			.prepare(`SELECT * FROM enterprise_licenses WHERE license_key = ?`)
			.bind(licenseKey)
			.first<RawEnterpriseLicense>();

		return result ? this.mapLicense(result) : null;
	}

	/**
	 * Get license by organization ID
	 */
	async getByOrganizationId(
		organizationId: string,
	): Promise<EnterpriseLicense | null> {
		const result = await this.db
			.prepare(`SELECT * FROM enterprise_licenses WHERE organization_id = ?`)
			.bind(organizationId)
			.first<RawEnterpriseLicense>();

		return result ? this.mapLicense(result) : null;
	}

	/**
	 * Get license by Stripe subscription ID
	 */
	async getByStripeSubscriptionId(
		stripeSubscriptionId: string,
	): Promise<EnterpriseLicense | null> {
		const result = await this.db
			.prepare(
				`SELECT * FROM enterprise_licenses WHERE stripe_subscription_id = ?`,
			)
			.bind(stripeSubscriptionId)
			.first<RawEnterpriseLicense>();

		return result ? this.mapLicense(result) : null;
	}

	/**
	 * Get all licenses (admin)
	 */
	async getAll(): Promise<EnterpriseLicense[]> {
		const result = await this.db
			.prepare(`SELECT * FROM enterprise_licenses ORDER BY created_at DESC`)
			.all<RawEnterpriseLicense>();

		return result.results.map(this.mapLicense);
	}

	/**
	 * Get active licenses (not revoked, not expired)
	 */
	async getActiveLicenses(): Promise<EnterpriseLicense[]> {
		const result = await this.db
			.prepare(
				`
			SELECT * FROM enterprise_licenses 
			WHERE revoked_at IS NULL 
			AND expires_at > datetime('now')
			ORDER BY created_at DESC
		`,
			)
			.all<RawEnterpriseLicense>();

		return result.results.map(this.mapLicense);
	}

	/**
	 * Activate a license for an organization
	 */
	async activate(id: string, organizationId: string): Promise<void> {
		await this.db
			.prepare(
				`
			UPDATE enterprise_licenses 
			SET organization_id = ?, activated_at = datetime('now'), updated_at = datetime('now')
			WHERE id = ?
		`,
			)
			.bind(organizationId, id)
			.run();
	}

	/**
	 * Revoke a license
	 */
	async revoke(id: string): Promise<void> {
		await this.db
			.prepare(
				`
			UPDATE enterprise_licenses 
			SET revoked_at = datetime('now'), updated_at = datetime('now')
			WHERE id = ?
		`,
			)
			.bind(id)
			.run();
	}

	/**
	 * Update Stripe references
	 */
	async updateStripeReferences(
		id: string,
		stripeSubscriptionId: string,
		stripeInvoiceId?: string,
	): Promise<void> {
		await this.db
			.prepare(
				`
			UPDATE enterprise_licenses 
			SET stripe_subscription_id = ?, stripe_invoice_id = ?, updated_at = datetime('now')
			WHERE id = ?
		`,
			)
			.bind(stripeSubscriptionId, stripeInvoiceId || null, id)
			.run();
	}

	/**
	 * Extend license expiration (for renewal)
	 */
	async extendExpiration(id: string, newExpiresAt: Date): Promise<void> {
		await this.db
			.prepare(
				`
			UPDATE enterprise_licenses 
			SET expires_at = ?, updated_at = datetime('now')
			WHERE id = ?
		`,
			)
			.bind(newExpiresAt.toISOString(), id)
			.run();
	}

	/**
	 * Deactivate license (remove organization binding)
	 */
	async deactivate(id: string): Promise<void> {
		await this.db
			.prepare(
				`
			UPDATE enterprise_licenses 
			SET organization_id = NULL, activated_at = NULL, updated_at = datetime('now')
			WHERE id = ?
		`,
			)
			.bind(id)
			.run();
	}

	private mapLicense(raw: RawEnterpriseLicense): EnterpriseLicense {
		return {
			id: raw.id,
			organizationId: raw.organization_id,
			licenseKey: raw.license_key,
			noticesPerMonth: raw.notices_per_month,
			maxUsers: raw.max_users,
			maxTransactions: raw.max_transactions,
			maxAlerts: raw.max_alerts,
			features: JSON.parse(raw.features) as Feature[],
			stripeSubscriptionId: raw.stripe_subscription_id,
			stripeInvoiceId: raw.stripe_invoice_id,
			issuedAt: new Date(raw.issued_at),
			activatedAt: raw.activated_at ? new Date(raw.activated_at) : null,
			expiresAt: new Date(raw.expires_at),
			revokedAt: raw.revoked_at ? new Date(raw.revoked_at) : null,
			issuedBy: raw.issued_by,
			customerName: raw.customer_name,
			notes: raw.notes,
			createdAt: new Date(raw.created_at),
			updatedAt: new Date(raw.updated_at),
		};
	}
}
