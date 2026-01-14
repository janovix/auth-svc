/**
 * Internal organizations routes for admin panel access
 *
 * These routes are called by the admin panel to manage all organizations
 * regardless of the admin user's membership.
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";
import { sendOrganizationInvitationEmail } from "../utils/mandrill";

type InternalBindings = {
	Bindings: Bindings;
};

const internalOrganizationsRoutes = new Hono<InternalBindings>();

/**
 * Default invitation expiration: 48 hours
 */
const DEFAULT_INVITATION_EXPIRATION_HOURS = 48;

/**
 * Organization row from database
 * Note: Better Auth managed tables use camelCase columns
 */
type OrganizationRow = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: string | null;
	createdAt: string;
	updatedAt: string;
};

/**
 * Member row from database
 * Note: Better Auth managed tables use camelCase columns
 */
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

/**
 * Invitation row from database
 * Note: Better Auth managed tables use camelCase columns
 */
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
		// Note: organizations table uses camelCase columns (Better Auth managed)
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
 * POST /internal/organizations/:id/invitations
 * Create an invitation to join an organization (admin panel only)
 *
 * Body: { email: string, role: "admin" | "member", inviterUserId?: string }
 */
internalOrganizationsRoutes.post("/:id/invitations", async (c) => {
	const orgId = c.req.param("id");
	const body = await c.req.json<{
		email: string;
		role: "admin" | "member";
		inviterUserId?: string;
	}>();

	// Validate email
	if (!body.email || !body.email.includes("@")) {
		return c.json(
			{ success: false, error: "Valid email address is required" },
			400,
		);
	}

	// Validate role
	if (!body.role || !["admin", "member"].includes(body.role)) {
		return c.json(
			{ success: false, error: "Role must be 'admin' or 'member'" },
			400,
		);
	}

	const email = body.email.toLowerCase().trim();
	const role = body.role;

	try {
		// Check if organization exists
		const org = await c.env.DB.prepare(
			"SELECT id, name FROM organizations WHERE id = ?",
		)
			.bind(orgId)
			.first<{ id: string; name: string }>();

		if (!org) {
			return c.json({ success: false, error: "Organization not found" }, 404);
		}

		// Check if user is already a member
		const existingMember = await c.env.DB.prepare(
			`SELECT m.id FROM members m
			 JOIN users u ON u.id = m.userId
			 WHERE m.organizationId = ? AND LOWER(u.email) = ?`,
		)
			.bind(orgId, email)
			.first<{ id: string }>();

		if (existingMember) {
			return c.json(
				{
					success: false,
					error: "User is already a member of this organization",
				},
				400,
			);
		}

		// Check for existing pending invitation
		const existingInvitation = await c.env.DB.prepare(
			`SELECT id FROM invitations 
			 WHERE organizationId = ? AND LOWER(email) = ? AND status = 'pending'`,
		)
			.bind(orgId, email)
			.first<{ id: string }>();

		if (existingInvitation) {
			return c.json(
				{
					success: false,
					error: "An invitation is already pending for this email",
				},
				400,
			);
		}

		// Get inviter information (if inviterUserId provided)
		// If not provided, use a system admin placeholder
		let inviterName = "Janovix Admin";
		let inviterId = body.inviterUserId;

		if (inviterId) {
			const inviter = await c.env.DB.prepare(
				"SELECT id, name, email FROM users WHERE id = ?",
			)
				.bind(inviterId)
				.first<{ id: string; name: string | null; email: string }>();

			if (inviter) {
				inviterName = inviter.name || inviter.email.split("@")[0];
			}
		} else {
			// Use the first admin user as inviter (required field in DB)
			const adminUser = await c.env.DB.prepare(
				"SELECT id, name, email FROM users WHERE role = 'admin' LIMIT 1",
			).first<{ id: string; name: string | null; email: string }>();

			if (adminUser) {
				inviterId = adminUser.id;
				inviterName = adminUser.name || adminUser.email.split("@")[0];
			} else {
				// Fallback: use the organization owner
				const owner = await c.env.DB.prepare(
					`SELECT u.id, u.name, u.email FROM members m
					 JOIN users u ON u.id = m.userId
					 WHERE m.organizationId = ? AND m.role = 'owner'
					 LIMIT 1`,
				)
					.bind(orgId)
					.first<{ id: string; name: string | null; email: string }>();

				if (!owner) {
					return c.json(
						{ success: false, error: "Could not find an inviter user" },
						500,
					);
				}
				inviterId = owner.id;
				inviterName = owner.name || owner.email.split("@")[0];
			}
		}

		// Generate invitation ID and expiration
		const invitationId = crypto.randomUUID();
		const expiresAt = new Date(
			Date.now() + DEFAULT_INVITATION_EXPIRATION_HOURS * 60 * 60 * 1000,
		).toISOString();

		// Create the invitation
		await c.env.DB.prepare(
			`INSERT INTO invitations (id, organizationId, email, role, status, inviterId, expiresAt, createdAt, updatedAt)
			 VALUES (?, ?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`,
		)
			.bind(invitationId, orgId, email, role, inviterId, expiresAt)
			.run();

		// Send invitation email
		const apiKey = c.env.MANDRILL_API_KEY;
		if (apiKey) {
			const authAppUrl =
				c.env.AUTH_FRONTEND_URL || "https://auth.janovix.workers.dev";
			const inviteUrl = `${authAppUrl}/invite?invitationId=${encodeURIComponent(invitationId)}`;

			// Fire and forget - don't block on email sending
			sendOrganizationInvitationEmail(apiKey, {
				email,
				inviteUrl,
				organizationName: org.name,
				inviterName,
				role,
			}).catch((error) => {
				console.error(
					"[Internal Organizations] Failed to send invitation email:",
					error,
				);
			});
		} else {
			console.warn(
				"[Internal Organizations] MANDRILL_API_KEY not configured; invitation email skipped",
			);
		}

		return c.json({
			success: true,
			data: {
				id: invitationId,
				organizationId: orgId,
				email,
				role,
				status: "pending",
				expiresAt,
			},
		});
	} catch (error) {
		console.error("[Internal Organizations] Create invitation error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to create invitation",
			},
			500,
		);
	}
});

/**
 * PATCH /internal/organizations/:id
 * Update an organization's details (admin only)
 *
 * Body: { name?: string, slug?: string, logo?: string | null, metadata?: Record<string, unknown> | null }
 */
internalOrganizationsRoutes.patch("/:id", async (c) => {
	const id = c.req.param("id");
	const body = await c.req.json<{
		name?: string;
		slug?: string;
		logo?: string | null;
		metadata?: Record<string, unknown> | null;
	}>();

	// Validate that at least one field is being updated
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

	// Validate name if provided
	if (
		body.name !== undefined &&
		(!body.name || body.name.trim().length === 0)
	) {
		return c.json(
			{ success: false, error: "Organization name cannot be empty" },
			400,
		);
	}

	// Validate slug if provided
	if (body.slug !== undefined) {
		if (!body.slug || body.slug.trim().length === 0) {
			return c.json(
				{ success: false, error: "Organization slug cannot be empty" },
				400,
			);
		}
		// Validate slug format (lowercase, alphanumeric, hyphens only)
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
		// Check if organization exists
		const existingOrg = await c.env.DB.prepare(
			"SELECT id, slug FROM organizations WHERE id = ?",
		)
			.bind(id)
			.first<{ id: string; slug: string }>();

		if (!existingOrg) {
			return c.json({ success: false, error: "Organization not found" }, 404);
		}

		// Check slug uniqueness if slug is being changed
		if (body.slug && body.slug !== existingOrg.slug) {
			const slugExists = await c.env.DB.prepare(
				"SELECT id FROM organizations WHERE slug = ? AND id != ?",
			)
				.bind(body.slug, id)
				.first<{ id: string }>();

			if (slugExists) {
				return c.json(
					{ success: false, error: "Organization slug is already taken" },
					400,
				);
			}
		}

		// Build update query dynamically
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

		// Execute update
		await c.env.DB.prepare(
			`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`,
		)
			.bind(...values, id)
			.run();

		// Fetch and return the updated organization
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
		console.error("[Internal Organizations] Update error:", error);
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
			"SELECT id, role FROM members WHERE id = ? AND organizationId = ?",
		)
			.bind(memberId, orgId)
			.first<{ id: string; role: string }>();

		if (!member) {
			return c.json({ success: false, error: "Member not found" }, 404);
		}

		// Prevent removing the last owner
		if (member.role === "owner") {
			const ownerCount = await c.env.DB.prepare(
				"SELECT COUNT(*) as count FROM members WHERE organizationId = ? AND role = 'owner'",
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
			"SELECT id, role FROM members WHERE id = ? AND organizationId = ?",
		)
			.bind(memberId, orgId)
			.first<{ id: string; role: string }>();

		if (!member) {
			return c.json({ success: false, error: "Member not found" }, 404);
		}

		// Prevent demoting the last owner
		if (member.role === "owner" && body.role !== "owner") {
			const ownerCount = await c.env.DB.prepare(
				"SELECT COUNT(*) as count FROM members WHERE organizationId = ? AND role = 'owner'",
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
			"UPDATE members SET role = ?, updatedAt = datetime('now') WHERE id = ?",
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
				"SELECT id FROM invitations WHERE id = ? AND organizationId = ?",
			)
				.bind(invitationId, orgId)
				.first<{ id: string }>();

			if (!invitation) {
				return c.json({ success: false, error: "Invitation not found" }, 404);
			}

			await c.env.DB.prepare(
				"UPDATE invitations SET status = 'canceled', updatedAt = datetime('now') WHERE id = ?",
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
