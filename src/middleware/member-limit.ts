/**
 * Member limit guard middleware
 *
 * Intercepts POST /api/auth/organization/invite-member and rejects requests
 * when the organization has already reached its usersPerOrg plan limit.
 *
 * The check runs BEFORE Better Auth processes the invitation so that plan
 * limits are enforced at the server level regardless of the client.
 *
 * Limit resolution: entitlement is always resolved from the org's OWNER
 * (via UsageRightsService), matching the same logic used for all other
 * metered usage checks.
 *
 * Usage counted as: active members + pending invitations.
 * 0 in the limit field = unlimited.
 */
import type { Context, MiddlewareHandler } from "hono";
import * as Sentry from "@sentry/cloudflare";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";
import { OverageRepository } from "../domain/overage";
import {
	UsageRightsService,
	UsageRightsRepository,
} from "../domain/usage-rights";
import { PricingRepository } from "../domain/pricing";

type AppBindings = { Bindings: Bindings };

/**
 * Count of active members + pending invitations for an organization.
 */
async function getOrgMemberAndInviteCount(
	db: D1Database,
	orgId: string,
): Promise<number> {
	const [membersResult, invitesResult] = await Promise.all([
		db
			.prepare(`SELECT COUNT(*) as count FROM members WHERE organizationId = ?`)
			.bind(orgId)
			.first<{ count: number }>(),
		db
			.prepare(
				`SELECT COUNT(*) as count FROM invitations WHERE organizationId = ? AND status = 'pending'`,
			)
			.bind(orgId)
			.first<{ count: number }>(),
	]);

	return (membersResult?.count ?? 0) + (invitesResult?.count ?? 0);
}

export function createMemberLimitGuard(): MiddlewareHandler<AppBindings> {
	return async (c: Context<AppBindings>, next) => {
		// Only guard the invite endpoint
		if (c.req.method !== "POST") {
			return next();
		}

		try {
			// Resolve session without consuming the request body
			const { auth } = await getBetterAuthContext(c.env);
			const session = await auth.api.getSession({
				headers: c.req.raw.headers,
			});

			if (!session?.user) {
				// Let Better Auth handle unauthenticated requests
				return next();
			}

			// Extract organizationId from request body (clone avoids consuming original)
			let organizationId: string | null = null;
			try {
				const body = await c.req.raw
					.clone()
					.json<{ organizationId?: string }>();
				organizationId = body?.organizationId ?? null;
			} catch {
				// Body parse error — fall through to session fallback
			}

			// Fall back to the session's active organization
			if (!organizationId) {
				const sessionData = session.session as {
					activeOrganizationId?: string;
				};
				organizationId = sessionData?.activeOrganizationId ?? null;
			}

			if (!organizationId) {
				// No organization context — let Better Auth produce its own error
				return next();
			}

			const orgRow = await c.env.DB.prepare(
				`SELECT status FROM organizations WHERE id = ? LIMIT 1`,
			)
				.bind(organizationId)
				.first<{ status: string | null }>();
			const orgStatus = orgRow?.status ?? "active";
			if (orgStatus !== "active") {
				return c.json(
					{
						success: false,
						error: "organization_archived",
						code: "ORGANIZATION_ARCHIVED",
						message:
							"This organization is archived or suspended. Invites are disabled.",
					},
					403,
				);
			}

			// Resolve the usersPerOrg limit via the entitlement system (DB-driven)
			const usageRightsService = new UsageRightsService(
				new UsageRightsRepository(c.env.DB),
				new PricingRepository(c.env.DB),
				new OverageRepository(c.env.DB),
			);

			const entitlement =
				await usageRightsService.resolveEntitlement(organizationId);

			// No entitlement means no active subscription — let Better Auth handle it
			if (entitlement.type === "none" || entitlement.limits === null) {
				return next();
			}

			const usersPerOrg = entitlement.limits.usersPerOrg;

			// 0 = unlimited — skip the check
			if (usersPerOrg === 0) {
				return next();
			}

			// Count members + pending invitations directly from DB for accuracy
			const currentCount = await getOrgMemberAndInviteCount(
				c.env.DB,
				organizationId,
			);

			if (currentCount >= usersPerOrg) {
				const overageRow = await c.env.DB.prepare(
					`SELECT overage_enabled FROM user_overage_settings WHERE user_id = ? LIMIT 1`,
				)
					.bind(entitlement.ownerUserId)
					.first<{ overage_enabled: number }>();

				if (overageRow?.overage_enabled === 1) {
					console.log(
						`[Member Limit Guard] Org ${organizationId} at seat limit but owner has metered overage enabled — allowing invite`,
					);
					return next();
				}

				console.log(
					`[Member Limit Guard] Org ${organizationId} at limit (${currentCount}/${usersPerOrg}), blocking invitation`,
				);
				return c.json(
					{
						success: false,
						error: "member_limit_reached",
						message:
							"You have reached the member limit for your plan. Upgrade to invite more members.",
						limit: usersPerOrg,
						used: currentCount,
					},
					403,
				);
			}

			return next();
		} catch (error) {
			Sentry.captureException(error, {
				tags: { context: "member-limit-guard" },
			});
			console.error("[Member Limit Guard] Error checking member limit:", error);
			// Fail open — let Better Auth handle it on unexpected errors
			return next();
		}
	};
}
