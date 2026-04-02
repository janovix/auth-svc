/**
 * Pricing Repository - Database operations for plans, prices, and limits
 *
 * Handles database operations for:
 * - Subscription plans (business, pro, etc.)
 * - Plan prices (subscription, seats, overage fees)
 * - Plan limits (configurable limits per plan)
 * - Enterprise licenses with optional limit overrides
 */

import type {
	SubscriptionPlan,
	PlanPrice,
	PlanLimits,
	EnterpriseLicense,
	PriceType,
	CreatePlanInput,
	CreatePlanLimitsInput,
	CreatePlanPriceInput,
	CreateLicenseInput,
} from "./types";

export class PricingRepository {
	constructor(private readonly db: D1Database) {}

	// =========================================================================
	// SUBSCRIPTION PLANS
	// =========================================================================

	/**
	 * Get all active subscription plans
	 */
	async getActivePlans(): Promise<SubscriptionPlan[]> {
		const results = await this.db
			.prepare(
				`SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC`,
			)
			.all<{
				id: string;
				name: string;
				display_name: string;
				description: string | null;
				is_active: number;
				sort_order: number;
				trial_days: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		return results.results.map(this.mapPlan);
	}

	/**
	 * Get all plans (including inactive)
	 */
	async getAllPlans(): Promise<SubscriptionPlan[]> {
		const results = await this.db
			.prepare(`SELECT * FROM subscription_plans ORDER BY sort_order ASC`)
			.all<{
				id: string;
				name: string;
				display_name: string;
				description: string | null;
				is_active: number;
				sort_order: number;
				trial_days: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		return results.results.map(this.mapPlan);
	}

	/**
	 * Get a plan by ID
	 */
	async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
		const result = await this.db
			.prepare(`SELECT * FROM subscription_plans WHERE id = ?`)
			.bind(planId)
			.first<{
				id: string;
				name: string;
				display_name: string;
				description: string | null;
				is_active: number;
				sort_order: number;
				trial_days: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapPlan(result);
	}

	/**
	 * Get a plan by name (e.g., "business", "pro")
	 */
	async getPlanByName(name: string): Promise<SubscriptionPlan | null> {
		const result = await this.db
			.prepare(`SELECT * FROM subscription_plans WHERE name = ?`)
			.bind(name)
			.first<{
				id: string;
				name: string;
				display_name: string;
				description: string | null;
				is_active: number;
				sort_order: number;
				trial_days: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapPlan(result);
	}

	/**
	 * Create a new subscription plan
	 */
	async createPlan(input: CreatePlanInput): Promise<SubscriptionPlan> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		await this.db
			.prepare(
				`INSERT INTO subscription_plans (id, name, display_name, description, is_active, sort_order, trial_days, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				input.name,
				input.displayName,
				input.description ?? null,
				input.isActive !== false ? 1 : 0,
				input.sortOrder ?? 0,
				input.trialDays ?? 14,
				now,
				now,
			)
			.run();

		const plan = await this.getPlanById(id);
		if (!plan) throw new Error("Failed to create plan");
		return plan;
	}

	/**
	 * Update a subscription plan
	 */
	async updatePlan(
		planId: string,
		updates: Partial<{
			name: string;
			displayName: string;
			description: string | null;
			isActive: boolean;
			sortOrder: number;
			trialDays: number;
		}>,
	): Promise<SubscriptionPlan | null> {
		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (updates.name !== undefined) {
			fields.push("name = ?");
			values.push(updates.name);
		}
		if (updates.displayName !== undefined) {
			fields.push("display_name = ?");
			values.push(updates.displayName);
		}
		if (updates.description !== undefined) {
			fields.push("description = ?");
			values.push(updates.description);
		}
		if (updates.isActive !== undefined) {
			fields.push("is_active = ?");
			values.push(updates.isActive ? 1 : 0);
		}
		if (updates.sortOrder !== undefined) {
			fields.push("sort_order = ?");
			values.push(updates.sortOrder);
		}
		if (updates.trialDays !== undefined) {
			fields.push("trial_days = ?");
			values.push(updates.trialDays);
		}

		if (fields.length === 0) {
			return this.getPlanById(planId);
		}

		fields.push("updated_at = datetime('now')");
		values.push(planId);

		await this.db
			.prepare(
				`UPDATE subscription_plans SET ${fields.join(", ")} WHERE id = ?`,
			)
			.bind(...values)
			.run();

		return this.getPlanById(planId);
	}

	/**
	 * Delete a subscription plan (soft delete by marking inactive)
	 */
	async deletePlan(planId: string): Promise<void> {
		await this.db
			.prepare(
				`UPDATE subscription_plans SET is_active = 0, updated_at = datetime('now') WHERE id = ?`,
			)
			.bind(planId)
			.run();
	}

	// =========================================================================
	// PLAN PRICES
	// =========================================================================

	/**
	 * Get all prices for a plan
	 */
	async getPricesForPlan(planId: string): Promise<PlanPrice[]> {
		const results = await this.db
			.prepare(
				`SELECT * FROM plan_prices WHERE plan_id = ? AND is_active = 1 ORDER BY price_type ASC`,
			)
			.bind(planId)
			.all<{
				id: string;
				plan_id: string;
				stripe_price_id: string;
				price_type: string;
				amount: number;
				currency: string;
				interval: string | null;
				interval_count: number | null;
				description: string | null;
				is_active: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		return results.results.map(this.mapPrice);
	}

	/**
	 * Get all active prices
	 */
	async getAllActivePrices(): Promise<PlanPrice[]> {
		const results = await this.db
			.prepare(`SELECT * FROM plan_prices WHERE is_active = 1`)
			.all<{
				id: string;
				plan_id: string;
				stripe_price_id: string;
				price_type: string;
				amount: number;
				currency: string;
				interval: string | null;
				interval_count: number | null;
				description: string | null;
				is_active: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		return results.results.map(this.mapPrice);
	}

	/**
	 * Get price by Stripe price ID
	 */
	async getPriceByStripePriceId(
		stripePriceId: string,
	): Promise<PlanPrice | null> {
		const result = await this.db
			.prepare(`SELECT * FROM plan_prices WHERE stripe_price_id = ?`)
			.bind(stripePriceId)
			.first<{
				id: string;
				plan_id: string;
				stripe_price_id: string;
				price_type: string;
				amount: number;
				currency: string;
				interval: string | null;
				interval_count: number | null;
				description: string | null;
				is_active: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapPrice(result);
	}

	/**
	 * Create a new plan price
	 */
	async createPrice(input: CreatePlanPriceInput): Promise<PlanPrice> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		await this.db
			.prepare(
				`INSERT INTO plan_prices (id, plan_id, stripe_price_id, price_type, amount, currency, interval, interval_count, description, is_active, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
			)
			.bind(
				id,
				input.planId,
				input.stripePriceId,
				input.priceType,
				input.amount,
				input.currency ?? "MXN",
				input.interval ?? null,
				input.intervalCount ?? null,
				input.description ?? null,
				now,
				now,
			)
			.run();

		const result = await this.db
			.prepare(`SELECT * FROM plan_prices WHERE id = ?`)
			.bind(id)
			.first<{
				id: string;
				plan_id: string;
				stripe_price_id: string;
				price_type: string;
				amount: number;
				currency: string;
				interval: string | null;
				interval_count: number | null;
				description: string | null;
				is_active: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) throw new Error("Failed to create price");
		return this.mapPrice(result);
	}

	/**
	 * Update a plan price
	 */
	async updatePrice(
		priceId: string,
		updates: Partial<{
			stripePriceId: string;
			priceType: string;
			amount: number;
			currency: string;
			interval: string | null;
			intervalCount: number | null;
			description: string | null;
			isActive: boolean;
		}>,
	): Promise<PlanPrice | null> {
		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (updates.stripePriceId !== undefined) {
			fields.push("stripe_price_id = ?");
			values.push(updates.stripePriceId);
		}
		if (updates.priceType !== undefined) {
			fields.push("price_type = ?");
			values.push(updates.priceType);
		}
		if (updates.amount !== undefined) {
			fields.push("amount = ?");
			values.push(updates.amount);
		}
		if (updates.currency !== undefined) {
			fields.push("currency = ?");
			values.push(updates.currency);
		}
		if (updates.interval !== undefined) {
			fields.push("interval = ?");
			values.push(updates.interval);
		}
		if (updates.intervalCount !== undefined) {
			fields.push("interval_count = ?");
			values.push(updates.intervalCount);
		}
		if (updates.description !== undefined) {
			fields.push("description = ?");
			values.push(updates.description);
		}
		if (updates.isActive !== undefined) {
			fields.push("is_active = ?");
			values.push(updates.isActive ? 1 : 0);
		}

		if (fields.length === 0) {
			return this.getPriceById(priceId);
		}

		fields.push("updated_at = datetime('now')");
		values.push(priceId);

		await this.db
			.prepare(`UPDATE plan_prices SET ${fields.join(", ")} WHERE id = ?`)
			.bind(...values)
			.run();

		return this.getPriceById(priceId);
	}

	/**
	 * Update a price by Stripe price ID
	 */
	async updatePriceByStripePriceId(
		stripePriceId: string,
		updates: Partial<{
			priceType: string;
			amount: number;
			currency: string;
			interval: string | null;
			intervalCount: number | null;
			description: string | null;
			isActive: boolean;
		}>,
	): Promise<PlanPrice | null> {
		const price = await this.getPriceByStripePriceId(stripePriceId);
		if (!price) return null;
		return this.updatePrice(price.id, updates);
	}

	/**
	 * Get price by ID
	 */
	async getPriceById(priceId: string): Promise<PlanPrice | null> {
		const result = await this.db
			.prepare(`SELECT * FROM plan_prices WHERE id = ?`)
			.bind(priceId)
			.first<{
				id: string;
				plan_id: string;
				stripe_price_id: string;
				price_type: string;
				amount: number;
				currency: string;
				interval: string | null;
				interval_count: number | null;
				description: string | null;
				is_active: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapPrice(result);
	}

	/**
	 * Delete a plan price (soft delete by marking inactive)
	 */
	async deletePrice(priceId: string): Promise<void> {
		await this.db
			.prepare(
				`UPDATE plan_prices SET is_active = 0, updated_at = datetime('now') WHERE id = ?`,
			)
			.bind(priceId)
			.run();
	}

	/**
	 * Delete a price by Stripe price ID (soft delete)
	 */
	async deletePriceByStripePriceId(stripePriceId: string): Promise<void> {
		await this.db
			.prepare(
				`UPDATE plan_prices SET is_active = 0, updated_at = datetime('now') WHERE stripe_price_id = ?`,
			)
			.bind(stripePriceId)
			.run();
	}

	// =========================================================================
	// PLAN LIMITS
	// =========================================================================

	/**
	 * Get limits for a plan
	 */
	async getLimitsForPlan(planId: string): Promise<PlanLimits | null> {
		const result = await this.db
			.prepare(`SELECT * FROM plan_limits WHERE plan_id = ?`)
			.bind(planId)
			.first<{
				id: string;
				plan_id: string;
				max_organizations: number;
				users_per_org: number;
				reports_per_month: number;
				notices_per_month: number;
				alerts_per_month: number;
				operations_per_month: number;
				clients_per_month: number;
				watchlist_queries_per_month: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapLimits(result);
	}

	/**
	 * Get limits by plan name (e.g., "business", "pro")
	 */
	async getLimitsByPlanName(planName: string): Promise<PlanLimits | null> {
		const result = await this.db
			.prepare(
				`SELECT l.* FROM plan_limits l 
				 JOIN subscription_plans p ON l.plan_id = p.id 
				 WHERE p.name = ?`,
			)
			.bind(planName)
			.first<{
				id: string;
				plan_id: string;
				max_organizations: number;
				users_per_org: number;
				reports_per_month: number;
				notices_per_month: number;
				alerts_per_month: number;
				operations_per_month: number;
				clients_per_month: number;
				watchlist_queries_per_month: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapLimits(result);
	}

	/**
	 * Create or update plan limits
	 */
	async upsertLimits(input: CreatePlanLimitsInput): Promise<PlanLimits> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		await this.db
			.prepare(
				`INSERT INTO plan_limits (id, plan_id, max_organizations, users_per_org, reports_per_month, notices_per_month, alerts_per_month, operations_per_month, clients_per_month, watchlist_queries_per_month, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(plan_id) DO UPDATE SET
				   max_organizations = excluded.max_organizations,
				   users_per_org = excluded.users_per_org,
				   reports_per_month = excluded.reports_per_month,
				   notices_per_month = excluded.notices_per_month,
				   alerts_per_month = excluded.alerts_per_month,
				   operations_per_month = excluded.operations_per_month,
				   clients_per_month = excluded.clients_per_month,
				   watchlist_queries_per_month = excluded.watchlist_queries_per_month,
				   updated_at = excluded.updated_at`,
			)
			.bind(
				id,
				input.planId,
				input.maxOrganizations ?? 1,
				input.usersPerOrg ?? 5,
				input.reportsPerMonth ?? 0,
				input.noticesPerMonth ?? 3,
				input.alertsPerMonth ?? 50,
				input.operationsPerMonth ?? 250,
				input.clientsPerMonth ?? 50,
				input.watchlistQueriesPerMonth ?? 0,
				now,
				now,
			)
			.run();

		const limits = await this.getLimitsForPlan(input.planId);
		if (!limits) throw new Error("Failed to create/update limits");
		return limits;
	}

	// =========================================================================
	// ENTERPRISE LICENSES
	// =========================================================================

	/**
	 * Get license by key
	 */
	async getLicenseByKey(key: string): Promise<EnterpriseLicense | null> {
		const result = await this.db
			.prepare(`SELECT * FROM enterprise_licenses WHERE key = ?`)
			.bind(key.toUpperCase())
			.first<{
				id: string;
				key: string;
				organization_name: string;
				user_id: string | null;
				issued_by: string | null;
				status: string;
				expires_at: string | null;
				activated_at: string | null;
				notes: string | null;
				max_organizations: number;
				max_users: number;
				reports_per_month: number;
				notices_per_month: number;
				alerts_per_month: number;
				operations_per_month: number;
				clients_per_month: number;
				watchlist_queries_per_month: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapLicense(result);
	}

	/**
	 * Get license by ID
	 */
	async getLicenseById(id: string): Promise<EnterpriseLicense | null> {
		const result = await this.db
			.prepare(`SELECT * FROM enterprise_licenses WHERE id = ?`)
			.bind(id)
			.first<{
				id: string;
				key: string;
				organization_name: string;
				user_id: string | null;
				issued_by: string | null;
				status: string;
				expires_at: string | null;
				activated_at: string | null;
				notes: string | null;
				max_organizations: number;
				max_users: number;
				reports_per_month: number;
				notices_per_month: number;
				alerts_per_month: number;
				operations_per_month: number;
				clients_per_month: number;
				watchlist_queries_per_month: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapLicense(result);
	}

	/**
	 * Get license by user ID
	 */
	async getLicenseByUserId(userId: string): Promise<EnterpriseLicense | null> {
		const result = await this.db
			.prepare(
				`SELECT * FROM enterprise_licenses 
				 WHERE user_id = ? AND status = 'active'
				 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
				 ORDER BY created_at DESC LIMIT 1`,
			)
			.bind(userId)
			.first<{
				id: string;
				key: string;
				organization_name: string;
				user_id: string | null;
				issued_by: string | null;
				status: string;
				expires_at: string | null;
				activated_at: string | null;
				notes: string | null;
				max_organizations: number;
				max_users: number;
				reports_per_month: number;
				notices_per_month: number;
				alerts_per_month: number;
				operations_per_month: number;
				clients_per_month: number;
				watchlist_queries_per_month: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapLicense(result);
	}

	/**
	 * Create a new enterprise license
	 */
	async createLicense(input: CreateLicenseInput): Promise<EnterpriseLicense> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		await this.db
			.prepare(
				`INSERT INTO enterprise_licenses (id, key, organization_name, issued_by, notes, status, expires_at, max_organizations, max_users, reports_per_month, notices_per_month, alerts_per_month, operations_per_month, clients_per_month, watchlist_queries_per_month, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				input.key.toUpperCase(),
				input.organizationName,
				input.issuedBy ?? null,
				input.notes ?? null,
				input.expiresAt?.toISOString() ?? null,
				input.maxOrganizations ?? 0,
				input.maxUsers ?? 0,
				input.reportsPerMonth ?? 0,
				input.noticesPerMonth ?? 0,
				input.alertsPerMonth ?? 0,
				input.operationsPerMonth ?? 0,
				input.clientsPerMonth ?? 0,
				input.watchlistQueriesPerMonth ?? 0,
				now,
				now,
			)
			.run();

		const license = await this.getLicenseById(id);
		if (!license) throw new Error("Failed to create license");
		return license;
	}

	/**
	 * Activate a license for a user
	 */
	async activateLicense(licenseId: string, userId: string): Promise<void> {
		await this.db
			.prepare(
				`UPDATE enterprise_licenses 
				 SET user_id = ?, activated_at = datetime('now'), updated_at = datetime('now')
				 WHERE id = ?`,
			)
			.bind(userId, licenseId)
			.run();
	}

	/**
	 * Revoke a license and cancel any subscription rows still linked to it.
	 * Keeps Stripe-only subscriptions untouched (they have licenseId IS NULL).
	 */
	async revokeLicense(licenseId: string): Promise<{
		subscriptionsCanceled: number;
	}> {
		const results = await this.db.batch([
			this.db
				.prepare(
					`UPDATE enterprise_licenses 
					 SET status = 'revoked', updated_at = datetime('now')
					 WHERE id = ?`,
				)
				.bind(licenseId),
			this.db
				.prepare(
					`UPDATE subscription 
					 SET status = 'canceled', canceledAt = datetime('now'), updatedAt = datetime('now')
					 WHERE licenseId = ? AND status IN ('active', 'trialing')`,
				)
				.bind(licenseId),
		]);

		const changes = results[1]?.meta?.changes ?? 0;
		return { subscriptionsCanceled: Number(changes) };
	}

	/**
	 * Supersede a license (replaced by a newer license, not admin-revoked)
	 */
	async supersedeLicense(licenseId: string): Promise<void> {
		await this.db
			.prepare(
				`UPDATE enterprise_licenses 
				 SET status = 'superseded', updated_at = datetime('now')
				 WHERE id = ?`,
			)
			.bind(licenseId)
			.run();
	}

	// =========================================================================
	// MAPPING HELPERS
	// =========================================================================

	private mapPlan(result: {
		id: string;
		name: string;
		display_name: string;
		description: string | null;
		is_active: number;
		sort_order: number;
		trial_days: number;
		metadata: string | null;
		created_at: string;
		updated_at: string;
	}): SubscriptionPlan {
		return {
			id: result.id,
			name: result.name,
			displayName: result.display_name,
			description: result.description,
			isActive: result.is_active === 1,
			sortOrder: result.sort_order,
			trialDays: result.trial_days,
			metadata: result.metadata ? JSON.parse(result.metadata) : null,
			createdAt: new Date(result.created_at),
			updatedAt: new Date(result.updated_at),
		};
	}

	private mapPrice(result: {
		id: string;
		plan_id: string;
		stripe_price_id: string;
		price_type: string;
		amount: number;
		currency: string;
		interval: string | null;
		interval_count: number | null;
		description: string | null;
		is_active: number;
		metadata: string | null;
		created_at: string;
		updated_at: string;
	}): PlanPrice {
		return {
			id: result.id,
			planId: result.plan_id,
			stripePriceId: result.stripe_price_id,
			priceType: result.price_type as PriceType,
			amount: result.amount,
			currency: result.currency,
			interval: result.interval,
			intervalCount: result.interval_count,
			description: result.description,
			isActive: result.is_active === 1,
			metadata: result.metadata ? JSON.parse(result.metadata) : null,
			createdAt: new Date(result.created_at),
			updatedAt: new Date(result.updated_at),
		};
	}

	private mapLimits(result: {
		id: string;
		plan_id: string;
		max_organizations: number;
		users_per_org: number;
		reports_per_month: number;
		notices_per_month: number;
		alerts_per_month: number;
		operations_per_month: number;
		clients_per_month: number;
		watchlist_queries_per_month: number;
		metadata: string | null;
		created_at: string;
		updated_at: string;
	}): PlanLimits {
		return {
			id: result.id,
			planId: result.plan_id,
			maxOrganizations: result.max_organizations,
			usersPerOrg: result.users_per_org,
			reportsPerMonth: result.reports_per_month,
			noticesPerMonth: result.notices_per_month,
			alertsPerMonth: result.alerts_per_month,
			operationsPerMonth: result.operations_per_month,
			clientsPerMonth: result.clients_per_month,
			watchlistQueriesPerMonth: result.watchlist_queries_per_month,
			metadata: result.metadata ? JSON.parse(result.metadata) : null,
			createdAt: new Date(result.created_at),
			updatedAt: new Date(result.updated_at),
		};
	}

	private mapLicense(result: {
		id: string;
		key: string;
		organization_name: string;
		user_id: string | null;
		issued_by: string | null;
		status: string;
		expires_at: string | null;
		activated_at: string | null;
		notes: string | null;
		max_organizations: number;
		max_users: number;
		reports_per_month: number;
		notices_per_month: number;
		alerts_per_month: number;
		operations_per_month: number;
		clients_per_month: number;
		watchlist_queries_per_month: number;
		metadata: string | null;
		created_at: string;
		updated_at: string;
	}): EnterpriseLicense {
		return {
			id: result.id,
			key: result.key,
			organizationName: result.organization_name,
			userId: result.user_id,
			issuedBy: result.issued_by,
			status: result.status as
				| "active"
				| "revoked"
				| "expired"
				| "suspended"
				| "superseded",
			expiresAt: result.expires_at ? new Date(result.expires_at) : null,
			activatedAt: result.activated_at ? new Date(result.activated_at) : null,
			notes: result.notes,
			maxOrganizations: result.max_organizations,
			maxUsers: result.max_users,
			reportsPerMonth: result.reports_per_month,
			noticesPerMonth: result.notices_per_month,
			alertsPerMonth: result.alerts_per_month,
			operationsPerMonth: result.operations_per_month,
			clientsPerMonth: result.clients_per_month,
			watchlistQueriesPerMonth: result.watchlist_queries_per_month,
			metadata: result.metadata ? JSON.parse(result.metadata) : null,
			createdAt: new Date(result.created_at),
			updatedAt: new Date(result.updated_at),
		};
	}
}
