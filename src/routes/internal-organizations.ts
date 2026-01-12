/**
 * Internal organizations routes for admin panel access
 *
 * These routes are called by the admin panel to manage all organizations
 * regardless of the admin user's membership.
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";

type InternalBindings = {
	Bindings: Bindings;
};

const internalOrganizationsRoutes = new Hono<InternalBindings>();

/**
 * Organization row from database
 */
type OrganizationRow = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: string | null;
	created_at: string;
	updated_at: string;
};

/**
 * Member row from database
 */
type MemberRow = {
	id: string;
	organization_id: string;
	user_id: string;
	role: string;
	created_at: string;
	user_name: string | null;
	user_email: string;
	user_image: string | null;
};

/**
 * Invitation row from database
 */
type InvitationRow = {
	id: string;
	organization_id: string;
	email: string;
	role: string;
	status: string;
	inviter_id: string;
	expires_at: string;
	created_at: string;
};

/**
 * GET /internal/organizations
 * List all organizations with member counts
 *
 * Query params:
 * - limit: Number of organizations to return (default 50, max 100)
 * - offset: Offset for pagination (default 0)
 * - search: Search by name or slug (optional)
 */
internalOrganizationsRoutes.get("/", async (c) => {
	const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100);
	const offset = parseInt(c.req.query("offset") || "0", 10);
	const search = c.req.query("search")?.trim();

	try {
		// Build the query
		let countQuery = "SELECT COUNT(*) as total FROM organizations";
		let dataQuery = `
			SELECT 
				o.id,
				o.name,
				o.slug,
				o.logo,
				o.metadata,
				o.created_at,
				o.updated_at,
				(SELECT COUNT(*) FROM members WHERE organization_id = o.id) as member_count
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

		dataQuery += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";

		// Execute count query
		const countResult = await c.env.DB.prepare(countQuery)
			.bind(...(search ? [`%${search}%`, `%${search}%`] : []))
			.first<{ total: number }>();

		// Execute data query
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
			createdAt: org.created_at,
			updatedAt: org.updated_at,
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
		console.error("[Internal Organizations] List error:", error);
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
 * GET /internal/organizations/:id
 * Get a single organization by ID
 */
internalOrganizationsRoutes.get("/:id", async (c) => {
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
				o.created_at,
				o.updated_at,
				(SELECT COUNT(*) FROM members WHERE organization_id = o.id) as member_count
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
				createdAt: org.created_at,
				updatedAt: org.updated_at,
			},
		});
	} catch (error) {
		console.error("[Internal Organizations] Get error:", error);
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
 * GET /internal/organizations/:id/members
 * List members of an organization
 */
internalOrganizationsRoutes.get("/:id/members", async (c) => {
	const id = c.req.param("id");

	try {
		const members = await c.env.DB.prepare(
			`
			SELECT 
				m.id,
				m.organization_id,
				m.user_id,
				m.role,
				m.created_at,
				u.name as user_name,
				u.email as user_email,
				u.image as user_image
			FROM members m
			LEFT JOIN users u ON u.id = m.user_id
			WHERE m.organization_id = ?
			ORDER BY m.created_at ASC
		`,
		)
			.bind(id)
			.all<MemberRow>();

		return c.json({
			success: true,
			data: {
				members: members.results.map((m) => ({
					id: m.id,
					organizationId: m.organization_id,
					userId: m.user_id,
					role: m.role,
					createdAt: m.created_at,
					user: {
						id: m.user_id,
						name: m.user_name || "Unknown",
						email: m.user_email,
						image: m.user_image,
					},
				})),
				total: members.results.length,
			},
		});
	} catch (error) {
		console.error("[Internal Organizations] List members error:", error);
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
 * GET /internal/organizations/:id/invitations
 * List pending invitations for an organization
 */
internalOrganizationsRoutes.get("/:id/invitations", async (c) => {
	const id = c.req.param("id");
	const status = c.req.query("status") || "pending";

	try {
		const invitations = await c.env.DB.prepare(
			`
			SELECT 
				id,
				organization_id,
				email,
				role,
				status,
				inviter_id,
				expires_at,
				created_at
			FROM invitations
			WHERE organization_id = ? AND status = ?
			ORDER BY created_at DESC
		`,
		)
			.bind(id, status)
			.all<InvitationRow>();

		return c.json({
			success: true,
			data: {
				invitations: invitations.results.map((inv) => ({
					id: inv.id,
					organizationId: inv.organization_id,
					email: inv.email,
					role: inv.role,
					status: inv.status,
					inviterId: inv.inviter_id,
					expiresAt: inv.expires_at,
					createdAt: inv.created_at,
				})),
				total: invitations.results.length,
			},
		});
	} catch (error) {
		console.error("[Internal Organizations] List invitations error:", error);
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
 * DELETE /internal/organizations/:id
 * Delete an organization (admin only)
 */
internalOrganizationsRoutes.delete("/:id", async (c) => {
	const id = c.req.param("id");

	try {
		// Check if organization exists
		const org = await c.env.DB.prepare(
			"SELECT id FROM organizations WHERE id = ?",
		)
			.bind(id)
			.first<{ id: string }>();

		if (!org) {
			return c.json({ success: false, error: "Organization not found" }, 404);
		}

		// Delete the organization (cascades to members, invitations, settings)
		await c.env.DB.prepare("DELETE FROM organizations WHERE id = ?")
			.bind(id)
			.run();

		return c.json({
			success: true,
			message: "Organization deleted",
		});
	} catch (error) {
		console.error("[Internal Organizations] Delete error:", error);
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

/**
 * DELETE /internal/organizations/:id/members/:memberId
 * Remove a member from an organization
 */
internalOrganizationsRoutes.delete("/:id/members/:memberId", async (c) => {
	const orgId = c.req.param("id");
	const memberId = c.req.param("memberId");

	try {
		// Check if member exists
		const member = await c.env.DB.prepare(
			"SELECT id, role FROM members WHERE id = ? AND organization_id = ?",
		)
			.bind(memberId, orgId)
			.first<{ id: string; role: string }>();

		if (!member) {
			return c.json({ success: false, error: "Member not found" }, 404);
		}

		// Prevent removing the last owner
		if (member.role === "owner") {
			const ownerCount = await c.env.DB.prepare(
				"SELECT COUNT(*) as count FROM members WHERE organization_id = ? AND role = 'owner'",
			)
				.bind(orgId)
				.first<{ count: number }>();

			if (ownerCount && ownerCount.count <= 1) {
				return c.json(
					{
						success: false,
						error: "Cannot remove the last owner of the organization",
					},
					400,
				);
			}
		}

		await c.env.DB.prepare("DELETE FROM members WHERE id = ?")
			.bind(memberId)
			.run();

		return c.json({
			success: true,
			message: "Member removed",
		});
	} catch (error) {
		console.error("[Internal Organizations] Remove member error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to remove member",
			},
			500,
		);
	}
});

/**
 * PATCH /internal/organizations/:id/members/:memberId
 * Update a member's role
 */
internalOrganizationsRoutes.patch("/:id/members/:memberId", async (c) => {
	const orgId = c.req.param("id");
	const memberId = c.req.param("memberId");
	const body = await c.req.json<{ role: string }>();

	if (!body.role || !["owner", "admin", "member"].includes(body.role)) {
		return c.json(
			{
				success: false,
				error: "Invalid role. Must be owner, admin, or member",
			},
			400,
		);
	}

	try {
		// Check if member exists
		const member = await c.env.DB.prepare(
			"SELECT id, role FROM members WHERE id = ? AND organization_id = ?",
		)
			.bind(memberId, orgId)
			.first<{ id: string; role: string }>();

		if (!member) {
			return c.json({ success: false, error: "Member not found" }, 404);
		}

		// Prevent demoting the last owner
		if (member.role === "owner" && body.role !== "owner") {
			const ownerCount = await c.env.DB.prepare(
				"SELECT COUNT(*) as count FROM members WHERE organization_id = ? AND role = 'owner'",
			)
				.bind(orgId)
				.first<{ count: number }>();

			if (ownerCount && ownerCount.count <= 1) {
				return c.json(
					{
						success: false,
						error: "Cannot demote the last owner of the organization",
					},
					400,
				);
			}
		}

		await c.env.DB.prepare(
			"UPDATE members SET role = ?, updated_at = datetime('now') WHERE id = ?",
		)
			.bind(body.role, memberId)
			.run();

		return c.json({
			success: true,
			message: "Member role updated",
		});
	} catch (error) {
		console.error("[Internal Organizations] Update member role error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to update member role",
			},
			500,
		);
	}
});

/**
 * DELETE /internal/organizations/:id/invitations/:invitationId
 * Cancel an invitation
 */
internalOrganizationsRoutes.delete(
	"/:id/invitations/:invitationId",
	async (c) => {
		const orgId = c.req.param("id");
		const invitationId = c.req.param("invitationId");

		try {
			const invitation = await c.env.DB.prepare(
				"SELECT id FROM invitations WHERE id = ? AND organization_id = ?",
			)
				.bind(invitationId, orgId)
				.first<{ id: string }>();

			if (!invitation) {
				return c.json({ success: false, error: "Invitation not found" }, 404);
			}

			await c.env.DB.prepare(
				"UPDATE invitations SET status = 'canceled', updated_at = datetime('now') WHERE id = ?",
			)
				.bind(invitationId)
				.run();

			return c.json({
				success: true,
				message: "Invitation canceled",
			});
		} catch (error) {
			console.error("[Internal Organizations] Cancel invitation error:", error);
			return c.json(
				{
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to cancel invitation",
				},
				500,
			);
		}
	},
);

export { internalOrganizationsRoutes };
