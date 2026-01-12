/**
 * Subscription Repository
 *
 * Database operations for subscription plans and organization subscriptions
 */

import type {
	SubscriptionPlan,
	OrganizationSubscription,
	UsageRecord,
	Feature,
	PlanTier,
	SubscriptionStatus,
} from "./types";

interface RawSubscriptionPlan {
	id: string;
	name: string;
	tier: string;
	billing_interval: string;
	stripe_price_id: string;
	base_price: number;
	notices_included: number;
	users_included: number;
	transactions_included: number | null;
	alerts_included: number | null;
	overage_price_id: string | null;
	overage_price: number | null;
	features: string;
	active: number;
	created_at: string;
	updated_at: string;
}

interface RawOrganizationSubscription {
	id: string;
	organization_id: string;
	stripe_customer_id: string;
	plan_id: string | null;
	stripe_subscription_id: string | null;
	stripe_subscription_item_id: string | null;
	status: string;
	current_period_start: string | null;
	current_period_end: string | null;
	cancel_at_period_end: number;
	notices_used: number;
	alerts_used: number;
	transactions_used: number;
	users_count: number;
	license_id: string | null;
	billing_email: string | null;
	billing_name: string | null;
	created_at: string;
	updated_at: string;
}

interface RawUsageRecord {
	id: string;
	organization_id: string;
	subscription_id: string;
	period_start: string;
	period_end: string;
	notices_created: number;
	alerts_created: number;
	transactions_created: number;
	notices_overage: number;
	overage_reported_at: string | null;
	stripe_usage_record_ids: string | null;
	created_at: string;
	updated_at: string;
}

export class SubscriptionRepository {
	constructor(private readonly db: D1Database) {}

	// =========================================================================
	// SUBSCRIPTION PLANS
	// =========================================================================

	/**
	 * Get all active subscription plans
	 */
	async getActivePlans(): Promise<SubscriptionPlan[]> {
		const result = await this.db
			.prepare(
				`
			SELECT * FROM subscription_plans 
			WHERE active = 1 
			ORDER BY base_price ASC
		`,
			)
			.all<RawSubscriptionPlan>();

		return result.results.map(this.mapPlan);
	}

	/**
	 * Get a subscription plan by ID
	 */
	async getPlanById(id: string): Promise<SubscriptionPlan | null> {
		const result = await this.db
			.prepare(`SELECT * FROM subscription_plans WHERE id = ?`)
			.bind(id)
			.first<RawSubscriptionPlan>();

		return result ? this.mapPlan(result) : null;
	}

	/**
	 * Get a subscription plan by Stripe Price ID
	 */
	async getPlanByStripePriceId(
		stripePriceId: string,
	): Promise<SubscriptionPlan | null> {
		const result = await this.db
			.prepare(`SELECT * FROM subscription_plans WHERE stripe_price_id = ?`)
			.bind(stripePriceId)
			.first<RawSubscriptionPlan>();

		return result ? this.mapPlan(result) : null;
	}

	/**
	 * Get a subscription plan by tier
	 */
	async getPlanByTier(tier: PlanTier): Promise<SubscriptionPlan | null> {
		const result = await this.db
			.prepare(
				`SELECT * FROM subscription_plans WHERE tier = ? AND active = 1 LIMIT 1`,
			)
			.bind(tier)
			.first<RawSubscriptionPlan>();

		return result ? this.mapPlan(result) : null;
	}

	/**
	 * Upsert a subscription plan (for syncing from Stripe)
	 */
	async upsertPlan(
		plan: Omit<SubscriptionPlan, "createdAt" | "updatedAt">,
	): Promise<void> {
		await this.db
			.prepare(
				`
			INSERT INTO subscription_plans (
				id, name, tier, billing_interval, stripe_price_id, base_price,
				notices_included, users_included, transactions_included, alerts_included,
				overage_price_id, overage_price, features, active, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
			ON CONFLICT(id) DO UPDATE SET
				name = excluded.name,
				tier = excluded.tier,
				billing_interval = excluded.billing_interval,
				stripe_price_id = excluded.stripe_price_id,
				base_price = excluded.base_price,
				notices_included = excluded.notices_included,
				users_included = excluded.users_included,
				transactions_included = excluded.transactions_included,
				alerts_included = excluded.alerts_included,
				overage_price_id = excluded.overage_price_id,
				overage_price = excluded.overage_price,
				features = excluded.features,
				active = excluded.active,
				updated_at = datetime('now')
		`,
			)
			.bind(
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
				plan.active ? 1 : 0,
			)
			.run();
	}

	// =========================================================================
	// ORGANIZATION SUBSCRIPTIONS
	// =========================================================================

	/**
	 * Get organization subscription by organization ID
	 */
	async getByOrganizationId(
		organizationId: string,
	): Promise<OrganizationSubscription | null> {
		const result = await this.db
			.prepare(
				`SELECT * FROM organization_subscriptions WHERE organization_id = ?`,
			)
			.bind(organizationId)
			.first<RawOrganizationSubscription>();

		if (!result) return null;

		const subscription = this.mapSubscription(result);

		// Load plan if planId exists
		if (subscription.planId) {
			subscription.plan = await this.getPlanById(subscription.planId);
		}

		return subscription;
	}

	/**
	 * Get organization subscription by Stripe Subscription ID
	 */
	async getByStripeSubscriptionId(
		stripeSubscriptionId: string,
	): Promise<OrganizationSubscription | null> {
		const result = await this.db
			.prepare(
				`SELECT * FROM organization_subscriptions WHERE stripe_subscription_id = ?`,
			)
			.bind(stripeSubscriptionId)
			.first<RawOrganizationSubscription>();

		if (!result) return null;

		const subscription = this.mapSubscription(result);

		if (subscription.planId) {
			subscription.plan = await this.getPlanById(subscription.planId);
		}

		return subscription;
	}

	/**
	 * Get organization subscription by Stripe Customer ID
	 */
	async getByStripeCustomerId(
		stripeCustomerId: string,
	): Promise<OrganizationSubscription | null> {
		const result = await this.db
			.prepare(
				`SELECT * FROM organization_subscriptions WHERE stripe_customer_id = ?`,
			)
			.bind(stripeCustomerId)
			.first<RawOrganizationSubscription>();

		if (!result) return null;

		const subscription = this.mapSubscription(result);

		if (subscription.planId) {
			subscription.plan = await this.getPlanById(subscription.planId);
		}

		return subscription;
	}

	/**
	 * Update subscription after Stripe subscription created/updated
	 */
	async updateSubscription(
		organizationId: string,
		data: {
			planId?: string | null;
			stripeSubscriptionId?: string | null;
			stripeSubscriptionItemId?: string | null;
			status?: SubscriptionStatus;
			currentPeriodStart?: Date | null;
			currentPeriodEnd?: Date | null;
			cancelAtPeriodEnd?: boolean;
		},
	): Promise<void> {
		const updates: string[] = [];
		const values: (string | number | null)[] = [];

		if (data.planId !== undefined) {
			updates.push("plan_id = ?");
			values.push(data.planId);
		}
		if (data.stripeSubscriptionId !== undefined) {
			updates.push("stripe_subscription_id = ?");
			values.push(data.stripeSubscriptionId);
		}
		if (data.stripeSubscriptionItemId !== undefined) {
			updates.push("stripe_subscription_item_id = ?");
			values.push(data.stripeSubscriptionItemId);
		}
		if (data.status !== undefined) {
			updates.push("status = ?");
			values.push(data.status);
		}
		if (data.currentPeriodStart !== undefined) {
			updates.push("current_period_start = ?");
			values.push(
				data.currentPeriodStart ? data.currentPeriodStart.toISOString() : null,
			);
		}
		if (data.currentPeriodEnd !== undefined) {
			updates.push("current_period_end = ?");
			values.push(
				data.currentPeriodEnd ? data.currentPeriodEnd.toISOString() : null,
			);
		}
		if (data.cancelAtPeriodEnd !== undefined) {
			updates.push("cancel_at_period_end = ?");
			values.push(data.cancelAtPeriodEnd ? 1 : 0);
		}

		updates.push("updated_at = datetime('now')");
		values.push(organizationId);

		await this.db
			.prepare(
				`UPDATE organization_subscriptions SET ${updates.join(", ")} WHERE organization_id = ?`,
			)
			.bind(...values)
			.run();
	}

	/**
	 * Update usage counters
	 */
	async updateUsage(
		organizationId: string,
		data: {
			noticesUsed?: number;
			alertsUsed?: number;
			transactionsUsed?: number;
			usersCount?: number;
		},
	): Promise<void> {
		const updates: string[] = [];
		const values: (string | number)[] = [];

		if (data.noticesUsed !== undefined) {
			updates.push("notices_used = ?");
			values.push(data.noticesUsed);
		}
		if (data.alertsUsed !== undefined) {
			updates.push("alerts_used = ?");
			values.push(data.alertsUsed);
		}
		if (data.transactionsUsed !== undefined) {
			updates.push("transactions_used = ?");
			values.push(data.transactionsUsed);
		}
		if (data.usersCount !== undefined) {
			updates.push("users_count = ?");
			values.push(data.usersCount);
		}

		updates.push("updated_at = datetime('now')");
		values.push(organizationId);

		await this.db
			.prepare(
				`UPDATE organization_subscriptions SET ${updates.join(", ")} WHERE organization_id = ?`,
			)
			.bind(...values)
			.run();
	}

	/**
	 * Increment usage counter
	 */
	async incrementUsage(
		organizationId: string,
		metric: "notices" | "alerts" | "transactions",
		count: number,
	): Promise<void> {
		const column =
			metric === "notices"
				? "notices_used"
				: metric === "alerts"
					? "alerts_used"
					: "transactions_used";

		await this.db
			.prepare(
				`UPDATE organization_subscriptions 
				SET ${column} = ${column} + ?, updated_at = datetime('now') 
				WHERE organization_id = ?`,
			)
			.bind(count, organizationId)
			.run();
	}

	/**
	 * Reset usage counters (called at start of new billing period)
	 */
	async resetUsage(organizationId: string): Promise<void> {
		await this.db
			.prepare(
				`UPDATE organization_subscriptions 
				SET notices_used = 0, alerts_used = 0, transactions_used = 0, updated_at = datetime('now')
				WHERE organization_id = ?`,
			)
			.bind(organizationId)
			.run();
	}

	// =========================================================================
	// USAGE RECORDS
	// =========================================================================

	/**
	 * Get or create usage record for current period
	 */
	async getOrCreateUsageRecord(
		organizationId: string,
		subscriptionId: string,
		periodStart: Date,
		periodEnd: Date,
	): Promise<UsageRecord> {
		const existing = await this.db
			.prepare(
				`SELECT * FROM usage_records 
				WHERE organization_id = ? AND period_start = ?`,
			)
			.bind(organizationId, periodStart.toISOString())
			.first<RawUsageRecord>();

		if (existing) {
			return this.mapUsageRecord(existing);
		}

		// Create new record
		const id = crypto.randomUUID();
		await this.db
			.prepare(
				`INSERT INTO usage_records (
					id, organization_id, subscription_id, period_start, period_end,
					notices_created, alerts_created, transactions_created, notices_overage,
					created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, datetime('now'), datetime('now'))`,
			)
			.bind(
				id,
				organizationId,
				subscriptionId,
				periodStart.toISOString(),
				periodEnd.toISOString(),
			)
			.run();

		return {
			id,
			organizationId,
			subscriptionId,
			periodStart,
			periodEnd,
			noticesCreated: 0,
			alertsCreated: 0,
			transactionsCreated: 0,
			noticesOverage: 0,
			overageReportedAt: null,
			stripeUsageRecordIds: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	/**
	 * Update usage record
	 */
	async updateUsageRecord(
		id: string,
		data: {
			noticesCreated?: number;
			alertsCreated?: number;
			transactionsCreated?: number;
			noticesOverage?: number;
			overageReportedAt?: Date;
			stripeUsageRecordIds?: string[];
		},
	): Promise<void> {
		const updates: string[] = [];
		const values: (string | number | null)[] = [];

		if (data.noticesCreated !== undefined) {
			updates.push("notices_created = ?");
			values.push(data.noticesCreated);
		}
		if (data.alertsCreated !== undefined) {
			updates.push("alerts_created = ?");
			values.push(data.alertsCreated);
		}
		if (data.transactionsCreated !== undefined) {
			updates.push("transactions_created = ?");
			values.push(data.transactionsCreated);
		}
		if (data.noticesOverage !== undefined) {
			updates.push("notices_overage = ?");
			values.push(data.noticesOverage);
		}
		if (data.overageReportedAt !== undefined) {
			updates.push("overage_reported_at = ?");
			values.push(data.overageReportedAt.toISOString());
		}
		if (data.stripeUsageRecordIds !== undefined) {
			updates.push("stripe_usage_record_ids = ?");
			values.push(JSON.stringify(data.stripeUsageRecordIds));
		}

		updates.push("updated_at = datetime('now')");
		values.push(id);

		await this.db
			.prepare(`UPDATE usage_records SET ${updates.join(", ")} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	// =========================================================================
	// MAPPERS
	// =========================================================================

	private mapPlan(raw: RawSubscriptionPlan): SubscriptionPlan {
		return {
			id: raw.id,
			name: raw.name,
			tier: raw.tier as PlanTier,
			billingInterval: raw.billing_interval as "month" | "year",
			stripePriceId: raw.stripe_price_id,
			basePrice: raw.base_price,
			noticesIncluded: raw.notices_included,
			usersIncluded: raw.users_included,
			transactionsIncluded: raw.transactions_included,
			alertsIncluded: raw.alerts_included,
			overagePriceId: raw.overage_price_id,
			overagePrice: raw.overage_price,
			features: JSON.parse(raw.features) as Feature[],
			active: raw.active === 1,
			createdAt: new Date(raw.created_at),
			updatedAt: new Date(raw.updated_at),
		};
	}

	private mapSubscription(
		raw: RawOrganizationSubscription,
	): OrganizationSubscription {
		return {
			id: raw.id,
			organizationId: raw.organization_id,
			stripeCustomerId: raw.stripe_customer_id,
			planId: raw.plan_id,
			stripeSubscriptionId: raw.stripe_subscription_id,
			stripeSubscriptionItemId: raw.stripe_subscription_item_id,
			status: raw.status as SubscriptionStatus,
			currentPeriodStart: raw.current_period_start
				? new Date(raw.current_period_start)
				: null,
			currentPeriodEnd: raw.current_period_end
				? new Date(raw.current_period_end)
				: null,
			cancelAtPeriodEnd: raw.cancel_at_period_end === 1,
			noticesUsed: raw.notices_used,
			alertsUsed: raw.alerts_used,
			transactionsUsed: raw.transactions_used,
			usersCount: raw.users_count,
			licenseId: raw.license_id,
			billingEmail: raw.billing_email,
			billingName: raw.billing_name,
			createdAt: new Date(raw.created_at),
			updatedAt: new Date(raw.updated_at),
		};
	}

	private mapUsageRecord(raw: RawUsageRecord): UsageRecord {
		return {
			id: raw.id,
			organizationId: raw.organization_id,
			subscriptionId: raw.subscription_id,
			periodStart: new Date(raw.period_start),
			periodEnd: new Date(raw.period_end),
			noticesCreated: raw.notices_created,
			alertsCreated: raw.alerts_created,
			transactionsCreated: raw.transactions_created,
			noticesOverage: raw.notices_overage,
			overageReportedAt: raw.overage_reported_at
				? new Date(raw.overage_reported_at)
				: null,
			stripeUsageRecordIds: raw.stripe_usage_record_ids
				? JSON.parse(raw.stripe_usage_record_ids)
				: null,
			createdAt: new Date(raw.created_at),
			updatedAt: new Date(raw.updated_at),
		};
	}
}
