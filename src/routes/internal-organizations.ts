/**
 * Internal organizations routes for admin panel access
 *
 * These routes are called by the admin panel to manage all organizations
 * regardless of the admin user's membership.
 *
 * ARCHITECTURE NOTE:
 * These internal routes use a mix of:
 * 1. Better Auth API methods - for operations that benefit from plugin hooks
 *    and built-in functionality (slug validation)
 * 2. Raw SQL - for operations that need to bypass user permissions
 *    (listing ALL organizations, viewing members, admin-only deletions, etc.)
 *
 * Better Auth API methods used:
 * - auth.api.checkOrganizationSlug - validates slug uniqueness
 *
 * These internal routes are protected by separate admin authentication
 * and are not accessible to regular users.
 *
 * NOTE: Member management operations (invite, remove, update role, cancel invitation)
 * have been removed from this admin panel as they require more complex logic
 * that should be handled through the standard user-facing organization management.
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
};

/**
 * Helper to get Better Auth instance for API calls
 * Returns the auth instance with organization plugin methods properly typed
 */
async function getAuth(c: InternalContext) {
	const executionContext = (c as unknown as { executionCtx?: ExecutionContext })
		.executionCtx;
	const { auth } = await getBetterAuthContext(c.env, executionContext);
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
			const auth = await getAuth(c);
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

		// Dispatch notification to all organization members
		if (c.env.NOTIFICATIONS_SERVICE) {
			try {
				await c.env.NOTIFICATIONS_SERVICE.fetch(
					new Request("https://internal/notify", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: "Bearer service-token",
						},
						body: JSON.stringify({
							tenantId: id,
							target: { kind: "org" },
							channelSlug: "system",
							type: "organization.updated",
							title: "Organization Settings Updated",
							body: `Organization "${updatedOrg!.name}" settings have been updated by an administrator.`,
							sourceService: "auth-svc",
							sourceEvent: "internal_organizations.patch",
						}),
					}),
				);
			} catch (error) {
				// Log notification error but don't fail the update
				console.error(
					"[Internal Organizations] Failed to send notification:",
					error,
				);
			}
		}

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

export { internalOrganizationsRoutes };
