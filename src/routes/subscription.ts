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
import type { Bindings } from "../types/bindings";
import {
	SubscriptionRepository,
	SubscriptionService,
} from "../domain/subscription";
import { PricingRepository, PricingService } from "../domain/pricing";
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
 * GET /api/subscription/status
 * Get current user's subscription status
 */
subscriptionRoutes.get("/status", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const service = createSubscriptionService(c);

	const status = await service.getUserSubscriptionStatus(user.id);

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

	const result = await service.canCreateOrganization(user.id);

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

	// Get org owner
	const ownerResult = await c.env.DB.prepare(
		`SELECT userId FROM members WHERE organizationId = ? AND role = 'owner' LIMIT 1`,
	)
		.bind(user.organizationId)
		.first<{ userId: string }>();

	if (!ownerResult) {
		return c.json(
			{ success: false, error: "Organization owner not found" },
			404,
		);
	}

	const service = createSubscriptionService(c);

	const usage = await service.getOrCreateOrganizationUsage(
		user.organizationId,
		ownerResult.userId,
	);

	// Get limits from owner's subscription
	const limits = await service.getUserPlanLimits(ownerResult.userId);

	return c.json({
		success: true,
		data: {
			usage: {
				reports: usage.reportsUsed,
				notices: usage.noticesUsed,
				alerts: usage.alertsUsed,
				transactions: usage.transactionsUsed,
				clients: usage.clientsUsed,
				users: usage.usersCount,
			},
			limits: limits
				? {
						reports: limits.reportsPerMonth,
						notices: limits.noticesPerMonth,
						alerts: limits.alertsPerMonth,
						transactions: limits.transactionsPerMonth,
						clients: limits.clientsPerMonth,
						users: limits.usersPerOrg,
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
 * Get features available for the user's plan
 */
subscriptionRoutes.get("/features", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	const service = createSubscriptionService(c);

	const features = await service.getUserFeatures(user.id);

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
				console.log(
					`[Stripe] Customer ${existingSubscription.stripeCustomerId} not found in Stripe, creating new`,
				);
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
			console.log(
				`[Stripe] Found existing customer ${customer.id} for email ${userResult.email}`,
			);

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
			console.log(
				`[Stripe] Created new customer ${customer.id} for email ${userResult.email}`,
			);
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

		console.log(
			`[Stripe] Created customer ${customer.id} for user ${userResult.id}`,
		);

		return c.json({
			success: true,
			data: { customerId: customer.id, existed: false },
		});
	} catch (error) {
		console.error("[Stripe] Error ensuring customer:", error);
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
 * Used by middleware to determine if user needs onboarding
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
		};

		// Check if profile is complete (has name)
		const hasName = !!user.name && user.name.trim().length > 0;

		// Check if user has any organization membership (owner, admin, or member)
		const orgMembership = await c.env.DB.prepare(
			`SELECT COUNT(*) as count FROM members WHERE userId = ?`,
		)
			.bind(user.id)
			.first<{ count: number }>();

		const hasOrganization = (orgMembership?.count ?? 0) > 0;

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

		// Also get raw DB record for debugging
		const dbSubscription = await repository.getUserSubscription(user.id);

		// Debug: Log LOCAL DB subscription data
		console.log(
			"[Onboarding Status] LOCAL DB subscription record:",
			dbSubscription
				? {
						id: dbSubscription.id,
						plan: dbSubscription.plan,
						status: dbSubscription.status,
						stripeSubscriptionId: dbSubscription.stripeSubscriptionId,
						stripeCustomerId: dbSubscription.stripeCustomerId,
						periodStart: dbSubscription.periodStart?.toISOString(),
						periodEnd: dbSubscription.periodEnd?.toISOString(),
						cancelAtPeriodEnd: dbSubscription.cancelAtPeriodEnd,
					}
				: "NO SUBSCRIPTION RECORD IN DB",
		);

		// Verify against Stripe directly if we have a subscription
		let stripeVerification: { status: string; plan?: string } | null = null;
		if (stripe && dbSubscription?.stripeSubscriptionId) {
			try {
				const stripeSub = await stripe.subscriptions.retrieve(
					dbSubscription.stripeSubscriptionId,
				);
				stripeVerification = {
					status: stripeSub.status,
					plan:
						typeof stripeSub.items.data[0]?.price?.lookup_key === "string"
							? stripeSub.items.data[0].price.lookup_key
							: stripeSub.items.data[0]?.price?.id,
				};
				console.log("[Onboarding Status] STRIPE DIRECT verification:", {
					stripeSubscriptionId: dbSubscription.stripeSubscriptionId,
					stripeStatus: stripeSub.status,
					stripePlan: stripeVerification.plan,
					localStatus: dbSubscription.status,
					localPlan: dbSubscription.plan,
					IN_SYNC: stripeSub.status === dbSubscription.status,
				});

				// If out of sync, log a warning
				if (stripeSub.status !== dbSubscription.status) {
					console.warn(
						"[Onboarding Status] ⚠️ STATUS MISMATCH! Stripe says:",
						stripeSub.status,
						"but DB says:",
						dbSubscription.status,
					);
				}
			} catch (stripeError) {
				console.error(
					"[Onboarding Status] Failed to verify with Stripe:",
					stripeError,
				);
			}
		}

		// Check if subscription is in a valid status for creating organizations
		// Only 'active' or 'trialing' status allows org creation - 'incomplete' does NOT
		const isSubscriptionValid =
			subscriptionStatus.hasSubscription &&
			(subscriptionStatus.status === "active" ||
				subscriptionStatus.status === "trialing");

		// Can create org only if subscription is valid AND within org limit
		const canCreateOrg =
			isSubscriptionValid &&
			subscriptionStatus.organizationsOwned <
				subscriptionStatus.organizationsLimit;

		// Debug: Log computed subscription status
		console.log("[Onboarding Status] Computed subscription status:", {
			userId: user.id,
			hasSubscription: subscriptionStatus.hasSubscription,
			status: subscriptionStatus.status,
			isSubscriptionValid,
			plan: subscriptionStatus.plan,
			organizationsOwned: subscriptionStatus.organizationsOwned,
			organizationsLimit: subscriptionStatus.organizationsLimit,
			hasOrganization,
			profileComplete: hasName,
			canCreateOrganization: canCreateOrg,
			stripeVerification,
		});

		// Map invitations to response format
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

		return c.json({
			success: true,
			data: {
				profileComplete: hasName,
				hasOrganization,
				// Only report hasSubscription=true if subscription is in valid status
				hasSubscription: isSubscriptionValid,
				subscriptionStatus: subscriptionStatus.status,
				plan: subscriptionStatus.plan,
				// Keep pendingInvitation for backward compatibility (first invitation)
				pendingInvitation: mappedInvitations[0] || null,
				// New field: all pending invitations
				pendingInvitations: mappedInvitations,
				canCreateOrganization: canCreateOrg,
			},
		});
	} catch (error) {
		console.error("[Onboarding Status] Error:", error);
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

	// Get plan name
	const plan = await pricingService.getPlanById(license.planId);
	const limits = await pricingService.getEffectiveLimitsForLicense(license.id);

	return c.json({
		success: true,
		data: {
			key: license.key,
			organizationName: license.organizationName,
			plan: plan?.displayName || plan?.name || license.planId,
			expiresAt: license.expiresAt?.toISOString() ?? null,
			limits: limits
				? {
						maxOrganizations: limits.maxOrganizations,
						maxUsers: limits.usersPerOrg,
						reportsIncluded: limits.reportsPerMonth,
						noticesIncluded: limits.noticesPerMonth,
						alertsIncluded: limits.alertsPerMonth,
						transactionsIncluded: limits.transactionsPerMonth,
						clientsIncluded: limits.clientsPerMonth,
					}
				: null,
			isActive: license.status === "active",
		},
	});
});

/**
 * POST /api/subscription/license/activate
 * Activate a license key for the current user
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

	// Get plan info
	const plan = await pricingService.getPlanById(license.planId);

	// Create or update user subscription based on license
	const existingSubscription = await c.env.DB.prepare(
		`SELECT id FROM subscription WHERE referenceId = ? LIMIT 1`,
	)
		.bind(user.id)
		.first<{ id: string }>();

	// Use plan name for the subscription
	const planName = plan?.name || license.planId;

	if (existingSubscription) {
		await c.env.DB.prepare(
			`UPDATE subscription
			 SET plan = ?, status = 'active', licenseId = ?, updatedAt = datetime('now')
			 WHERE id = ?`,
		)
			.bind(planName, license.id, existingSubscription.id)
			.run();
	} else {
		await c.env.DB.prepare(
			`INSERT INTO subscription (id, plan, referenceId, status, licenseId, createdAt, updatedAt)
			 VALUES (?, ?, ?, 'active', ?, datetime('now'), datetime('now'))`,
		)
			.bind(crypto.randomUUID(), planName, user.id, license.id)
			.run();
	}

	console.log(`[License] Activated license ${license.id} for user ${user.id}`);

	// Get effective limits for the response
	const limits = await pricingService.getEffectiveLimitsForLicense(license.id);

	return c.json({
		success: true,
		data: {
			message: "License activated successfully",
			plan: plan?.displayName || planName,
			organizationName: license.organizationName,
			limits: limits
				? {
						maxOrganizations: limits.maxOrganizations,
						maxUsers: limits.usersPerOrg,
						reportsIncluded: limits.reportsPerMonth,
						noticesIncluded: limits.noticesPerMonth,
						alertsIncluded: limits.alertsPerMonth,
						transactionsIncluded: limits.transactionsPerMonth,
						clientsIncluded: limits.clientsPerMonth,
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
		console.error("[Portal Session] Error:", error);
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
		metric: "reports" | "notices" | "alerts" | "transactions" | "clients";
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
