/**
 * Organization routes - Organization-related endpoints
 *
 * These routes handle:
 * - Invitation lookup by ID (for email links)
 * - Seat count updates after member changes
 */
import { Hono } from "hono";
import Stripe from "stripe";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";
import {
	SubscriptionRepository,
	SubscriptionService,
} from "../domain/subscription";
import { PricingRepository } from "../domain/pricing";

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

/**
 * POST /api/organization/update-seats
 * Update Stripe subscription seat count for an organization
 *
 * Called by frontend after:
 * - Accepting an invitation
 * - Removing a member
 * - Any other member count change
 *
 * This endpoint counts members and updates the subscription quantity accordingly.
 */
organizationRoutes.post("/update-seats", async (c) => {
	try {
		const { auth } = getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session?.user) {
			return c.json({ success: false, error: "Unauthorized" }, 401);
		}

		const body = await c.req.json<{ organizationId: string }>();
		const { organizationId } = body;

		if (!organizationId) {
			return c.json(
				{ success: false, error: "Organization ID is required" },
				400,
			);
		}

		// Verify user is a member of the organization
		const membership = await c.env.DB.prepare(
			`SELECT id, role FROM members WHERE organizationId = ? AND userId = ?`,
		)
			.bind(organizationId, session.user.id)
			.first<{ id: string; role: string }>();

		if (!membership) {
			return c.json(
				{ success: false, error: "Not a member of this organization" },
				403,
			);
		}

		// Check if Stripe is configured
		if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_SEAT_PRICE_ID) {
			console.log(
				"[Organization] Stripe not configured for seat billing, skipping update",
			);
			return c.json({
				success: true,
				message: "Seat billing not configured",
				seatsUpdated: false,
			});
		}

		const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
		const repository = new SubscriptionRepository(c.env.DB);
		const pricingRepository = new PricingRepository(c.env.DB);
		const service = new SubscriptionService(
			repository,
			stripe,
			pricingRepository,
		);

		// Count members and update seat quantity
		const memberCount =
			await repository.countOrganizationMembers(organizationId);

		console.log(
			`[Organization] Updating seats for org ${organizationId}: ${memberCount} members`,
		);

		await service.updateSubscriptionSeatQuantity(
			organizationId,
			memberCount,
			c.env.STRIPE_SEAT_PRICE_ID,
		);

		return c.json({
			success: true,
			message: "Seat count updated",
			seatsUpdated: true,
			memberCount,
		});
	} catch (error) {
		console.error("[Organization] Error updating seats:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to update seats",
			},
			500,
		);
	}
});

/**
 * POST /api/organization/sync-all-seats
 * Sync seat counts for all organizations owned by the current user
 *
 * This is useful for correcting any drift between actual member counts
 * and Stripe subscription quantities.
 */
organizationRoutes.post("/sync-all-seats", async (c) => {
	try {
		const { auth } = getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session?.user) {
			return c.json({ success: false, error: "Unauthorized" }, 401);
		}

		// Check if Stripe is configured
		if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_SEAT_PRICE_ID) {
			return c.json({
				success: true,
				message: "Seat billing not configured",
				synced: 0,
			});
		}

		// Get all organizations owned by the user
		const orgsResult = await c.env.DB.prepare(
			`SELECT organizationId FROM members WHERE userId = ? AND role = 'owner'`,
		)
			.bind(session.user.id)
			.all<{ organizationId: string }>();

		if (!orgsResult.results?.length) {
			return c.json({
				success: true,
				message: "No organizations to sync",
				synced: 0,
			});
		}

		const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
		const repository = new SubscriptionRepository(c.env.DB);
		const pricingRepository = new PricingRepository(c.env.DB);
		const service = new SubscriptionService(
			repository,
			stripe,
			pricingRepository,
		);

		let synced = 0;
		for (const org of orgsResult.results) {
			try {
				const memberCount = await repository.countOrganizationMembers(
					org.organizationId,
				);
				await service.updateSubscriptionSeatQuantity(
					org.organizationId,
					memberCount,
					c.env.STRIPE_SEAT_PRICE_ID,
				);
				synced++;
			} catch (error) {
				console.error(
					`[Organization] Failed to sync seats for org ${org.organizationId}:`,
					error,
				);
			}
		}

		return c.json({
			success: true,
			message: `Synced ${synced} of ${orgsResult.results.length} organizations`,
			synced,
			total: orgsResult.results.length,
		});
	} catch (error) {
		console.error("[Organization] Error syncing all seats:", error);
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Failed to sync seats",
			},
			500,
		);
	}
});

export { organizationRoutes };
