/**
 * Usage Rights Repository - Database operations for entitlement resolution
 *
 * Handles queries needed by the UsageRightsService:
 * - Organization owner lookup
 * - License resolution (by owner user ID)
 * - Subscription resolution (by owner user ID)
 * - Organization usage read/write (monthly + daily)
 */

import type { EnterpriseLicense } from "../pricing/types";

export class UsageRightsRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Get the owner user ID for an organization
	 */
	async getOrganizationOwnerUserId(
		organizationId: string,
	): Promise<string | null> {
		const result = await this.db
			.prepare(
				`SELECT userId FROM members 
				 WHERE organizationId = ? AND role = 'owner' 
				 LIMIT 1`,
			)
			.bind(organizationId)
			.first<{ userId: string }>();

		return result?.userId ?? null;
	}

	/**
	 * Get active, non-expired license for a user
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
				watchlist_queries_per_day: number;
				metadata: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;
		return this.mapLicense(result);
	}

	/**
	 * Get user's active subscription (from Better Auth Stripe table)
	 */
	async getUserSubscription(userId: string): Promise<{
		id: string;
		plan: string;
		status: string | null;
		stripeSubscriptionId: string | null;
		periodStart: Date | null;
		periodEnd: Date | null;
	} | null> {
		const result = await this.db
			.prepare(
				`SELECT id, plan, status, stripeSubscriptionId, periodStart, periodEnd
				 FROM subscription 
				 WHERE referenceId = ? 
				 AND status IN ('active', 'trialing')
				 ORDER BY 
				   CASE WHEN stripeSubscriptionId IS NOT NULL THEN 0 ELSE 1 END,
				   createdAt DESC 
				 LIMIT 1`,
			)
			.bind(userId)
			.first<{
				id: string;
				plan: string;
				status: string | null;
				stripeSubscriptionId: string | null;
				periodStart: string | null;
				periodEnd: string | null;
			}>();

		if (!result) return null;
		return {
			id: result.id,
			plan: result.plan,
			status: result.status,
			stripeSubscriptionId: result.stripeSubscriptionId,
			periodStart: result.periodStart ? new Date(result.periodStart) : null,
			periodEnd: result.periodEnd ? new Date(result.periodEnd) : null,
		};
	}

	/**
	 * Get organization usage for the current period
	 */
	async getOrganizationUsage(organizationId: string): Promise<{
		reportsUsed: number;
		noticesUsed: number;
		alertsUsed: number;
		operationsUsed: number;
		clientsUsed: number;
		usersCount: number;
	} | null> {
		const result = await this.db
			.prepare(
				`SELECT reports_used, notices_used, alerts_used, operations_used, clients_used, users_count
				 FROM organization_usage 
				 WHERE organization_id = ?`,
			)
			.bind(organizationId)
			.first<{
				reports_used: number;
				notices_used: number;
				alerts_used: number;
				operations_used: number;
				clients_used: number;
				users_count: number;
			}>();

		if (!result) return null;
		return {
			reportsUsed: result.reports_used,
			noticesUsed: result.notices_used,
			alertsUsed: result.alerts_used,
			operationsUsed: result.operations_used,
			clientsUsed: result.clients_used,
			usersCount: result.users_count,
		};
	}

	/**
	 * Get daily usage for an organization (today)
	 */
	async getDailyUsage(
		organizationId: string,
		date: string,
	): Promise<{ watchlistQueriesUsed: number } | null> {
		const result = await this.db
			.prepare(
				`SELECT watchlist_queries_used FROM organization_daily_usage
				 WHERE organization_id = ? AND date = ?`,
			)
			.bind(organizationId, date)
			.first<{ watchlist_queries_used: number }>();

		if (!result) return null;
		return { watchlistQueriesUsed: result.watchlist_queries_used };
	}

	/**
	 * Increment a monthly usage metric
	 */
	async incrementMonthlyUsage(
		organizationId: string,
		metric: string,
		count: number,
	): Promise<void> {
		const columnMap: Record<string, string> = {
			reports: "reports_used",
			notices: "notices_used",
			alerts: "alerts_used",
			operations: "operations_used",
			clients: "clients_used",
			users: "users_count",
		};

		const column = columnMap[metric];
		if (!column) {
			throw new Error(`Unknown monthly metric: ${metric}`);
		}

		await this.db
			.prepare(
				`UPDATE organization_usage 
				 SET ${column} = ${column} + ?, updated_at = datetime('now')
				 WHERE organization_id = ?`,
			)
			.bind(count, organizationId)
			.run();
	}

	/**
	 * Increment daily watchlist queries usage (upsert)
	 */
	async incrementDailyWatchlistQueries(
		organizationId: string,
		date: string,
		count: number,
	): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO organization_daily_usage (id, organization_id, date, watchlist_queries_used, created_at, updated_at)
				 VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
				 ON CONFLICT(organization_id, date) DO UPDATE SET
				   watchlist_queries_used = watchlist_queries_used + ?,
				   updated_at = datetime('now')`,
			)
			.bind(crypto.randomUUID(), organizationId, date, count, count)
			.run();
	}

	/**
	 * Count organizations owned by a user
	 */
	async countOrganizationsOwned(userId: string): Promise<number> {
		const result = await this.db
			.prepare(
				`SELECT COUNT(*) as count FROM members WHERE userId = ? AND role = 'owner'`,
			)
			.bind(userId)
			.first<{ count: number }>();
		return result?.count ?? 0;
	}

	/**
	 * Ensure an organization_usage record exists for an org
	 */
	async ensureOrganizationUsage(
		organizationId: string,
		ownerUserId: string,
	): Promise<void> {
		const existing = await this.db
			.prepare(`SELECT id FROM organization_usage WHERE organization_id = ?`)
			.bind(organizationId)
			.first<{ id: string }>();

		if (!existing) {
			await this.db
				.prepare(
					`INSERT INTO organization_usage (id, organization_id, owner_user_id, period_start, period_end, created_at, updated_at)
					 VALUES (?, ?, ?, datetime('now'), datetime('now', '+30 days'), datetime('now'), datetime('now'))`,
				)
				.bind(crypto.randomUUID(), organizationId, ownerUserId)
				.run();
		}
	}

	/**
	 * Delete old daily usage records for an organization.
	 * Called during billing period reset to clean up stale data.
	 *
	 * @param organizationId Organization to clean up
	 * @param beforeDate Delete records with date < this value (YYYY-MM-DD)
	 */
	async cleanOldDailyUsage(
		organizationId: string,
		beforeDate: string,
	): Promise<void> {
		await this.db
			.prepare(
				`DELETE FROM organization_daily_usage
				 WHERE organization_id = ? AND date < ?`,
			)
			.bind(organizationId, beforeDate)
			.run();
	}

	// =========================================================================
	// MAPPING HELPERS
	// =========================================================================

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
		watchlist_queries_per_day: number;
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
			status: result.status as EnterpriseLicense["status"],
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
			watchlistQueriesPerDay: result.watchlist_queries_per_day,
			metadata: result.metadata ? JSON.parse(result.metadata) : null,
			createdAt: new Date(result.created_at),
			updatedAt: new Date(result.updated_at),
		};
	}
}
