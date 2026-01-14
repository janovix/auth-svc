/**
 * Organization routes - Organization-related endpoints
 *
 * These routes handle:
 * - Invitation lookup by ID (for email links)
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";

type OrganizationBindings = {
	Bindings: Bindings;
};

const organizationRoutes = new Hono<OrganizationBindings>();

/**
 * GET /api/organization/invitation/:invitationId
 * Get invitation details by ID (for email link handling)
 */
organizationRoutes.get("/invitation/:invitationId", async (c) => {
	try {
		const { auth } = getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session?.user) {
			return c.json({ success: false, error: "Unauthorized" }, 401);
		}

		const invitationId = c.req.param("invitationId");
		const userEmail = session.user.email;

		if (!invitationId) {
			return c.json(
				{ success: false, error: "Invitation ID is required" },
				400,
			);
		}

		// Fetch invitation with organization and inviter details
		const invitation = await c.env.DB.prepare(
			`SELECT i.id, i.organizationId, i.role, i.expiresAt, i.inviterId, i.email as inviteeEmail,
			        o.name as organizationName, o.logo as organizationLogo,
			        u.name as inviterName, u.email as inviterEmail
			 FROM invitations i
			 JOIN organizations o ON i.organizationId = o.id
			 LEFT JOIN users u ON i.inviterId = u.id
			 WHERE i.id = ?
			   AND i.status = 'pending'
			   AND (i.expiresAt IS NULL OR datetime(i.expiresAt) > datetime('now'))`,
		)
			.bind(invitationId)
			.first<{
				id: string;
				organizationId: string;
				role: string;
				expiresAt: string | null;
				inviterId: string;
				inviteeEmail: string;
				organizationName: string;
				organizationLogo: string | null;
				inviterName: string | null;
				inviterEmail: string | null;
			}>();

		if (!invitation) {
			return c.json(
				{ success: false, error: "Invitation not found or has expired" },
				404,
			);
		}

		// Verify the invitation is for the current user
		if (invitation.inviteeEmail.toLowerCase() !== userEmail.toLowerCase()) {
			return c.json(
				{
					success: false,
					error: "This invitation is for a different email address",
				},
				403,
			);
		}

		return c.json({
			success: true,
			data: {
				id: invitation.id,
				organizationId: invitation.organizationId,
				organizationName: invitation.organizationName,
				organizationLogo: invitation.organizationLogo,
				role: invitation.role,
				inviterName: invitation.inviterName,
				inviterEmail: invitation.inviterEmail,
				expiresAt: invitation.expiresAt,
			},
		});
	} catch (error) {
		console.error("[Organization] Error fetching invitation:", error);
		return c.json({ success: false, error: "Failed to fetch invitation" }, 500);
	}
});

export { organizationRoutes };
