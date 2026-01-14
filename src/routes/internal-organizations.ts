/**
 * Internal organizations routes for admin panel access
 *
 * These routes are called by the admin panel to manage all organizations
 * regardless of the admin user's membership.
 *
 * ARCHITECTURE NOTE:
 * These internal routes use a mix of:
 * 1. Better Auth API methods - for operations that benefit from plugin hooks
 *    and built-in functionality (invitations, member management, slug validation)
 * 2. Raw SQL - for operations that need to bypass user permissions
 *    (listing ALL organizations, admin-only deletions, etc.)
 *
 * Better Auth API methods used:
 * - auth.api.checkOrganizationSlug - validates slug uniqueness
 * - auth.api.createInvitation - creates invitations with email sending
 * - auth.api.addMember - adds members directly (server-side only)
 * - auth.api.cancelInvitation - cancels pending invitations
 *
 * These internal routes are protected by separate admin authentication
 * and are not accessible to regular users.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";

type InternalBindings = {
	Bindings: Bindings;
};

type InternalContext = Context<InternalBindings>;

const internalOrganizationsRoutes = new Hono<InternalBindings>();

/**
 * Type definitions for Better Auth Organization plugin API methods
 * These are used to properly type the auth.api object which includes
 * organization plugin methods added dynamically
 */
type OrganizationApiMethods = {
	checkOrganizationSlug: (params: {
		body: { slug: string };
	}) => Promise<{ status: boolean }>;
	createInvitation: (params: {
		body: {
			email: string;
			role: string;
			organizationId: string;
			resend?: boolean;
		};
		headers?: Headers;
	}) => Promise<{
		id: string;
		organizationId: string;
		email: string;
		role: string;
		status: string;
		expiresAt: Date;
	}>;
	addMember: (params: {
		body: {
			userId: string;
			role: string;
			organizationId: string;
		};
	}) => Promise<{
		id: string;
		organizationId: string;
		userId: string;
		role: string;
		createdAt: Date;
	}>;
	cancelInvitation: (params: {
		body: { invitationId: string };
		headers?: Headers;
	}) => Promise<void>;
};

/**
 * Helper to get Better Auth instance for API calls
 * Returns the auth instance with organization plugin methods properly typed
 */
function getAuth(c: InternalContext) {
	const executionContext = (c as unknown as { executionCtx?: ExecutionContext })
		.executionCtx;
	const { auth } = getBetterAuthContext(c.env, executionContext);
	// Cast to include organization plugin methods which are added dynamically
	return auth as typeof auth & {
		api: typeof auth.api & OrganizationApiMethods;
	};
}

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
 * Uses Better Auth's createInvitation API which handles:
 * - Checking if user is already a member
 * - Managing pending invitations (with resend option)
 * - Sending invitation email via configured callback
 *
 * Body: { email: string, role: "admin" | "member", inviterUserId?: string, resend?: boolean }
 */
internalOrganizationsRoutes.post("/:id/invitations", async (c) => {
	const orgId = c.req.param("id");
	const body = await c.req.json<{
		email: string;
		role: "admin" | "member";
		inviterUserId?: string;
		resend?: boolean;
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

		// Get inviter user ID - required for Better Auth createInvitation
		// Better Auth needs a valid user to act as inviter
		let inviterId = body.inviterUserId;

		if (!inviterId) {
			// Use the first admin user as inviter
			const adminUser = await c.env.DB.prepare(
				"SELECT id FROM users WHERE role = 'admin' LIMIT 1",
			).first<{ id: string }>();

			if (adminUser) {
				inviterId = adminUser.id;
			} else {
				// Fallback: use the organization owner
				const owner = await c.env.DB.prepare(
					`SELECT u.id FROM members m
					 JOIN users u ON u.id = m.userId
					 WHERE m.organizationId = ? AND m.role = 'owner'
					 LIMIT 1`,
				)
					.bind(orgId)
					.first<{ id: string }>();

				if (!owner) {
					return c.json(
						{ success: false, error: "Could not find an inviter user" },
						500,
					);
				}
				inviterId = owner.id;
			}
		}

		// Get the inviter's session to use with createInvitation
		// We create a minimal session context for the API call
		const auth = getAuth(c);

		// Use Better Auth's createInvitation API
		// This handles member checks, pending invitation checks, and email sending
		const result = await auth.api.createInvitation({
			body: {
				email,
				role,
				organizationId: orgId,
				resend: body.resend ?? false,
			},
			headers: c.req.raw.headers,
		});

		// Return the invitation data
		return c.json({
			success: true,
			data: {
				id: result.id,
				organizationId: result.organizationId,
				email: result.email,
				role: result.role,
				status: result.status,
				expiresAt: result.expiresAt,
			},
		});
	} catch (error) {
		console.error("[Internal Organizations] Create invitation error:", error);

		// Handle Better Auth specific errors
		const errorMessage =
			error instanceof Error ? error.message : "Failed to create invitation";

		// Better Auth returns specific error messages we can pass through
		if (errorMessage.includes("already a member")) {
			return c.json(
				{
					success: false,
					error: "User is already a member of this organization",
				},
				400,
			);
		}

		if (errorMessage.includes("already invited")) {
			return c.json(
				{
					success: false,
					error: "An invitation is already pending for this email",
				},
				400,
			);
		}

		return c.json(
			{
				success: false,
				error: errorMessage,
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

		// Check slug uniqueness if slug is being changed using Better Auth API
		if (body.slug && body.slug !== existingOrg.slug) {
			const auth = getAuth(c);
			const slugCheck = await auth.api.checkOrganizationSlug({
				body: { slug: body.slug },
			});

			// checkOrganizationSlug returns { status: true } if slug is available
			if (!slugCheck.status) {
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
 * POST /internal/organizations/:id/members
 * Add a member to an organization by creating an invitation
 *
 * This endpoint looks up the user by ID and sends them an invitation email.
 * The user must accept the invitation to become a member.
 *
 * Uses Better Auth's createInvitation API which:
 * - Triggers invitation hooks (beforeCreateInvitation, afterCreateInvitation)
 * - Sends invitation email via configured sendInvitationEmail callback
 * - Handles existing member and pending invitation validation
 *
 * Body: { userId: string, role: "admin" | "member" }
 */
internalOrganizationsRoutes.post("/:id/members", async (c) => {
	const orgId = c.req.param("id");
	const body = await c.req.json<{
		userId: string;
		role: "admin" | "member";
	}>();

	// Validate userId
	if (!body.userId || body.userId.trim().length === 0) {
		return c.json({ success: false, error: "User ID is required" }, 400);
	}

	// Validate role (only admin and member can be invited, owner is assigned at creation)
	if (!body.role || !["admin", "member"].includes(body.role)) {
		return c.json(
			{ success: false, error: "Role must be 'admin' or 'member'" },
			400,
		);
	}

	try {
		// Check if organization exists (keep this check for better error messages)
		const org = await c.env.DB.prepare(
			"SELECT id FROM organizations WHERE id = ?",
		)
			.bind(orgId)
			.first<{ id: string }>();

		if (!org) {
			return c.json({ success: false, error: "Organization not found" }, 404);
		}

		// Look up the user to get their email for the invitation
		const user = await c.env.DB.prepare(
			"SELECT id, email FROM users WHERE id = ?",
		)
			.bind(body.userId)
			.first<{ id: string; email: string }>();

		if (!user) {
			return c.json({ success: false, error: "User not found" }, 404);
		}

		// Use Better Auth's createInvitation API to send invitation email
		const auth = getAuth(c);
		const result = await auth.api.createInvitation({
			body: {
				email: user.email,
				role: body.role,
				organizationId: orgId,
				resend: false,
			},
			headers: c.req.raw.headers,
		});

		// Return the invitation data
		return c.json({
			success: true,
			data: {
				id: result.id,
				organizationId: result.organizationId,
				email: result.email,
				role: result.role,
				status: result.status,
				expiresAt: result.expiresAt,
			},
		});
	} catch (error) {
		console.error("[Internal Organizations] Add member error:", error);

		const errorMessage =
			error instanceof Error ? error.message : "Failed to add member";

		// Handle Better Auth specific errors
		if (errorMessage.includes("already a member")) {
			return c.json(
				{
					success: false,
					error: "User is already a member of this organization",
				},
				400,
			);
		}

		if (errorMessage.includes("already invited")) {
			return c.json(
				{
					success: false,
					error: "An invitation is already pending for this user",
				},
				400,
			);
		}

		return c.json(
			{
				success: false,
				error: errorMessage,
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
 * Cancel an invitation using Better Auth's cancelInvitation API
 *
 * This triggers the beforeCancelInvitation and afterCancelInvitation hooks
 */
internalOrganizationsRoutes.delete(
	"/:id/invitations/:invitationId",
	async (c) => {
		const orgId = c.req.param("id");
		const invitationId = c.req.param("invitationId");

		try {
			// Verify invitation exists and belongs to this organization
			const invitation = await c.env.DB.prepare(
				"SELECT id FROM invitations WHERE id = ? AND organizationId = ?",
			)
				.bind(invitationId, orgId)
				.first<{ id: string }>();

			if (!invitation) {
				return c.json({ success: false, error: "Invitation not found" }, 404);
			}

			// Use Better Auth's cancelInvitation API
			const auth = getAuth(c);
			await auth.api.cancelInvitation({
				body: { invitationId },
				headers: c.req.raw.headers,
			});

			return c.json({
				success: true,
				message: "Invitation canceled",
			});
		} catch (error) {
			console.error("[Internal Organizations] Cancel invitation error:", error);

			const errorMessage =
				error instanceof Error ? error.message : "Failed to cancel invitation";

			// Handle not found errors from Better Auth
			if (errorMessage.includes("not found")) {
				return c.json({ success: false, error: "Invitation not found" }, 404);
			}

			return c.json(
				{
					success: false,
					error: errorMessage,
				},
				500,
			);
		}
	},
);

export { internalOrganizationsRoutes };
