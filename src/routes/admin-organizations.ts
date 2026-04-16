/**
 * Admin organizations routes
 *
 * Served at /admin/organizations. All routes require session + admin role.
 * Replaces /internal/organizations for admin panel access (internal remains for service bindings).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";
import { t } from "../lib/i18n";
import { sendOrgNotification } from "../utils/notifications";
import { getOrganizationLanguageFromDb } from "../utils/email-language";
import { getAuthenticatedAdmin } from "./admin";

type AdminOrgBindings = {
	Bindings: Bindings;
};

type AdminOrgContext = Context<AdminOrgBindings>;

const adminOrganizationsRoutes = new Hono<AdminOrgBindings>();

/** Require authenticated admin on all routes */
adminOrganizationsRoutes.use("*", async (c, next) => {
	const admin = await getAuthenticatedAdmin(c as AdminOrgContext);
	if (!admin) {
		return c.json(
			{
				success: false,
				error: "Unauthorized",
				message: "Admin access required",
			},
			403,
		);
	}
	return next();
});

/**
 * Type definitions for Better Auth Organization plugin API methods
 */
type OrganizationApiMethods = {
	checkOrganizationSlug: (params: {
		body: { slug: string };
	}) => Promise<{ status: boolean }>;
};

async function getAuth(c: AdminOrgContext) {
	const { auth } = await getBetterAuthContext(c.env);
	return auth as typeof auth & {
		api: typeof auth.api & OrganizationApiMethods;
	};
}

type OrganizationRow = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: string | null;
	createdAt: string;
	updatedAt: string;
};

type MemberRow = {
	id: string;
	organizationId: string;
	userId: string;
	role: string;
	createdAt: string;
	user_name: string | null;
	user_email: string;
	user_image: string | null;
};

type InvitationRow = {
	id: string;
	organizationId: string;
	email: string;
	role: string;
	status: string;
	inviterId: string;
	expiresAt: string;
	createdAt: string;
};

/**
 * GET /admin/organizations
 */
adminOrganizationsRoutes.get("/", async (c) => {
	const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100);
	const offset = parseInt(c.req.query("offset") || "0", 10);
	const search = c.req.query("search")?.trim();

	try {
		let countQuery = "SELECT COUNT(*) as total FROM organizations";
		let dataQuery = `
			SELECT 
				o.id,
				o.name,
				o.slug,
				o.logo,
				o.metadata,
				o.createdAt,
				o.updatedAt,
				(SELECT COUNT(*) FROM members WHERE organizationId = o.id) as member_count
			FROM organizations o
		`;

		const params: (string | number)[] = [];

		if (search) {
			const searchCondition = " WHERE o.name LIKE ? OR o.slug LIKE ?";
			countQuery =
				"SELECT COUNT(*) as total FROM organizations o" + searchCondition;
			dataQuery += searchCondition;
			params.push(`%${search}%`, `%${search}%`);
		}

		dataQuery += " ORDER BY o.createdAt DESC LIMIT ? OFFSET ?";

		const countResult = await c.env.DB.prepare(countQuery)
			.bind(...(search ? [`%${search}%`, `%${search}%`] : []))
			.first<{ total: number }>();

		const dataResult = await c.env.DB.prepare(dataQuery)
			.bind(...params, limit, offset)
			.all<
				OrganizationRow & {
					member_count: number;
				}
			>();

		const organizations = dataResult.results.map((org) => ({
			id: org.id,
			name: org.name,
			slug: org.slug,
			logo: org.logo,
			metadata: org.metadata ? JSON.parse(org.metadata) : null,
			memberCount: org.member_count,
			createdAt: org.createdAt,
			updatedAt: org.updatedAt,
		}));

		return c.json({
			success: true,
			data: {
				organizations,
				total: countResult?.total || 0,
				limit,
				offset,
			},
		});
	} catch (error) {
		console.error("[Admin Organizations] List error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to list organizations",
			},
			500,
		);
	}
});

/**
 * GET /admin/organizations/:id
 */
adminOrganizationsRoutes.get("/:id", async (c) => {
	const id = c.req.param("id");

	try {
		const org = await c.env.DB.prepare(
			`
			SELECT 
				o.id,
				o.name,
				o.slug,
				o.logo,
				o.metadata,
				o.createdAt,
				o.updatedAt,
				(SELECT COUNT(*) FROM members WHERE organizationId = o.id) as member_count
			FROM organizations o
			WHERE o.id = ?
		`,
		)
			.bind(id)
			.first<OrganizationRow & { member_count: number }>();

		if (!org) {
			return c.json({ success: false, error: "Organization not found" }, 404);
		}

		return c.json({
			success: true,
			data: {
				id: org.id,
				name: org.name,
				slug: org.slug,
				logo: org.logo,
				metadata: org.metadata ? JSON.parse(org.metadata) : null,
				memberCount: org.member_count,
				createdAt: org.createdAt,
				updatedAt: org.updatedAt,
			},
		});
	} catch (error) {
		console.error("[Admin Organizations] Get error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to get organization",
			},
			500,
		);
	}
});

/**
 * GET /admin/organizations/:id/members
 */
adminOrganizationsRoutes.get("/:id/members", async (c) => {
	const id = c.req.param("id");

	try {
		const members = await c.env.DB.prepare(
			`
			SELECT 
				m.id,
				m.organizationId,
				m.userId,
				m.role,
				m.createdAt,
				u.name as user_name,
				u.email as user_email,
				u.image as user_image
			FROM members m
			LEFT JOIN users u ON u.id = m.userId
			WHERE m.organizationId = ?
			ORDER BY m.createdAt ASC
		`,
		)
			.bind(id)
			.all<MemberRow>();

		return c.json({
			success: true,
			data: {
				members: members.results.map((m) => ({
					id: m.id,
					organizationId: m.organizationId,
					userId: m.userId,
					role: m.role,
					createdAt: m.createdAt,
					user: {
						id: m.userId,
						name: m.user_name || "Unknown",
						email: m.user_email,
						image: m.user_image,
					},
				})),
				total: members.results.length,
			},
		});
	} catch (error) {
		console.error("[Admin Organizations] List members error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to list members",
			},
			500,
		);
	}
});

/**
 * GET /admin/organizations/:id/invitations
 */
adminOrganizationsRoutes.get("/:id/invitations", async (c) => {
	const id = c.req.param("id");
	const status = c.req.query("status") || "pending";

	try {
		const invitations = await c.env.DB.prepare(
			`
			SELECT 
				id,
				organizationId,
				email,
				role,
				status,
				inviterId,
				expiresAt,
				createdAt
			FROM invitations
			WHERE organizationId = ? AND status = ?
			ORDER BY createdAt DESC
		`,
		)
			.bind(id, status)
			.all<InvitationRow>();

		return c.json({
			success: true,
			data: {
				invitations: invitations.results.map((inv) => ({
					id: inv.id,
					organizationId: inv.organizationId,
					email: inv.email,
					role: inv.role,
					status: inv.status,
					inviterId: inv.inviterId,
					expiresAt: inv.expiresAt,
					createdAt: inv.createdAt,
				})),
				total: invitations.results.length,
			},
		});
	} catch (error) {
		console.error("[Admin Organizations] List invitations error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to list invitations",
			},
			500,
		);
	}
});

/**
 * PATCH /admin/organizations/:id
 */
adminOrganizationsRoutes.patch("/:id", async (c) => {
	const id = c.req.param("id");
	const body = await c.req.json<{
		name?: string;
		slug?: string;
		logo?: string | null;
		metadata?: Record<string, unknown> | null;
	}>();

	if (
		body.name === undefined &&
		body.slug === undefined &&
		body.logo === undefined &&
		body.metadata === undefined
	) {
		return c.json(
			{
				success: false,
				error:
					"At least one field (name, slug, logo, metadata) must be provided",
			},
			400,
		);
	}

	if (
		body.name !== undefined &&
		(!body.name || body.name.trim().length === 0)
	) {
		return c.json(
			{ success: false, error: "Organization name cannot be empty" },
			400,
		);
	}

	if (body.slug !== undefined) {
		if (!body.slug || body.slug.trim().length === 0) {
			return c.json(
				{ success: false, error: "Organization slug cannot be empty" },
				400,
			);
		}
		const slugRegex = /^[a-z0-9-]+$/;
		if (!slugRegex.test(body.slug)) {
			return c.json(
				{
					success: false,
					error:
						"Slug must be lowercase and contain only letters, numbers, and hyphens",
				},
				400,
			);
		}
	}

	try {
		const existingOrg = await c.env.DB.prepare(
			"SELECT id, slug FROM organizations WHERE id = ?",
		)
			.bind(id)
			.first<{ id: string; slug: string }>();

		if (!existingOrg) {
			return c.json({ success: false, error: "Organization not found" }, 404);
		}

		if (body.slug && body.slug !== existingOrg.slug) {
			const auth = await getAuth(c);
			const slugCheck = await auth.api.checkOrganizationSlug({
				body: { slug: body.slug },
			});
			if (!slugCheck.status) {
				return c.json(
					{ success: false, error: "Organization slug is already taken" },
					400,
				);
			}
		}

		const updates: string[] = [];
		const values: (string | null)[] = [];

		if (body.name !== undefined) {
			updates.push("name = ?");
			values.push(body.name.trim());
		}

		if (body.slug !== undefined) {
			updates.push("slug = ?");
			values.push(body.slug.toLowerCase().trim());
		}

		if (body.logo !== undefined) {
			updates.push("logo = ?");
			values.push(body.logo);
		}

		if (body.metadata !== undefined) {
			updates.push("metadata = ?");
			values.push(body.metadata ? JSON.stringify(body.metadata) : null);
		}

		updates.push("updatedAt = datetime('now')");

		await c.env.DB.prepare(
			`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`,
		)
			.bind(...values, id)
			.run();

		const updatedOrg = await c.env.DB.prepare(
			`
			SELECT 
				o.id,
				o.name,
				o.slug,
				o.logo,
				o.metadata,
				o.createdAt,
				o.updatedAt,
				(SELECT COUNT(*) FROM members WHERE organizationId = o.id) as member_count
			FROM organizations o
			WHERE o.id = ?
		`,
		)
			.bind(id)
			.first<OrganizationRow & { member_count: number }>();

		const authAppUrl =
			c.env.AUTH_FRONTEND_URL || "https://auth.janovix.workers.dev";
		const orgLang = await getOrganizationLanguageFromDb(c.env.DB, id);
		const orgName = updatedOrg!.name;
		await sendOrgNotification(c.env.NOTIFICATIONS_SERVICE, id, {
			channelSlug: "system",
			type: "organization.updated",
			title: t(orgLang, "org_settings_updated.title"),
			body: t(orgLang, "org_settings_updated.body", { orgName }),
			callbackUrl: `${authAppUrl}/settings/organization`,
			sourceService: "auth-svc",
			sourceEvent: "admin_organizations.patch",
			emailI18n: {
				titleKey: "org_settings_updated.title",
				bodyKey: "org_settings_updated.body",
				bodyParams: { orgName },
			},
		});

		return c.json({
			success: true,
			data: {
				id: updatedOrg!.id,
				name: updatedOrg!.name,
				slug: updatedOrg!.slug,
				logo: updatedOrg!.logo,
				metadata: updatedOrg!.metadata
					? JSON.parse(updatedOrg!.metadata)
					: null,
				memberCount: updatedOrg!.member_count,
				createdAt: updatedOrg!.createdAt,
				updatedAt: updatedOrg!.updatedAt,
			},
		});
	} catch (error) {
		console.error("[Admin Organizations] Update error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to update organization",
			},
			500,
		);
	}
});

/**
 * DELETE /admin/organizations/:id
 */
adminOrganizationsRoutes.delete("/:id", async (c) => {
	const id = c.req.param("id");

	try {
		const org = await c.env.DB.prepare(
			"SELECT id FROM organizations WHERE id = ?",
		)
			.bind(id)
			.first<{ id: string }>();

		if (!org) {
			return c.json({ success: false, error: "Organization not found" }, 404);
		}

		await c.env.DB.prepare("DELETE FROM organizations WHERE id = ?")
			.bind(id)
			.run();

		return c.json({
			success: true,
			message: "Organization deleted",
		});
	} catch (error) {
		console.error("[Admin Organizations] Delete error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to delete organization",
			},
			500,
		);
	}
});

export { adminOrganizationsRoutes };
