/**
 * Subscription Admin routes for auth-svc
 *
 * All routes require admin role.
 * Provides read-only endpoints for listing subscriptions, stats, and usage data.
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";
import { getAuthenticatedAdmin } from "./admin";

type AdminBindings = { Bindings: Bindings };

export const subscriptionAdminRoutes = new Hono<AdminBindings>();

// ============================================================================
// LIST SUBSCRIPTIONS
// ============================================================================

/**
 * GET /api/admin/subscriptions
 * List all subscriptions with linked user info.
 *
 * Query params:
 * - status: filter by status (active, trialing, canceled, past_due, unpaid, incomplete)
 * - plan: filter by plan name (business, pro, ultra, enterprise, watchlist)
 * - search: search by user email or name
 * - limit: max results (default 50, max 100)
 * - offset: pagination offset (default 0)
 */
subscriptionAdminRoutes.get("/", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const status = c.req.query("status");
	const plan = c.req.query("plan");
	const search = c.req.query("search");
	const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
	const offset = parseInt(c.req.query("offset") ?? "0", 10);

	let sql = `
		SELECT s.*, u.name as userName, u.email as userEmail,
		       el.key as licenseKey, el.status as licenseStatus
		FROM subscription s
		LEFT JOIN users u ON s.referenceId = u.id
		LEFT JOIN enterprise_licenses el ON s.licenseId = el.id
		WHERE 1=1
	`;
	const params: (string | number)[] = [];

	if (status) {
		sql += ` AND s.status = ?`;
		params.push(status);
	}
	if (plan) {
		sql += ` AND s.plan = ?`;
		params.push(plan);
	}
	if (search) {
		sql += ` AND (u.email LIKE ? OR u.name LIKE ?)`;
		params.push(`%${search}%`, `%${search}%`);
	}

	// Count total
	const countSql = sql.replace(
		/SELECT s\.\*, u\.name as userName.*?FROM/,
		"SELECT COUNT(*) as count FROM",
	);
	const countStmt = c.env.DB.prepare(countSql);
	const countResult = params.length
		? await countStmt.bind(...params).first<{ count: number }>()
		: await countStmt.first<{ count: number }>();
	const total = countResult?.count ?? 0;

	// Paginated results
	sql += ` ORDER BY s.updatedAt DESC LIMIT ? OFFSET ?`;
	params.push(limit, offset);

	const stmt = c.env.DB.prepare(sql);
	const results = await stmt.bind(...params).all<{
		id: string;
		plan: string;
		referenceId: string;
		stripeCustomerId: string | null;
		stripeSubscriptionId: string | null;
		status: string | null;
		periodStart: string | null;
		periodEnd: string | null;
		cancelAtPeriodEnd: number;
		cancelAt: string | null;
		canceledAt: string | null;
		seats: number | null;
		trialStart: string | null;
		trialEnd: string | null;
		licenseId: string | null;
		createdAt: string;
		updatedAt: string;
		userName: string | null;
		userEmail: string | null;
		licenseKey: string | null;
		licenseStatus: string | null;
	}>();

	const data = (results.results ?? []).map((r) => ({
		id: r.id,
		plan: r.plan,
		userId: r.referenceId,
		stripeCustomerId: r.stripeCustomerId,
		stripeSubscriptionId: r.stripeSubscriptionId,
		status: r.status,
		periodStart: r.periodStart,
		periodEnd: r.periodEnd,
		cancelAtPeriodEnd: !!r.cancelAtPeriodEnd,
		cancelAt: r.cancelAt,
		canceledAt: r.canceledAt,
		seats: r.seats,
		trialStart: r.trialStart,
		trialEnd: r.trialEnd,
		licenseId: r.licenseId,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt,
		userName: r.userName,
		userEmail: r.userEmail,
		licenseKey: r.licenseKey,
		licenseStatus: r.licenseStatus,
		entitlementType: r.licenseId
			? "license"
			: r.stripeSubscriptionId
				? "stripe"
				: "none",
	}));

	return c.json({
		success: true,
		data,
		pagination: { total, limit, offset },
	});
});

// ============================================================================
// SUBSCRIPTION STATS
// ============================================================================

/**
 * GET /api/admin/subscriptions/stats
 * Aggregated subscription statistics for the admin dashboard.
 */
subscriptionAdminRoutes.get("/stats", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	try {
		const statusCounts = await c.env.DB.prepare(
			`SELECT status, COUNT(*) as count FROM subscription GROUP BY status`,
		).all<{ status: string; count: number }>();

		const counts: Record<string, number> = {};
		for (const row of statusCounts.results ?? []) {
			counts[row.status] = row.count;
		}

		const withLicenseResult = await c.env.DB.prepare(
			`SELECT COUNT(*) as count FROM subscription WHERE licenseId IS NOT NULL AND status = 'active'`,
		).first<{ count: number }>();

		const withStripeResult = await c.env.DB.prepare(
			`SELECT COUNT(*) as count FROM subscription WHERE stripeSubscriptionId IS NOT NULL AND status IN ('active', 'trialing')`,
		).first<{ count: number }>();

		const totalResult = await c.env.DB.prepare(
			`SELECT COUNT(*) as count FROM subscription`,
		).first<{ count: number }>();

		return c.json({
			success: true,
			data: {
				total: totalResult?.count ?? 0,
				totalActive: counts["active"] ?? 0,
				totalTrialing: counts["trialing"] ?? 0,
				totalCanceled: counts["canceled"] ?? 0,
				totalPastDue: counts["past_due"] ?? 0,
				totalUnpaid: counts["unpaid"] ?? 0,
				totalWithLicense: withLicenseResult?.count ?? 0,
				totalWithStripe: withStripeResult?.count ?? 0,
			},
		});
	} catch (error) {
		console.error("[SubscriptionAdmin] Error fetching stats:", error);
		return c.json(
			{ success: false, error: "Failed to fetch subscription stats" },
			500,
		);
	}
});

// ============================================================================
// ORGANIZATION USAGE
// ============================================================================

/**
 * GET /api/admin/subscriptions/usage
 * List all organization usage records with enriched data.
 *
 * Query params:
 * - organizationId: filter by org
 * - search: search by org name or owner email
 * - limit: max results (default 50, max 100)
 * - offset: pagination offset (default 0)
 */
subscriptionAdminRoutes.get("/usage", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const organizationId = c.req.query("organizationId");
	const search = c.req.query("search");
	const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
	const offset = parseInt(c.req.query("offset") ?? "0", 10);

	let sql = `
		SELECT ou.*, o.name as orgName, u.email as ownerEmail, u.name as ownerName
		FROM organization_usage ou
		LEFT JOIN organizations o ON ou.organization_id = o.id
		LEFT JOIN users u ON ou.owner_user_id = u.id
		WHERE 1=1
	`;
	const params: (string | number)[] = [];

	if (organizationId) {
		sql += ` AND ou.organization_id = ?`;
		params.push(organizationId);
	}
	if (search) {
		sql += ` AND (o.name LIKE ? OR u.email LIKE ?)`;
		params.push(`%${search}%`, `%${search}%`);
	}

	// Count total
	const countSql = sql.replace(
		/SELECT ou\.\*, o\.name.*?FROM/,
		"SELECT COUNT(*) as count FROM",
	);
	const countStmt = c.env.DB.prepare(countSql);
	const countResult = params.length
		? await countStmt.bind(...params).first<{ count: number }>()
		: await countStmt.first<{ count: number }>();
	const total = countResult?.count ?? 0;

	// Paginated results
	sql += ` ORDER BY ou.updated_at DESC LIMIT ? OFFSET ?`;
	params.push(limit, offset);

	const stmt = c.env.DB.prepare(sql);
	const results = await stmt.bind(...params).all<{
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
		created_at: string;
		updated_at: string;
		orgName: string | null;
		ownerEmail: string | null;
		ownerName: string | null;
	}>();

	const data = (results.results ?? []).map((u) => ({
		id: u.id,
		organizationId: u.organization_id,
		organizationName: u.orgName,
		ownerUserId: u.owner_user_id,
		ownerEmail: u.ownerEmail,
		ownerName: u.ownerName,
		reportsUsed: u.reports_used,
		noticesUsed: u.notices_used,
		alertsUsed: u.alerts_used,
		operationsUsed: u.operations_used,
		clientsUsed: u.clients_used,
		usersCount: u.users_count,
		periodStart: u.period_start,
		periodEnd: u.period_end,
		createdAt: u.created_at,
		updatedAt: u.updated_at,
	}));

	return c.json({
		success: true,
		data,
		pagination: { total, limit, offset },
	});
});

// ============================================================================
// SINGLE SUBSCRIPTION DETAIL
// ============================================================================

/**
 * GET /api/admin/subscriptions/:id
 * Get a single subscription with full user info and organization usage.
 */
subscriptionAdminRoutes.get("/:id", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const id = c.req.param("id");

	const row = await c.env.DB.prepare(
		`SELECT s.*, u.name as userName, u.email as userEmail,
		        el.key as licenseKey, el.status as licenseStatus,
		        el.organization_name as licenseOrgName, el.expires_at as licenseExpiresAt
		 FROM subscription s
		 LEFT JOIN users u ON s.referenceId = u.id
		 LEFT JOIN enterprise_licenses el ON s.licenseId = el.id
		 WHERE s.id = ?`,
	)
		.bind(id)
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
			cancelAt: string | null;
			canceledAt: string | null;
			seats: number | null;
			trialStart: string | null;
			trialEnd: string | null;
			licenseId: string | null;
			createdAt: string;
			updatedAt: string;
			userName: string | null;
			userEmail: string | null;
			licenseKey: string | null;
			licenseStatus: string | null;
			licenseOrgName: string | null;
			licenseExpiresAt: string | null;
		}>();

	if (!row) {
		return c.json({ success: false, error: "Subscription not found" }, 404);
	}

	// Fetch organization usage records for this user's organizations
	const usageResults = await c.env.DB.prepare(
		`SELECT ou.*, o.name as orgName
		 FROM organization_usage ou
		 LEFT JOIN organizations o ON ou.organization_id = o.id
		 WHERE ou.owner_user_id = ?`,
	)
		.bind(row.referenceId)
		.all<{
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
			created_at: string;
			updated_at: string;
			orgName: string | null;
		}>();

	const usage = (usageResults.results ?? []).map((u) => ({
		organizationId: u.organization_id,
		organizationName: u.orgName,
		reportsUsed: u.reports_used,
		noticesUsed: u.notices_used,
		alertsUsed: u.alerts_used,
		operationsUsed: u.operations_used,
		clientsUsed: u.clients_used,
		usersCount: u.users_count,
		periodStart: u.period_start,
		periodEnd: u.period_end,
	}));

	return c.json({
		success: true,
		data: {
			id: row.id,
			plan: row.plan,
			userId: row.referenceId,
			stripeCustomerId: row.stripeCustomerId,
			stripeSubscriptionId: row.stripeSubscriptionId,
			status: row.status,
			periodStart: row.periodStart,
			periodEnd: row.periodEnd,
			cancelAtPeriodEnd: !!row.cancelAtPeriodEnd,
			cancelAt: row.cancelAt,
			canceledAt: row.canceledAt,
			seats: row.seats,
			trialStart: row.trialStart,
			trialEnd: row.trialEnd,
			licenseId: row.licenseId,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			userName: row.userName,
			userEmail: row.userEmail,
			licenseKey: row.licenseKey,
			licenseStatus: row.licenseStatus,
			licenseOrgName: row.licenseOrgName,
			licenseExpiresAt: row.licenseExpiresAt,
			entitlementType: row.licenseId
				? "license"
				: row.stripeSubscriptionId
					? "stripe"
					: "none",
			organizationUsage: usage,
		},
	});
});
