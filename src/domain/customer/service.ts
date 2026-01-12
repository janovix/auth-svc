/**
 * Customer Service
 *
 * Manages Stripe Customer creation, updates, and portal sessions.
 * Every organization gets a Stripe Customer record on creation.
 */

import type Stripe from "stripe";
import type {
	CreateCustomerInput,
	UpdateCustomerInput,
	StripeCustomer,
	StripeCustomerMetadata,
	CustomerPortalSession,
	OrganizationSubscriptionRecord,
} from "./types";

export class CustomerService {
	constructor(
		private readonly stripe: Stripe,
		private readonly db: D1Database,
	) {}

	/**
	 * Create a Stripe Customer for an organization
	 * Also creates the OrganizationSubscription record in the database
	 */
	async createCustomer(input: CreateCustomerInput): Promise<StripeCustomer> {
		const metadata: StripeCustomerMetadata = {
			organizationId: input.organizationId,
			organizationName: input.organizationName,
			organizationSlug: input.organizationSlug,
			rfc: input.rfc,
			planType: "none",
			isEnterprise: "false",
		};

		// Create Stripe Customer
		const stripeCustomer = await this.stripe.customers.create({
			email: input.email,
			name: input.organizationName,
			metadata: metadata as unknown as Stripe.MetadataParam,
		});

		// Create OrganizationSubscription record in database
		const id = crypto.randomUUID();
		await this.db
			.prepare(
				`
			INSERT INTO organization_subscriptions (
				id, organization_id, stripe_customer_id, status, created_at, updated_at
			) VALUES (?, ?, ?, 'inactive', datetime('now'), datetime('now'))
		`,
			)
			.bind(id, input.organizationId, stripeCustomer.id)
			.run();

		return this.mapStripeCustomer(stripeCustomer);
	}

	/**
	 * Get Stripe Customer by organization ID
	 */
	async getCustomerByOrganizationId(
		organizationId: string,
	): Promise<StripeCustomer | null> {
		// First get the subscription record to find the Stripe Customer ID
		const record = await this.getSubscriptionByOrganizationId(organizationId);
		if (!record) {
			return null;
		}

		// Then fetch the customer from Stripe
		try {
			const stripeCustomer = await this.stripe.customers.retrieve(
				record.stripeCustomerId,
			);
			if (stripeCustomer.deleted) {
				return null;
			}
			return this.mapStripeCustomer(stripeCustomer as Stripe.Customer);
		} catch {
			return null;
		}
	}

	/**
	 * Get organization subscription record by organization ID
	 */
	async getSubscriptionByOrganizationId(
		organizationId: string,
	): Promise<OrganizationSubscriptionRecord | null> {
		const result = await this.db
			.prepare(
				`
			SELECT 
				id,
				organization_id as organizationId,
				stripe_customer_id as stripeCustomerId,
				plan_id as planId,
				stripe_subscription_id as stripeSubscriptionId,
				stripe_subscription_item_id as stripeSubscriptionItemId,
				status,
				current_period_start as currentPeriodStart,
				current_period_end as currentPeriodEnd,
				cancel_at_period_end as cancelAtPeriodEnd,
				notices_used as noticesUsed,
				alerts_used as alertsUsed,
				transactions_used as transactionsUsed,
				users_count as usersCount,
				license_id as licenseId,
				billing_email as billingEmail,
				billing_name as billingName,
				created_at as createdAt,
				updated_at as updatedAt
			FROM organization_subscriptions
			WHERE organization_id = ?
		`,
			)
			.bind(organizationId)
			.first<OrganizationSubscriptionRecord>();

		return result || null;
	}

	/**
	 * Get organization subscription record by Stripe Customer ID
	 */
	async getSubscriptionByStripeCustomerId(
		stripeCustomerId: string,
	): Promise<OrganizationSubscriptionRecord | null> {
		const result = await this.db
			.prepare(
				`
			SELECT 
				id,
				organization_id as organizationId,
				stripe_customer_id as stripeCustomerId,
				plan_id as planId,
				stripe_subscription_id as stripeSubscriptionId,
				stripe_subscription_item_id as stripeSubscriptionItemId,
				status,
				current_period_start as currentPeriodStart,
				current_period_end as currentPeriodEnd,
				cancel_at_period_end as cancelAtPeriodEnd,
				notices_used as noticesUsed,
				alerts_used as alertsUsed,
				transactions_used as transactionsUsed,
				users_count as usersCount,
				license_id as licenseId,
				billing_email as billingEmail,
				billing_name as billingName,
				created_at as createdAt,
				updated_at as updatedAt
			FROM organization_subscriptions
			WHERE stripe_customer_id = ?
		`,
			)
			.bind(stripeCustomerId)
			.first<OrganizationSubscriptionRecord>();

		return result || null;
	}

	/**
	 * Update Stripe Customer metadata
	 */
	async updateCustomer(
		organizationId: string,
		input: UpdateCustomerInput,
	): Promise<StripeCustomer | null> {
		const record = await this.getSubscriptionByOrganizationId(organizationId);
		if (!record) {
			return null;
		}

		const updateParams: Stripe.CustomerUpdateParams = {};

		if (input.email !== undefined) {
			updateParams.email = input.email;
		}
		if (input.name !== undefined) {
			updateParams.name = input.name;
		}

		// Build metadata updates
		const metadataUpdates: Record<string, string> = {};
		if (input.organizationName !== undefined) {
			metadataUpdates.organizationName = input.organizationName;
			// Also update the customer name if not explicitly set
			if (input.name === undefined) {
				updateParams.name = input.organizationName;
			}
		}
		if (input.organizationSlug !== undefined) {
			metadataUpdates.organizationSlug = input.organizationSlug;
		}
		if (input.rfc !== undefined) {
			metadataUpdates.rfc = input.rfc;
		}
		if (input.planType !== undefined) {
			metadataUpdates.planType = input.planType;
			metadataUpdates.isEnterprise =
				input.planType === "enterprise" ? "true" : "false";
		}

		if (Object.keys(metadataUpdates).length > 0) {
			updateParams.metadata = metadataUpdates;
		}

		// Update billing details in database if provided
		if (input.email !== undefined || input.name !== undefined) {
			await this.db
				.prepare(
					`
				UPDATE organization_subscriptions 
				SET 
					billing_email = COALESCE(?, billing_email),
					billing_name = COALESCE(?, billing_name),
					updated_at = datetime('now')
				WHERE organization_id = ?
			`,
				)
				.bind(input.email ?? null, input.name ?? null, organizationId)
				.run();
		}

		const stripeCustomer = await this.stripe.customers.update(
			record.stripeCustomerId,
			updateParams,
		);

		return this.mapStripeCustomer(stripeCustomer);
	}

	/**
	 * Create a Stripe Customer Portal session
	 */
	async createPortalSession(
		organizationId: string,
		returnUrl: string,
	): Promise<CustomerPortalSession | null> {
		const record = await this.getSubscriptionByOrganizationId(organizationId);
		if (!record) {
			return null;
		}

		const session = await this.stripe.billingPortal.sessions.create({
			customer: record.stripeCustomerId,
			return_url: returnUrl,
		});

		return {
			id: session.id,
			url: session.url,
			created: session.created,
			expiresAt: session.created + 300, // Portal sessions expire after 5 minutes
		};
	}

	/**
	 * Check if an organization has a Stripe Customer
	 */
	async hasCustomer(organizationId: string): Promise<boolean> {
		const result = await this.db
			.prepare(
				`
			SELECT 1 FROM organization_subscriptions WHERE organization_id = ?
		`,
			)
			.bind(organizationId)
			.first();

		return result !== null;
	}

	/**
	 * Delete customer record (used when organization is deleted)
	 * Note: Does not delete the Stripe Customer, just the local record
	 */
	async deleteCustomerRecord(organizationId: string): Promise<void> {
		await this.db
			.prepare(
				`
			DELETE FROM organization_subscriptions WHERE organization_id = ?
		`,
			)
			.bind(organizationId)
			.run();
	}

	/**
	 * Map Stripe Customer to our type
	 */
	private mapStripeCustomer(customer: Stripe.Customer): StripeCustomer {
		return {
			id: customer.id,
			email: customer.email ?? null,
			name: customer.name ?? null,
			metadata: customer.metadata as unknown as StripeCustomerMetadata,
			created: customer.created,
			currency: customer.currency ?? null,
			defaultSource:
				typeof customer.default_source === "string"
					? customer.default_source
					: customer.default_source?.id || null,
			invoicePrefix: customer.invoice_prefix ?? null,
		};
	}
}
