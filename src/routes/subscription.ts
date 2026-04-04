/**
 * Subscription routes - User-based billing
 *
 * These routes handle:
 * - User subscription status
 * - Organization usage tracking
 * - Org creation limit checking
 * - License validation and activation
 *
 * Note: Checkout, cancel, and upgrade are handled by Better Auth Stripe plugin
 * at /api/auth/subscription/* endpoints.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import * as Sentry from "@sentry/cloudflare";
import type { Bindings } from "../types/bindings";
import {
	SubscriptionRepository,
	SubscriptionService,
} from "../domain/subscription";
import { PricingRepository, PricingService } from "../domain/pricing";
import { OverageRepository } from "../domain/overage";
import { UsageRightsRepository } from "../domain/usage-rights/repository";
import { getBetterAuthContext } from "../auth/instance";

type SubscriptionBindings = {
	Bindings: Bindings;
};

type SubscriptionContext = Context<SubscriptionBindings>;

const subscriptionRoutes = new Hono<SubscriptionBindings>();

/**
 * Helper to get authenticated user from session
 */
async function getAuthenticatedUser(
	c: SubscriptionContext,
): Promise<{ id: string; organizationId: string | null } | null> {
	try {
		const { auth } = await getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) {
			return null;
		}

		const organizationId =
			(session.session as { activeOrganizationId?: string })
				?.activeOrganizationId ?? null;

		return {
			id: session.user.id,
			organizationId,
		};
	} catch {
		return null;
	}
}

/**
 * Helper to get Stripe client (optional - only for metered billing)
 */
function getStripe(c: SubscriptionContext): Stripe | null {
	if (!c.env.STRIPE_SECRET_KEY) {
		return null;
	}
	return new Stripe(c.env.STRIPE_SECRET_KEY);
}

/**
 * Helper to create subscription service with pricing repository
 */
function createSubscriptionService(
	c: SubscriptionContext,
): SubscriptionService {
	const stripe = getStripe(c);
	const repository = new SubscriptionRepository(c.env.DB);
	const pricingRepository = new PricingRepository(c.env.DB);
	return new SubscriptionService(repository, stripe, pricingRepository);
}

/**
 * When resolveFromOrg is true, return the active organization's owner user id;
 * otherwise return the authenticated user's id. Falls back to userId if no owner row.
 */
async function resolveEffectiveUserId(
	c: SubscriptionContext,
	userId: string,
	organizationId: string | null,
	resolveFromOrg: boolean,
): Promise<string> {
	if (!resolveFromOrg || !organizationId) return userId;
	const repo = new SubscriptionRepository(c.env.DB);
	const ownerUserId = await repo.getOrganizationOwnerUserId(organizationId);
	return ownerUserId ?? userId;
}

/**
 * GET /api/subscription/status
 * Get current user's subscription status.
 *
 * Query params:
 *   resolveFromOrg=true  – resolve from the active organization's owner
 *     instead of the requesting user. This ensures invited members see
 *     the org-level entitlement (owner's subscription/license).
 */
subscriptionRoutes.get("/status", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const service = createSubscriptionService(c);
	const resolveFromOrg = c.req.query("resolveFromOrg") === "true";

	const effectiveUserId = await resolveEffectiveUserId(
		c,
		user.id,
		user.organizationId,
		resolveFromOrg,
	);

	const status = await service.getUserSubscriptionStatus(effectiveUserId);

	// organizationsOwned and organizationsLimit are user-level fields: they describe
	// how many organizations the *requesting user* can create, not the org owner.
	// When resolving from the org owner, override these with the authenticated user's
	// own values so the UI correctly reflects their creation rights.
	if (resolveFromOrg && effectiveUserId !== user.id) {
		const selfStatus = await service.getUserSubscriptionStatus(user.id);
		status.organizationsOwned = selfStatus.organizationsOwned;
		status.organizationsLimit = selfStatus.organizationsLimit;
	}

	return c.json({
		success: true,
		data: status,
	});
});

/**
 * GET /api/subscription/can-create-org
 * Check if user can create a new organization
 */
subscriptionRoutes.get("/can-create-org", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const service = createSubscriptionService(c);

	let result = await service.canCreateOrganization(user.id);

	if (
		!result.allowed &&
		result.reason?.toLowerCase().includes("limit") &&
		result.reason?.toLowerCase().includes("organization")
	) {
		const overageRepo = new OverageRepository(c.env.DB);
		const row = await overageRepo.getByUserId(user.id);
		if (row?.overageEnabled) {
			result = {
				allowed: true,
				reason: result.reason,
				warning:
					"You are at your plan organization limit. Additional usage may incur charges.",
			};
		}
	}

	return c.json({
		success: true,
		data: result,
	});
});

/**
 * GET /api/subscription/usage
 * Get current organization's usage for the billing period
 */
subscriptionRoutes.get("/usage", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.organizationId) {
		return c.json({ success: false, error: "No active organization" }, 400);
	}

	const subscriptionRepo = new SubscriptionRepository(c.env.DB);
	const ownerUserId = await subscriptionRepo.getOrganizationOwnerUserId(
		user.organizationId,
	);

	if (!ownerUserId) {
		return c.json(
			{ success: false, error: "Organization owner not found" },
			404,
		);
	}

	const service = createSubscriptionService(c);

	const usage = await service.getOrCreateOrganizationUsage(
		user.organizationId,
		ownerUserId,
	);

	// Get limits from owner's subscription
	const limits = await service.getUserPlanLimits(ownerUserId);

	return c.json({
		success: true,
		data: {
			usage: {
				reports: usage.reportsUsed,
				notices: usage.noticesUsed,
				alerts: usage.alertsUsed,
				operations: usage.operationsUsed,
				clients: usage.clientsUsed,
				users: usage.usersCount,
			},
			limits: limits
				? {
						reports: limits.reportsPerMonth,
						notices: limits.noticesPerMonth,
						alerts: limits.alertsPerMonth,
						operations: limits.operationsPerMonth,
						clients: limits.clientsPerMonth,
						users: limits.usersPerOrg,
						watchlistQueriesPerMonth: limits.watchlistQueriesPerMonth,
					}
				: null,
			period: {
				start: usage.periodStart.toISOString(),
				end: usage.periodEnd.toISOString(),
			},
		},
	});
});

/**
 * GET /api/subscription/features
 * Get features available for the user's plan.
 *
 * Query params:
 *   resolveFromOrg=true  – use the active organization's owner's plan features
 *     (same semantics as GET /api/subscription/status?resolveFromOrg=true).
 */
subscriptionRoutes.get("/features", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const service = createSubscriptionService(c);
	const resolveFromOrg = c.req.query("resolveFromOrg") === "true";
	const effectiveUserId = await resolveEffectiveUserId(
		c,
		user.id,
		user.organizationId,
		resolveFromOrg,
	);

	const features = await service.getUserFeatures(effectiveUserId);

	return c.json({
		success: true,
		data: { features },
	});
});

/**
 * POST /api/subscription/ensure-customer
 * Ensure a Stripe customer exists for the user
 * This should be called before starting a subscription if the user
 * signed up before Stripe was configured or doesn't have a customer yet.
 */
subscriptionRoutes.post("/ensure-customer", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const stripe = getStripe(c);
	if (!stripe) {
		return c.json({ success: false, error: "Stripe not configured" }, 500);
	}

	const repository = new SubscriptionRepository(c.env.DB);

	try {
		// Check if user already has a Stripe customer
		const existingSubscription = await repository.getUserSubscription(user.id);

		if (existingSubscription?.stripeCustomerId) {
			// Verify the customer exists in Stripe
			try {
				const customer = await stripe.customers.retrieve(
					existingSubscription.stripeCustomerId,
				);
				if (!customer.deleted) {
					return c.json({
						success: true,
						data: {
							customerId: existingSubscription.stripeCustomerId,
							existed: true,
						},
					});
				}
			} catch {
				// Customer doesn't exist in Stripe, will create a new one
			}
		}

		// Get user details to create customer
		const userResult = await c.env.DB.prepare(
			`SELECT id, email, name FROM users WHERE id = ?`,
		)
			.bind(user.id)
			.first<{ id: string; email: string; name: string | null }>();

		if (!userResult) {
			return c.json({ success: false, error: "User not found" }, 404);
		}

		// IMPORTANT: Search for existing Stripe customer by email first
		// Email is our unique identifier since all emails are validated
		const existingCustomers = await stripe.customers.list({
			email: userResult.email,
			limit: 1,
		});

		let customer: { id: string };

		if (existingCustomers.data.length > 0) {
			// Use existing customer, update metadata if needed
			customer = existingCustomers.data[0];

			// Update the customer with current user info
			await stripe.customers.update(customer.id, {
				name: userResult.name || undefined,
				metadata: {
					userId: userResult.id,
					source: "janovix-auth",
				},
			});
		} else {
			// Create new Stripe customer only if none exists for this email
			const newCustomer = await stripe.customers.create({
				email: userResult.email,
				name: userResult.name || undefined,
				metadata: {
					userId: userResult.id,
					source: "janovix-auth",
				},
			});
			customer = newCustomer;
		}

		// Store the customer ID in a subscription record
		// Better Auth Stripe plugin expects this structure
		// Check if subscription record exists first
		const existingRecord = await c.env.DB.prepare(
			`SELECT id FROM subscription WHERE referenceId = ? LIMIT 1`,
		)
			.bind(userResult.id)
			.first<{ id: string }>();

		if (existingRecord) {
			// Update existing record with customer ID
			await c.env.DB.prepare(
				`UPDATE subscription SET stripeCustomerId = ?, updatedAt = datetime('now') WHERE id = ?`,
			)
				.bind(customer.id, existingRecord.id)
				.run();
		} else {
			// Create new subscription record with customer ID
			await c.env.DB.prepare(
				`INSERT INTO subscription (id, plan, referenceId, stripeCustomerId, status, createdAt, updatedAt)
				 VALUES (?, 'none', ?, ?, 'incomplete', datetime('now'), datetime('now'))`,
			)
				.bind(crypto.randomUUID(), userResult.id, customer.id)
				.run();
		}

		return c.json({
			success: true,
			data: { customerId: customer.id, existed: false },
		});
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: "stripe-ensure-customer" },
		});
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to create customer",
			},
			500,
		);
	}
});

/**
 * GET /api/subscription/onboarding-status
 * Get user's onboarding status - profile completion and organization access
 * Used by middleware to determine if user needs onboarding.
 *
 * Query params:
 *   pendingInvitationsOnly=true  — skip the expensive subscription/Stripe checks
 *                                  and return only the pending invitations array.
 *                                  Use this for UI badge counts to avoid 7-9 DB
 *                                  queries + a potential Stripe API call.
 */
subscriptionRoutes.get("/onboarding-status", async (c) => {
	try {
		const { auth } = await getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session?.user) {
			return c.json({ success: false, error: "Unauthorized" }, 401);
		}

		const user = session.user as {
			id: string;
			name: string | null;
			image?: string | null;
			role?: string;
		};

		// Fast path: caller only needs the pending invitations list (e.g. sidebar badge).
		// Skip the expensive subscription / Stripe checks entirely.
		const pendingInvitationsOnly =
			c.req.query("pendingInvitationsOnly") === "true";

		// Check if profile is complete (has name)
		const hasName = !!user.name && user.name.trim().length > 0;

		// Check for ALL pending invitations (not just one)
		const pendingInvitationsResult = await c.env.DB.prepare(
			`SELECT i.id, i.organizationId, i.role, i.expiresAt, i.inviterId,
			        o.name as organizationName, o.logo as organizationLogo,
			        u.name as inviterName, u.email as inviterEmail
			 FROM invitations i
			 JOIN organizations o ON i.organizationId = o.id
			 LEFT JOIN users u ON i.inviterId = u.id
			 WHERE i.email = (SELECT email FROM users WHERE id = ?)
			   AND i.status = 'pending'
			   AND (i.expiresAt IS NULL OR datetime(i.expiresAt) > datetime('now'))
			 ORDER BY i.createdAt DESC`,
		)
			.bind(user.id)
			.all<{
				id: string;
				organizationId: string;
				role: string;
				expiresAt: string | null;
				inviterId: string;
				organizationName: string;
				organizationLogo: string | null;
				inviterName: string | null;
				inviterEmail: string | null;
			}>();

		const pendingInvitations = pendingInvitationsResult.results || [];

		// Map invitations once — used in both fast and slow paths
		const mappedInvitations = pendingInvitations.map((inv) => ({
			id: inv.id,
			organizationId: inv.organizationId,
			organizationName: inv.organizationName,
			organizationLogo: inv.organizationLogo,
			role: inv.role,
			inviterName: inv.inviterName,
			inviterEmail: inv.inviterEmail,
			expiresAt: inv.expiresAt,
		}));

		// Fast path: return only the invitations without any subscription/Stripe work
		if (pendingInvitationsOnly) {
			return c.json({
				success: true,
				data: {
					profileComplete: hasName,
					hasOrganization: false,
					hasSubscription: false,
					subscriptionStatus: null,
					plan: null,
					pendingInvitation: mappedInvitations[0] || null,
					pendingInvitations: mappedInvitations,
					canCreateOrganization: false,
					role: null,
					isVisitor: false,
				},
			});
		}

		// Slow path: full onboarding status including subscription and org checks

		// Query the database directly for the current user role
		// (Session may have stale role if user.create.after hook just updated it)
		const dbUser = await c.env.DB.prepare(`SELECT role FROM users WHERE id = ?`)
			.bind(user.id)
			.first<{ role: string }>();

		const userRole = dbUser?.role ?? "user";

		// Check if user has any organization membership (owner, admin, or member)
		const orgMembership = await c.env.DB.prepare(
			`SELECT COUNT(*) as count FROM members WHERE userId = ?`,
		)
			.bind(user.id)
			.first<{ count: number }>();

		const hasOrganization = (orgMembership?.count ?? 0) > 0;

		// Get subscription status to determine if user can create org
		const stripe = getStripe(c);
		const repository = new SubscriptionRepository(c.env.DB);
		const pricingRepository = new PricingRepository(c.env.DB);
		const service = new SubscriptionService(
			repository,
			stripe,
			pricingRepository,
		);
		const subscriptionStatus = await service.getUserSubscriptionStatus(user.id);

		// Verify against Stripe directly if we have a Stripe-based subscription.
		// subscriptionStatus.stripeSubscriptionId is populated by the service from the
		// same DB record it already fetched, so no extra getUserSubscription() call needed.
		if (
			stripe &&
			subscriptionStatus.stripeSubscriptionId &&
			!subscriptionStatus.isLicenseBased
		) {
			try {
				const stripeSub = await stripe.subscriptions.retrieve(
					subscriptionStatus.stripeSubscriptionId,
				);

				// If out of sync, report to Sentry
				if (stripeSub.status !== subscriptionStatus.status) {
					Sentry.captureMessage(
						"Subscription status mismatch between Stripe and DB",
						{
							level: "warning",
							tags: { context: "subscription-status-mismatch" },
							extra: {
								stripeStatus: stripeSub.status,
								dbStatus: subscriptionStatus.status,
								subscriptionId: subscriptionStatus.stripeSubscriptionId,
							},
						},
					);
				}
			} catch (stripeError) {
				Sentry.captureException(stripeError, {
					tags: { context: "stripe-verification-failed" },
					extra: {
						subscriptionId: subscriptionStatus.stripeSubscriptionId,
					},
				});
			}
		}

		// Check if subscription is in a valid status for creating organizations
		// Only 'active' or 'trialing' status allows org creation - 'incomplete' does NOT
		const isSubscriptionValid =
			subscriptionStatus.hasSubscription &&
			(subscriptionStatus.status === "active" ||
				subscriptionStatus.status === "trialing");

		// Can create org only if subscription is valid AND within org limit
		// 0 means unlimited -- no limit check needed
		const canCreateOrg =
			isSubscriptionValid &&
			(subscriptionStatus.organizationsLimit === 0 ||
				subscriptionStatus.organizationsOwned <
					subscriptionStatus.organizationsLimit);

		// userRole is already queried from DB above (to avoid stale session role)
		const isVisitor = userRole === "visitor";

		return c.json({
			success: true,
			data: {
				profileComplete: hasName,
				hasOrganization,
				// Only report hasSubscription=true if subscription is in valid status
				hasSubscription: isSubscriptionValid,
				subscriptionStatus: subscriptionStatus.status,
				plan: subscriptionStatus.plan,
				// License info
				isLicenseBased: subscriptionStatus.isLicenseBased,
				// Keep pendingInvitation for backward compatibility (first invitation)
				pendingInvitation: mappedInvitations[0] || null,
				// New field: all pending invitations
				pendingInvitations: mappedInvitations,
				canCreateOrganization: canCreateOrg,
				// User role for beta access flow
				role: userRole,
				isVisitor,
			},
		});
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: "onboarding-status-error" },
		});
		return c.json(
			{ success: false, error: "Failed to get onboarding status" },
			500,
		);
	}
});

/**
 * POST /api/subscription/license/validate
 * Validate a license key
 */
subscriptionRoutes.post("/license/validate", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const body = await c.req.json<{ key: string }>();
	if (!body.key) {
		return c.json({ success: false, error: "License key is required" }, 400);
	}

	const key = body.key.trim().toUpperCase();

	// Use pricing service to validate license
	const pricingRepository = new PricingRepository(c.env.DB);
	const pricingService = new PricingService(pricingRepository);

	const validation = await pricingService.validateLicenseKey(key);

	if (!validation.valid || !validation.license) {
		return c.json(
			{
				success: false,
				error: validation.error || "Invalid or expired license key",
			},
			400,
		);
	}

	const license = validation.license;

	// License is self-contained -- limits come directly from the license
	const limits = await pricingService.getEffectiveLimitsForLicense(license.id);

	return c.json({
		success: true,
		data: {
			key: license.key,
			organizationName: license.organizationName,
			plan: "Enterprise License",
			expiresAt: license.expiresAt?.toISOString() ?? null,
			limits: limits
				? {
						maxOrganizations: limits.maxOrganizations,
						maxUsers: limits.usersPerOrg,
						reportsPerMonth: limits.reportsPerMonth,
						noticesPerMonth: limits.noticesPerMonth,
						alertsPerMonth: limits.alertsPerMonth,
						operationsPerMonth: limits.operationsPerMonth,
						clientsPerMonth: limits.clientsPerMonth,
						watchlistQueriesPerMonth: limits.watchlistQueriesPerMonth,
					}
				: null,
			isActive: license.status === "active",
		},
	});
});

/**
 * POST /api/subscription/license/activate
 * Activate a license key for the current user.
 *
 * If the user has an active Stripe subscription it is cancelled immediately.
 * If the user has a previous active license it is superseded.
 */
subscriptionRoutes.post("/license/activate", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const body = await c.req.json<{ key: string }>();
	if (!body.key) {
		return c.json({ success: false, error: "License key is required" }, 400);
	}

	const key = body.key.trim().toUpperCase();

	// Use pricing service to activate license
	const pricingRepository = new PricingRepository(c.env.DB);
	const pricingService = new PricingService(pricingRepository);

	const activation = await pricingService.activateLicense(key, user.id);

	if (!activation.success || !activation.license) {
		return c.json(
			{
				success: false,
				error: activation.error || "Failed to activate license",
			},
			400,
		);
	}

	const license = activation.license;

	// ---------- Fetch full existing subscription record ----------
	const existingSubscription = await c.env.DB.prepare(
		`SELECT id, stripeSubscriptionId, stripeCustomerId, status, plan, licenseId
		 FROM subscription WHERE referenceId = ? LIMIT 1`,
	)
		.bind(user.id)
		.first<{
			id: string;
			stripeSubscriptionId: string | null;
			stripeCustomerId: string | null;
			status: string | null;
			plan: string;
			licenseId: string | null;
		}>();

	let previousPlanCancelled = false;
	let previousPlan: string | null = null;

	if (existingSubscription) {
		// ---------- Cancel active Stripe subscription ----------
		if (
			existingSubscription.stripeSubscriptionId &&
			existingSubscription.status &&
			["active", "trialing"].includes(existingSubscription.status)
		) {
			const stripe = getStripe(c);
			if (stripe) {
				try {
					await stripe.subscriptions.cancel(
						existingSubscription.stripeSubscriptionId,
					);
					previousPlanCancelled = true;
					previousPlan = existingSubscription.plan;
				} catch (stripeErr) {
					// Graceful degradation: report but continue activating the license
					Sentry.captureException(stripeErr, {
						tags: { context: "license-cancel-stripe-failed" },
						extra: {
							subscriptionId: existingSubscription.stripeSubscriptionId,
						},
					});
					// Still mark as cancelled from our side
					previousPlanCancelled = true;
					previousPlan = existingSubscription.plan;
				}
			}
		}

		// ---------- Supersede previous license ----------
		if (
			existingSubscription.licenseId &&
			existingSubscription.licenseId !== license.id
		) {
			try {
				await pricingRepository.supersedeLicense(
					existingSubscription.licenseId,
				);
			} catch (err) {
				Sentry.captureException(err, {
					tags: { context: "license-supersede-failed" },
					extra: { licenseId: existingSubscription.licenseId },
				});
			}
		}

		// ---------- Update subscription record cleanly ----------
		await c.env.DB.prepare(
			`UPDATE subscription
			 SET plan = 'enterprise',
			     status = 'active',
			     licenseId = ?,
			     stripeSubscriptionId = NULL,
			     cancelAtPeriodEnd = 0,
			     canceledAt = CASE WHEN ? THEN datetime('now') ELSE canceledAt END,
			     updatedAt = datetime('now')
			 WHERE id = ?`,
		)
			.bind(license.id, previousPlanCancelled ? 1 : 0, existingSubscription.id)
			.run();
	} else {
		// ---------- No existing record – create one ----------
		await c.env.DB.prepare(
			`INSERT INTO subscription (id, plan, referenceId, status, licenseId, createdAt, updatedAt)
			 VALUES (?, 'enterprise', ?, 'active', ?, datetime('now'), datetime('now'))`,
		)
			.bind(crypto.randomUUID(), user.id, license.id)
			.run();
	}

	// Get effective limits for the response
	const limits = await pricingService.getEffectiveLimitsForLicense(license.id);

	return c.json({
		success: true,
		data: {
			message: "License activated successfully",
			plan: "Enterprise License",
			organizationName: license.organizationName,
			previousPlanCancelled,
			previousPlan,
			limits: limits
				? {
						maxOrganizations: limits.maxOrganizations,
						maxUsers: limits.usersPerOrg,
						reportsPerMonth: limits.reportsPerMonth,
						noticesPerMonth: limits.noticesPerMonth,
						alertsPerMonth: limits.alertsPerMonth,
						operationsPerMonth: limits.operationsPerMonth,
						clientsPerMonth: limits.clientsPerMonth,
						watchlistQueriesPerMonth: limits.watchlistQueriesPerMonth,
					}
				: null,
		},
	});
});

/**
 * POST /api/subscription/portal
 * Create a Stripe Customer Portal session with proper return URL
 * This is used for plan changes, billing management, and cancellation
 */
subscriptionRoutes.post("/portal", async (c) => {
	try {
		const { auth } = await getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session?.user) {
			return c.json({ success: false, error: "Unauthorized" }, 401);
		}

		const user = session.user as { id: string; email: string };

		const body = await c.req.json<{ returnUrl: string }>().catch(() => ({}));
		const returnUrl = (body as { returnUrl?: string })?.returnUrl;

		if (!returnUrl) {
			return c.json({ success: false, error: "Missing returnUrl" }, 400);
		}

		// Check if user has a license-based subscription (no Stripe portal for enterprise licenses)
		const licenseCheck = await c.env.DB.prepare(
			`SELECT licenseId FROM subscription 
			 WHERE referenceId = ? AND licenseId IS NOT NULL AND status = 'active'
			 LIMIT 1`,
		)
			.bind(user.id)
			.first<{ licenseId: string }>();

		if (licenseCheck?.licenseId) {
			return c.json(
				{
					success: false,
					error: "Enterprise license subscriptions are managed outside Stripe",
				},
				400,
			);
		}

		const stripe = getStripe(c);

		if (!stripe) {
			return c.json({ success: false, error: "Stripe not configured" }, 500);
		}

		// Get user's Stripe customer ID from subscription record
		const subscription = await c.env.DB.prepare(
			`SELECT stripeCustomerId FROM subscription 
			 WHERE referenceId = ? AND stripeCustomerId IS NOT NULL 
			 ORDER BY updatedAt DESC LIMIT 1`,
		)
			.bind(user.id)
			.first<{ stripeCustomerId: string }>();

		if (!subscription?.stripeCustomerId) {
			return c.json({ success: false, error: "No Stripe customer found" }, 404);
		}

		// Create Customer Portal session
		const portalSession = await stripe.billingPortal.sessions.create({
			customer: subscription.stripeCustomerId,
			return_url: returnUrl,
		});

		return c.json({
			success: true,
			data: { url: portalSession.url },
		});
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: "portal-session-error" },
		});
		return c.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to create portal session",
			},
			500,
		);
	}
});

/**
 * POST /api/subscription/usage/report
 * Report usage increment (internal use by other services)
 */
/**
 * GET /api/subscription/overage-settings
 */
subscriptionRoutes.get("/overage-settings", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const repo = new OverageRepository(c.env.DB);
	const row = await repo.getByUserId(user.id);

	return c.json({
		success: true,
		data: row
			? {
					overageEnabled: row.overageEnabled,
					spendLimitCents: row.spendLimitCents,
					spendLimitCurrency: row.spendLimitCurrency,
					periodOverageChargeCents: row.periodOverageChargeCents,
				}
			: {
					overageEnabled: false,
					spendLimitCents: null,
					spendLimitCurrency: "MXN",
					periodOverageChargeCents: 0,
				},
	});
});

/**
 * PUT /api/subscription/overage-settings
 */
subscriptionRoutes.put("/overage-settings", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const body = await c.req.json<{
		overageEnabled?: boolean;
		spendLimitCents?: number | null;
		spendLimitCurrency?: string;
	}>();

	const repo = new OverageRepository(c.env.DB);
	const row = await repo.upsert({
		userId: user.id,
		overageEnabled: body.overageEnabled,
		spendLimitCents: body.spendLimitCents,
		spendLimitCurrency: body.spendLimitCurrency,
	});

	return c.json({
		success: true,
		data: {
			overageEnabled: row.overageEnabled,
			spendLimitCents: row.spendLimitCents,
			spendLimitCurrency: row.spendLimitCurrency,
			periodOverageChargeCents: row.periodOverageChargeCents,
		},
	});
});

/**
 * GET /api/subscription/usage-details
 * Usage for active org + owner limits + overage accumulator (for billing UI).
 */
subscriptionRoutes.get("/usage-details", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}
	if (!user.organizationId) {
		return c.json({ success: false, error: "No active organization" }, 400);
	}

	const subscriptionRepo = new SubscriptionRepository(c.env.DB);
	const ownerUserId = await subscriptionRepo.getOrganizationOwnerUserId(
		user.organizationId,
	);
	if (!ownerUserId) {
		return c.json(
			{ success: false, error: "Organization owner not found" },
			404,
		);
	}

	if (user.id !== ownerUserId) {
		return c.json(
			{
				success: false,
				error: "forbidden",
				message:
					"Only the organization owner can view usage details for billing.",
			},
			403,
		);
	}

	const service = createSubscriptionService(c);
	const usage = await service.getOrCreateOrganizationUsage(
		user.organizationId,
		ownerUserId,
	);
	const limits = await service.getUserPlanLimits(ownerUserId);

	const overageRepo = new OverageRepository(c.env.DB);
	const overageRow = await overageRepo.getByUserId(ownerUserId);

	const usageRightsRepo = new UsageRightsRepository(c.env.DB);
	const periodStartStr = usage.periodStart.toISOString().slice(0, 10);
	const periodEndStr = usage.periodEnd.toISOString().slice(0, 10);
	const watchlistQueriesUsed =
		await usageRightsRepo.getMonthlyWatchlistQueriesUsed(
			user.organizationId,
			periodStartStr,
			periodEndStr,
		);

	const subStatus = await service.getUserSubscriptionStatus(ownerUserId);
	const pricingService = new PricingService(new PricingRepository(c.env.DB));

	let overagePricing: {
		reports: { unitCents: number; currency: string } | null;
		notices: { unitCents: number; currency: string } | null;
		alerts: { unitCents: number; currency: string } | null;
		operations: { unitCents: number; currency: string } | null;
		clients: { unitCents: number; currency: string } | null;
		seat: {
			unitCents: number;
			currency: string;
			interval: string;
		} | null;
	} | null = null;

	if (
		subStatus.hasSubscription &&
		!subStatus.isLicenseBased &&
		subStatus.plan
	) {
		const planName = subStatus.plan;
		const [
			reportsRow,
			noticesRow,
			alertsRow,
			operationsRow,
			clientsRow,
			seatRow,
		] = await Promise.all([
			pricingService.getOveragePlanPriceForMetric(planName, "reports"),
			pricingService.getOveragePlanPriceForMetric(planName, "notices"),
			pricingService.getOveragePlanPriceForMetric(planName, "alerts"),
			pricingService.getOveragePlanPriceForMetric(planName, "operations"),
			pricingService.getOveragePlanPriceForMetric(planName, "clients"),
			pricingService.getSeatPriceForPlan(planName),
		]);
		const unit = (row: { amount: number; currency: string } | null) =>
			row ? { unitCents: row.amount, currency: row.currency } : null;
		overagePricing = {
			reports: unit(reportsRow),
			notices: unit(noticesRow),
			alerts: unit(alertsRow),
			operations: unit(operationsRow),
			clients: unit(clientsRow),
			seat: seatRow
				? {
						unitCents: seatRow.amount,
						currency: seatRow.currency,
						interval: seatRow.interval ?? "month",
					}
				: null,
		};
	}

	return c.json({
		success: true,
		data: {
			usage: {
				reports: usage.reportsUsed,
				notices: usage.noticesUsed,
				alerts: usage.alertsUsed,
				operations: usage.operationsUsed,
				clients: usage.clientsUsed,
				users: usage.usersCount,
				watchlistQueries: watchlistQueriesUsed,
			},
			limits: limits
				? {
						reports: limits.reportsPerMonth,
						notices: limits.noticesPerMonth,
						alerts: limits.alertsPerMonth,
						operations: limits.operationsPerMonth,
						clients: limits.clientsPerMonth,
						users: limits.usersPerOrg,
						watchlistQueriesPerMonth: limits.watchlistQueriesPerMonth,
						maxOrganizations: limits.maxOrganizations,
					}
				: null,
			period: {
				start: usage.periodStart.toISOString(),
				end: usage.periodEnd.toISOString(),
			},
			overage: overageRow
				? {
						enabled: overageRow.overageEnabled,
						spendLimitCents: overageRow.spendLimitCents,
						periodChargeCents: overageRow.periodOverageChargeCents,
						currency: overageRow.spendLimitCurrency,
					}
				: {
						enabled: false,
						spendLimitCents: null,
						periodChargeCents: 0,
						currency: "MXN",
					},
			overagePricing,
		},
	});
});

/**
 * POST /api/subscription/prepare-downgrade
 * Returns owned orgs and whether they fit target plan limits (for DowngradeWizard).
 */
subscriptionRoutes.post("/prepare-downgrade", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const body = await c.req.json<{ targetPlan: string }>();
	if (!body?.targetPlan?.trim()) {
		return c.json({ success: false, error: "targetPlan is required" }, 400);
	}

	const pricingService = new PricingService(new PricingRepository(c.env.DB));
	const targetLimits = await pricingService.getLimitsByPlanName(
		body.targetPlan,
	);
	if (!targetLimits) {
		return c.json({ success: false, error: "Unknown target plan" }, 400);
	}

	const rows = await c.env.DB.prepare(
		`SELECT o.id, o.name, o.status,
			(SELECT COUNT(*) FROM members m WHERE m.organizationId = o.id) AS memberCount
		 FROM members me
		 JOIN organizations o ON o.id = me.organizationId
		 WHERE me.userId = ? AND me.role = 'owner'
		 ORDER BY o.createdAt ASC`,
	)
		.bind(user.id)
		.all<{
			id: string;
			name: string;
			status: string;
			memberCount: number;
		}>();

	const owned = rows.results ?? [];
	const activeOwned = owned.filter((o) => o.status === "active");
	const maxOrgs = targetLimits.maxOrganizations;
	const usersCap = targetLimits.usersPerOrg;

	const excessOrgSlots =
		maxOrgs === 0 ? 0 : Math.max(0, activeOwned.length - maxOrgs);

	const organizations = activeOwned.map((o) => ({
		id: o.id,
		name: o.name,
		status: o.status,
		memberCount: o.memberCount,
		exceedsUsersPerOrgAfterDowngrade:
			usersCap > 0 ? o.memberCount > usersCap : false,
	}));

	const seatPriceRow = await pricingService.getSeatPriceForPlan(
		body.targetPlan,
	);
	const seatPrice = seatPriceRow
		? {
				amountCents: seatPriceRow.amount,
				currency: seatPriceRow.currency,
				interval: seatPriceRow.interval ?? "month",
			}
		: null;

	return c.json({
		success: true,
		data: {
			targetPlan: body.targetPlan,
			targetLimits: {
				maxOrganizations: targetLimits.maxOrganizations,
				usersPerOrg: targetLimits.usersPerOrg,
			},
			activeOrganizationCount: activeOwned.length,
			excessOrganizationSlots: excessOrgSlots,
			organizations,
			seatPrice,
		},
	});
});

/**
 * POST /api/subscription/downgrade/archive-organizations
 * Archives selected owned orgs before client completes plan downgrade via Stripe.
 */
subscriptionRoutes.post("/downgrade/archive-organizations", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const body = await c.req.json<{ organizationIds?: string[] }>();
	const ids = body.organizationIds ?? [];
	if (!Array.isArray(ids) || ids.length === 0) {
		return c.json(
			{ success: false, error: "organizationIds must be a non-empty array" },
			400,
		);
	}

	for (const organizationId of ids) {
		const row = await c.env.DB.prepare(
			`SELECT 1 FROM members WHERE organizationId = ? AND userId = ? AND role = 'owner'`,
		)
			.bind(organizationId, user.id)
			.first();

		if (!row) {
			return c.json(
				{
					success: false,
					error: `Not owner of organization ${organizationId}`,
				},
				403,
			);
		}

		await c.env.DB.prepare(
			`UPDATE organizations SET status = 'archived', archivedAt = datetime('now'), archivedReason = ?, updatedAt = datetime('now') WHERE id = ?`,
		)
			.bind("downgrade", organizationId)
			.run();
	}

	return c.json({ success: true, data: { archivedIds: ids } });
});

subscriptionRoutes.post("/usage/report", async (c) => {
	// This endpoint is for internal service-to-service calls
	// Verify internal token
	const internalToken = c.req.header("X-Internal-Token");
	if (
		c.env.AUTH_INTERNAL_TOKEN &&
		internalToken !== c.env.AUTH_INTERNAL_TOKEN
	) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const body = await c.req.json<{
		organizationId: string;
		metric: "reports" | "notices" | "alerts" | "operations" | "clients";
		count?: number;
	}>();

	if (!body.organizationId || !body.metric) {
		return c.json({ success: false, error: "Missing required fields" }, 400);
	}

	const service = createSubscriptionService(c);

	await service.reportUsage(body.organizationId, body.metric, body.count ?? 1);

	return c.json({
		success: true,
		message: "Usage reported",
	});
});

export { subscriptionRoutes };
