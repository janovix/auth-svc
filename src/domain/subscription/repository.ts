/**
 * Subscription Repository - User-based billing model
 *
 * Handles database operations for:
 * - User subscriptions (Better Auth Stripe plugin managed)
 * - Organization usage tracking
 * - Card fingerprint tracking for trial abuse prevention
 */

import type {
	UserSubscription,
	OrganizationUsage,
	UsedCardFingerprint,
	PlanName,
	SubscriptionStatus,
} from "./types";

export class SubscriptionRepository {
	constructor(private readonly db: D1Database) {}

	// =========================================================================
	// USER SUBSCRIPTIONS (Better Auth Stripe managed table)
	// =========================================================================

	/**
	 * Get user's subscription by user ID
	 * Prioritizes: real subscriptions (with stripeSubscriptionId) > active/trialing status > most recent
	 */
	async getUserSubscription(userId: string): Promise<UserSubscription | null> {
		const result = await this.db
			.prepare(
				`SELECT * FROM subscription 
				 WHERE referenceId = ? 
				 ORDER BY 
				   CASE WHEN stripeSubscriptionId IS NOT NULL THEN 0 ELSE 1 END,
				   CASE WHEN status IN ('active', 'trialing') THEN 0 ELSE 1 END,
				   createdAt DESC 
				 LIMIT 1`,
			)
			.bind(userId)
			.first<{
				id: string;
				plan: string;
				referenceId: string;
				stripeCustomerId: string | null;
				stripeSubscriptionId: string | null;
				status: string | null;
				periodStart: string | null;
				periodEnd: string | null;
				cancelAtPeriodEnd: number;
				seats: number | null;
				trialStart: string | null;
				trialEnd: string | null;
				createdAt: string;
				updatedAt: string;
			}>();

		if (!result) return null;

		return {
			id: result.id,
			plan: result.plan as PlanName,
			referenceId: result.referenceId,
			stripeCustomerId: result.stripeCustomerId,
			stripeSubscriptionId: result.stripeSubscriptionId,
			status: result.status as SubscriptionStatus | null,
			periodStart: result.periodStart ? new Date(result.periodStart) : null,
			periodEnd: result.periodEnd ? new Date(result.periodEnd) : null,
			cancelAtPeriodEnd: result.cancelAtPeriodEnd === 1,
			seats: result.seats,
			trialStart: result.trialStart ? new Date(result.trialStart) : null,
			trialEnd: result.trialEnd ? new Date(result.trialEnd) : null,
			createdAt: new Date(result.createdAt),
			updatedAt: new Date(result.updatedAt),
		};
	}

	/**
	 * Get subscription by Stripe subscription ID
	 */
	async getByStripeSubscriptionId(
		stripeSubscriptionId: string,
	): Promise<UserSubscription | null> {
		const result = await this.db
			.prepare(`SELECT * FROM subscription WHERE stripeSubscriptionId = ?`)
			.bind(stripeSubscriptionId)
			.first<{
				id: string;
				plan: string;
				referenceId: string;
				stripeCustomerId: string | null;
				stripeSubscriptionId: string | null;
				status: string | null;
				periodStart: string | null;
				periodEnd: string | null;
				cancelAtPeriodEnd: number;
				seats: number | null;
				trialStart: string | null;
				trialEnd: string | null;
				createdAt: string;
				updatedAt: string;
			}>();

		if (!result) return null;

		return {
			id: result.id,
			plan: result.plan as PlanName,
			referenceId: result.referenceId,
			stripeCustomerId: result.stripeCustomerId,
			stripeSubscriptionId: result.stripeSubscriptionId,
			status: result.status as SubscriptionStatus | null,
			periodStart: result.periodStart ? new Date(result.periodStart) : null,
			periodEnd: result.periodEnd ? new Date(result.periodEnd) : null,
			cancelAtPeriodEnd: result.cancelAtPeriodEnd === 1,
			seats: result.seats,
			trialStart: result.trialStart ? new Date(result.trialStart) : null,
			trialEnd: result.trialEnd ? new Date(result.trialEnd) : null,
			createdAt: new Date(result.createdAt),
			updatedAt: new Date(result.updatedAt),
		};
	}

	// =========================================================================
	// ORGANIZATION USAGE
	// =========================================================================

	/**
	 * Get organization usage record
	 */
	async getOrganizationUsage(
		organizationId: string,
	): Promise<OrganizationUsage | null> {
		const result = await this.db
			.prepare(`SELECT * FROM organization_usage WHERE organization_id = ?`)
			.bind(organizationId)
			.first<{
				id: string;
				organization_id: string;
				owner_user_id: string;
				reports_used: number;
				notices_used: number;
				alerts_used: number;
				operations_used: number;
				clients_used: number;
				users_count: number;
				period_start: string;
				period_end: string;
				overage_reported_at: string | null;
				stripe_usage_record_id: string | null;
				created_at: string;
				updated_at: string;
			}>();

		if (!result) return null;

		return {
			id: result.id,
			organizationId: result.organization_id,
			ownerUserId: result.owner_user_id,
			reportsUsed: result.reports_used,
			noticesUsed: result.notices_used,
			alertsUsed: result.alerts_used,
			operationsUsed: result.operations_used,
			clientsUsed: result.clients_used,
			usersCount: result.users_count,
			periodStart: new Date(result.period_start),
			periodEnd: new Date(result.period_end),
			overageReportedAt: result.overage_reported_at
				? new Date(result.overage_reported_at)
				: null,
			stripeUsageRecordId: result.stripe_usage_record_id,
			createdAt: new Date(result.created_at),
			updatedAt: new Date(result.updated_at),
		};
	}

	/**
	 * Create or update organization usage record
	 */
	async upsertOrganizationUsage(
		organizationId: string,
		ownerUserId: string,
		periodStart: Date,
		periodEnd: Date,
	): Promise<OrganizationUsage> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		await this.db
			.prepare(
				`
				INSERT INTO organization_usage (
					id, organization_id, owner_user_id, reports_used, notices_used, alerts_used, 
					operations_used, clients_used, users_count, period_start, period_end, created_at, updated_at
				) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?)
				ON CONFLICT(organization_id) DO UPDATE SET
					owner_user_id = excluded.owner_user_id,
					period_start = excluded.period_start,
					period_end = excluded.period_end,
					updated_at = excluded.updated_at
			`,
			)
			.bind(
				id,
				organizationId,
				ownerUserId,
				periodStart.toISOString(),
				periodEnd.toISOString(),
				now,
				now,
			)
			.run();

		const usage = await this.getOrganizationUsage(organizationId);
		if (!usage) {
			throw new Error("Failed to create organization usage record");
		}
		return usage;
	}

	/**
	 * Increment usage for a metric
	 */
	async incrementUsage(
		organizationId: string,
		metric: "reports" | "notices" | "alerts" | "operations" | "clients",
		count: number = 1,
	): Promise<void> {
		const column = {
			reports: "reports_used",
			notices: "notices_used",
			alerts: "alerts_used",
			operations: "operations_used",
			clients: "clients_used",
		}[metric];

		await this.db
			.prepare(
				`
				UPDATE organization_usage 
				SET ${column} = ${column} + ?, updated_at = datetime('now')
				WHERE organization_id = ?
			`,
			)
			.bind(count, organizationId)
			.run();
	}

	/**
	 * Update user count for organization
	 */
	async updateUsersCount(
		organizationId: string,
		usersCount: number,
	): Promise<void> {
		await this.db
			.prepare(
				`
				UPDATE organization_usage 
				SET users_count = ?, updated_at = datetime('now')
				WHERE organization_id = ?
			`,
			)
			.bind(usersCount, organizationId)
			.run();
	}

	/**
	 * Reset usage for new billing period
	 */
	async resetUsage(
		organizationId: string,
		periodStart: Date,
		periodEnd: Date,
	): Promise<void> {
		await this.db
			.prepare(
				`
				UPDATE organization_usage 
				SET reports_used = 0, notices_used = 0, alerts_used = 0, 
				    operations_used = 0, clients_used = 0,
				    period_start = ?, period_end = ?, 
				    overage_reported_at = NULL, stripe_usage_record_id = NULL,
				    updated_at = datetime('now')
				WHERE organization_id = ?
			`,
			)
			.bind(periodStart.toISOString(), periodEnd.toISOString(), organizationId)
			.run();
	}

	/**
	 * Mark overage as reported to Stripe
	 */
	async markOverageReported(
		organizationId: string,
		stripeUsageRecordId: string,
	): Promise<void> {
		await this.db
			.prepare(
				`
				UPDATE organization_usage 
				SET overage_reported_at = datetime('now'), 
				    stripe_usage_record_id = ?,
				    updated_at = datetime('now')
				WHERE organization_id = ?
			`,
			)
			.bind(stripeUsageRecordId, organizationId)
			.run();
	}

	/**
	 * Count organizations owned by a user
	 */
	async countOrganizationsOwned(userId: string): Promise<number> {
		const result = await this.db
			.prepare(
				`
				SELECT COUNT(*) as count FROM members 
				WHERE userId = ? AND role = 'owner'
			`,
			)
			.bind(userId)
			.first<{ count: number }>();

		return result?.count ?? 0;
	}

	/**
	 * Count members in an organization
	 */
	async countOrganizationMembers(organizationId: string): Promise<number> {
		const result = await this.db
			.prepare(
				`
				SELECT COUNT(*) as count FROM members 
				WHERE organizationId = ?
			`,
			)
			.bind(organizationId)
			.first<{ count: number }>();

		return result?.count ?? 0;
	}

	/**
	 * Get the owner user ID of an organization
	 */
	async getOrganizationOwnerUserId(
		organizationId: string,
	): Promise<string | null> {
		const result = await this.db
			.prepare(
				`
				SELECT userId FROM members 
				WHERE organizationId = ? AND role = 'owner'
				LIMIT 1
			`,
			)
			.bind(organizationId)
			.first<{ userId: string }>();

		return result?.userId ?? null;
	}

	/**
	 * Get all organizations owned by a user with their member counts
	 * Used for aggregating extra seats across all owned organizations
	 */
	async getOwnedOrganizationsWithMemberCounts(
		userId: string,
	): Promise<Array<{ organizationId: string; memberCount: number }>> {
		const result = await this.db
			.prepare(
				`
				SELECT 
					m1.organizationId as organization_id,
					COUNT(m2.id) as member_count
				FROM members m1
				JOIN members m2 ON m1.organizationId = m2.organizationId
				WHERE m1.userId = ? AND m1.role = 'owner'
				GROUP BY m1.organizationId
			`,
			)
			.bind(userId)
			.all<{ organization_id: string; member_count: number }>();

		return (
			result.results?.map((r) => ({
				organizationId: r.organization_id,
				memberCount: r.member_count,
			})) ?? []
		);
	}

	// =========================================================================
	// CARD FINGERPRINT (Trial abuse prevention)
	// =========================================================================

	/**
	 * Check if card fingerprint has been used before
	 */
	async isCardFingerprintUsed(fingerprint: string): Promise<boolean> {
		const result = await this.db
			.prepare(`SELECT id FROM used_card_fingerprints WHERE fingerprint = ?`)
			.bind(fingerprint)
			.first();

		return !!result;
	}

	/**
	 * Get card fingerprint record
	 */
	async getCardFingerprint(
		fingerprint: string,
	): Promise<UsedCardFingerprint | null> {
		const result = await this.db
			.prepare(`SELECT * FROM used_card_fingerprints WHERE fingerprint = ?`)
			.bind(fingerprint)
			.first<{
				id: string;
				fingerprint: string;
				first_user_id: string;
				first_used_at: string;
				last_used_at: string;
				usage_count: number;
				created_at: string;
			}>();

		if (!result) return null;

		return {
			id: result.id,
			fingerprint: result.fingerprint,
			firstUserId: result.first_user_id,
			firstUsedAt: new Date(result.first_used_at),
			lastUsedAt: new Date(result.last_used_at),
			usageCount: result.usage_count,
			createdAt: new Date(result.created_at),
		};
	}

	/**
	 * Store card fingerprint (for new trials)
	 */
	async storeCardFingerprint(
		fingerprint: string,
		userId: string,
	): Promise<void> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		await this.db
			.prepare(
				`
				INSERT INTO used_card_fingerprints (
					id, fingerprint, first_user_id, first_used_at, last_used_at, usage_count, created_at
				) VALUES (?, ?, ?, ?, ?, 1, ?)
			`,
			)
			.bind(id, fingerprint, userId, now, now, now)
			.run();
	}

	/**
	 * Increment card fingerprint usage count
	 */
	async incrementCardFingerprintUsage(fingerprint: string): Promise<void> {
		await this.db
			.prepare(
				`
				UPDATE used_card_fingerprints 
				SET usage_count = usage_count + 1, last_used_at = datetime('now')
				WHERE fingerprint = ?
			`,
			)
			.bind(fingerprint)
			.run();
	}
}
