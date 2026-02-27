/**
 * License Admin routes for auth-svc
 *
 * All routes require admin role.
 * Provides CRUD operations on enterprise licenses with ratchet rule enforcement.
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";
import { getAuthenticatedAdmin } from "./admin";
import { PricingRepository } from "../domain/pricing";
import type {
	EnterpriseLicense,
	CreateLicenseInput,
} from "../domain/pricing/types";

type AdminBindings = { Bindings: Bindings };

export const licenseAdminRoutes = new Hono<AdminBindings>();

/**
 * Generate a license key in the format ENT-XXXX-XXXX-XXXX
 */
function generateLicenseKey(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const segment = () =>
		Array.from({ length: 4 }, () =>
			chars.charAt(Math.floor(Math.random() * chars.length)),
		).join("");
	return `ENT-${segment()}-${segment()}-${segment()}`;
}

/**
 * Ratchet rule: once a license is redeemed, limits can only increase.
 * 0 means unlimited, so going from unlimited (0) to a specific number is a decrease (blocked).
 * Going from a specific number to unlimited (0) is an increase (allowed).
 */
const LIMIT_FIELDS = [
	"maxOrganizations",
	"maxUsers",
	"reportsPerMonth",
	"noticesPerMonth",
	"alertsPerMonth",
	"operationsPerMonth",
	"clientsPerMonth",
	"watchlistQueriesPerMonth",
] as const;

type LimitField = (typeof LIMIT_FIELDS)[number];

function validateRatchetRule(
	current: EnterpriseLicense,
	update: Partial<Record<LimitField, number>>,
): string[] {
	if (!current.activatedAt) return []; // Not yet redeemed, no restriction

	const violations: string[] = [];
	for (const field of LIMIT_FIELDS) {
		const currentVal = current[field];
		const newVal = update[field];
		if (newVal !== undefined && newVal !== null) {
			// 0 means unlimited -- going from a number to 0 is an increase (to unlimited)
			// Going from 0 (unlimited) to any number is a decrease -- blocked
			if (currentVal === 0 && newVal > 0) {
				violations.push(
					`${field}: cannot decrease from unlimited (0) to ${newVal}`,
				);
			} else if (currentVal > 0 && newVal > 0 && newVal < currentVal) {
				violations.push(
					`${field}: cannot decrease from ${currentVal} to ${newVal}`,
				);
			}
		}
	}
	return violations;
}

/**
 * POST /api/admin/licenses
 * Create a new enterprise license
 */
licenseAdminRoutes.post("/", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const body = await c.req.json<{
		organizationName: string;
		expiresAt?: string;
		notes?: string;
		maxOrganizations?: number;
		maxUsers?: number;
		reportsPerMonth?: number;
		noticesPerMonth?: number;
		alertsPerMonth?: number;
		operationsPerMonth?: number;
		clientsPerMonth?: number;
		watchlistQueriesPerMonth?: number;
	}>();

	if (!body.organizationName) {
		return c.json(
			{ success: false, error: "organizationName is required" },
			400,
		);
	}

	const key = generateLicenseKey();
	const repository = new PricingRepository(c.env.DB);

	const input: CreateLicenseInput = {
		key,
		organizationName: body.organizationName,
		issuedBy: admin.id,
		notes: body.notes,
		expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
		maxOrganizations: body.maxOrganizations ?? 0,
		maxUsers: body.maxUsers ?? 0,
		reportsPerMonth: body.reportsPerMonth ?? 0,
		noticesPerMonth: body.noticesPerMonth ?? 0,
		alertsPerMonth: body.alertsPerMonth ?? 0,
		operationsPerMonth: body.operationsPerMonth ?? 0,
		clientsPerMonth: body.clientsPerMonth ?? 0,
		watchlistQueriesPerMonth: body.watchlistQueriesPerMonth ?? 0,
	};

	const license = await repository.createLicense(input);

	console.log(
		`[License Admin] Created license ${license.id} (${key}) for "${body.organizationName}" by admin ${admin.id}`,
	);

	return c.json({ success: true, data: license }, 201);
});

/**
 * GET /api/admin/licenses
 * List all licenses with optional filters
 */
licenseAdminRoutes.get("/", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const status = c.req.query("status");
	const search = c.req.query("search");
	const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
	const offset = parseInt(c.req.query("offset") ?? "0", 10);

	let sql = `
		SELECT el.*, u.name as user_name, u.email as user_email
		FROM enterprise_licenses el
		LEFT JOIN users u ON el.user_id = u.id
		WHERE 1=1
	`;
	const params: (string | number)[] = [];

	if (status) {
		sql += ` AND el.status = ?`;
		params.push(status);
	}
	if (search) {
		sql += ` AND (el.key LIKE ? OR el.organization_name LIKE ? OR u.email LIKE ? OR u.name LIKE ?)`;
		params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
	}

	// Count query
	const countSql = sql.replace(
		/SELECT el\.\*, u\.name.*?FROM/,
		"SELECT COUNT(*) as count FROM",
	);
	const countStmt = c.env.DB.prepare(countSql);
	const countResult = await (
		params.length > 0 ? countStmt.bind(...params) : countStmt
	).first<{ count: number }>();
	const total = countResult?.count ?? 0;

	// Data query
	sql += ` ORDER BY el.created_at DESC LIMIT ? OFFSET ?`;
	params.push(limit, offset);

	const stmt = c.env.DB.prepare(sql);
	const results = await (params.length > 0 ? stmt.bind(...params) : stmt).all<{
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
		user_name: string | null;
		user_email: string | null;
	}>();

	const licenses = results.results.map((r) => ({
		id: r.id,
		key: r.key,
		organizationName: r.organization_name,
		userId: r.user_id,
		issuedBy: r.issued_by,
		status: r.status,
		expiresAt: r.expires_at,
		activatedAt: r.activated_at,
		notes: r.notes,
		maxOrganizations: r.max_organizations,
		maxUsers: r.max_users,
		reportsPerMonth: r.reports_per_month,
		noticesPerMonth: r.notices_per_month,
		alertsPerMonth: r.alerts_per_month,
		operationsPerMonth: r.operations_per_month,
		clientsPerMonth: r.clients_per_month,
		watchlistQueriesPerMonth: r.watchlist_queries_per_month,
		metadata: r.metadata ? JSON.parse(r.metadata) : null,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
		userName: r.user_name,
		userEmail: r.user_email,
	}));

	return c.json({
		success: true,
		data: licenses,
		pagination: { total, limit, offset },
	});
});

/**
 * GET /api/admin/licenses/:id
 * Get license details
 */
licenseAdminRoutes.get("/:id", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const id = c.req.param("id");

	// Enrich with user info via JOIN
	const row = await c.env.DB.prepare(
		`SELECT el.*, u.name as user_name, u.email as user_email
		 FROM enterprise_licenses el
		 LEFT JOIN users u ON el.user_id = u.id
		 WHERE el.id = ?`,
	)
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
			user_name: string | null;
			user_email: string | null;
		}>();

	if (!row) {
		return c.json({ success: false, error: "License not found" }, 404);
	}

	const license = {
		id: row.id,
		key: row.key,
		organizationName: row.organization_name,
		userId: row.user_id,
		issuedBy: row.issued_by,
		status: row.status,
		expiresAt: row.expires_at,
		activatedAt: row.activated_at,
		notes: row.notes,
		maxOrganizations: row.max_organizations,
		maxUsers: row.max_users,
		reportsPerMonth: row.reports_per_month,
		noticesPerMonth: row.notices_per_month,
		alertsPerMonth: row.alerts_per_month,
		operationsPerMonth: row.operations_per_month,
		clientsPerMonth: row.clients_per_month,
		watchlistQueriesPerMonth: row.watchlist_queries_per_month,
		metadata: row.metadata ? JSON.parse(row.metadata) : null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		userName: row.user_name,
		userEmail: row.user_email,
	};

	return c.json({ success: true, data: license });
});

/**
 * PUT /api/admin/licenses/:id
 * Update license with ratchet rule enforcement
 */
licenseAdminRoutes.put("/:id", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const id = c.req.param("id");
	const repository = new PricingRepository(c.env.DB);
	const current = await repository.getLicenseById(id);

	if (!current) {
		return c.json({ success: false, error: "License not found" }, 404);
	}

	const body = await c.req.json<{
		organizationName?: string;
		status?: string;
		expiresAt?: string | null;
		notes?: string | null;
		maxOrganizations?: number;
		maxUsers?: number;
		reportsPerMonth?: number;
		noticesPerMonth?: number;
		alertsPerMonth?: number;
		operationsPerMonth?: number;
		clientsPerMonth?: number;
		watchlistQueriesPerMonth?: number;
	}>();

	// Validate ratchet rule for limit changes
	const limitUpdates: Partial<Record<LimitField, number>> = {};
	for (const field of LIMIT_FIELDS) {
		if (body[field] !== undefined) {
			limitUpdates[field] = body[field];
		}
	}

	const violations = validateRatchetRule(current, limitUpdates);
	if (violations.length > 0) {
		return c.json(
			{
				success: false,
				error: "Cannot decrease limits on a redeemed license",
				violations,
			},
			400,
		);
	}

	// Build UPDATE SQL
	const fields: string[] = [];
	const values: (string | number | null)[] = [];

	if (body.organizationName !== undefined) {
		fields.push("organization_name = ?");
		values.push(body.organizationName);
	}
	if (body.status !== undefined) {
		fields.push("status = ?");
		values.push(body.status);
	}
	if (body.expiresAt !== undefined) {
		fields.push("expires_at = ?");
		values.push(body.expiresAt);
	}
	if (body.notes !== undefined) {
		fields.push("notes = ?");
		values.push(body.notes);
	}
	for (const field of LIMIT_FIELDS) {
		if (body[field] !== undefined) {
			const columnMap: Record<LimitField, string> = {
				maxOrganizations: "max_organizations",
				maxUsers: "max_users",
				reportsPerMonth: "reports_per_month",
				noticesPerMonth: "notices_per_month",
				alertsPerMonth: "alerts_per_month",
				operationsPerMonth: "operations_per_month",
				clientsPerMonth: "clients_per_month",
				watchlistQueriesPerMonth: "watchlist_queries_per_month",
			};
			fields.push(`${columnMap[field]} = ?`);
			values.push(body[field]!);
		}
	}

	if (fields.length === 0) {
		return c.json({ success: true, data: current });
	}

	fields.push("updated_at = datetime('now')");
	values.push(id);

	await c.env.DB.prepare(
		`UPDATE enterprise_licenses SET ${fields.join(", ")} WHERE id = ?`,
	)
		.bind(...values)
		.run();

	const updated = await repository.getLicenseById(id);

	console.log(`[License Admin] Updated license ${id} by admin ${admin.id}`);

	return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/admin/licenses/:id
 * Revoke a license (soft delete - sets status to "revoked")
 */
licenseAdminRoutes.delete("/:id", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const id = c.req.param("id");
	const repository = new PricingRepository(c.env.DB);
	const license = await repository.getLicenseById(id);

	if (!license) {
		return c.json({ success: false, error: "License not found" }, 404);
	}

	await repository.revokeLicense(id);

	console.log(`[License Admin] Revoked license ${id} by admin ${admin.id}`);

	return c.json({ success: true, message: "License revoked" });
});

/**
 * POST /api/admin/licenses/:id/renew
 * Extend the expiration date of a license
 */
licenseAdminRoutes.post("/:id/renew", async (c) => {
	const admin = await getAuthenticatedAdmin(c);
	if (!admin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const id = c.req.param("id");
	const body = await c.req.json<{ expiresAt: string }>();

	if (!body.expiresAt) {
		return c.json({ success: false, error: "expiresAt is required" }, 400);
	}

	const repository = new PricingRepository(c.env.DB);
	const license = await repository.getLicenseById(id);

	if (!license) {
		return c.json({ success: false, error: "License not found" }, 404);
	}

	await c.env.DB.prepare(
		`UPDATE enterprise_licenses SET expires_at = ?, status = 'active', updated_at = datetime('now') WHERE id = ?`,
	)
		.bind(body.expiresAt, id)
		.run();

	const updated = await repository.getLicenseById(id);

	console.log(
		`[License Admin] Renewed license ${id} until ${body.expiresAt} by admin ${admin.id}`,
	);

	return c.json({ success: true, data: updated });
});
