import type { BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import { emailOTP, openAPI, captcha } from "better-auth/plugins";
import { markOtpSent } from "./routes";
import { stripe } from "@better-auth/stripe";
import Stripe from "stripe";

import type { Bindings, JanovixEnvironment } from "../types/bindings";
import {
	sendOtpEmail,
	sendOrganizationInvitationEmail,
} from "../utils/mandrill";

// ============================================================================
// Subscription Plan Limits (User-based billing)
// ============================================================================
// NOTE: Database (plan_limits table) is the source of truth for limits.
// This constant serves as a fallback when PricingService is unavailable.
// Keep in sync with seed-plans.mjs - last updated January 2026.
//
// Plan naming convention:
// - watchlist: Watchlist-only access (no AML)
// - aml_*: AML plans (includes Watchlist access)
//
// - All per-month metrics: Metered billing via Stripe Usage Records
// - usersPerOrg: Seat-based billing via Stripe subscription quantity
// - Seats are aggregated across all owned organizations (per-org calculation)
// - watchlistQueriesPerDay: Per user per day limit for watchlist queries

export const PLAN_LIMITS = {
	watchlist: {
		maxOrganizations: 1,
		usersPerOrg: 3,
		reportsPerMonth: 0,
		noticesPerMonth: 0,
		alertsPerMonth: 0,
		transactionsPerMonth: 0,
		clientsPerMonth: 0,
		watchlistQueriesPerDay: 50,
	},
	business: {
		maxOrganizations: 1,
		usersPerOrg: 2,
		reportsPerMonth: 1,
		noticesPerMonth: 2,
		alertsPerMonth: 20,
		transactionsPerMonth: 50,
		clientsPerMonth: 25,
		watchlistQueriesPerDay: 50,
	},
	pro: {
		maxOrganizations: 3,
		usersPerOrg: 10,
		reportsPerMonth: 15,
		noticesPerMonth: 20,
		alertsPerMonth: 100,
		transactionsPerMonth: 500,
		clientsPerMonth: 250,
		watchlistQueriesPerDay: 200,
	},
	ultra: {
		maxOrganizations: 10,
		usersPerOrg: 20,
		reportsPerMonth: 100,
		noticesPerMonth: 100,
		alertsPerMonth: 500,
		transactionsPerMonth: 2000,
		clientsPerMonth: 1000,
		watchlistQueriesPerDay: 500,
	},
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

const BASE_PATH = "/api/auth";
const ORG_SLUG = "janovix";

const ENVIRONMENT_MAP: Record<string, JanovixEnvironment> = {
	dev: "dev",
	development: "dev",
	qa: "qa",
	test: "test",
	testing: "test",
	prod: "production",
	production: "production",
	preview: "preview",
	local: "local",
};

const RATE_LIMITS: Record<
	JanovixEnvironment,
	{ window: number; max: number; enabled: boolean }
> = {
	local: { window: 10, max: 300, enabled: false },
	preview: { window: 10, max: 120, enabled: true },
	dev: { window: 10, max: 90, enabled: true },
	qa: { window: 10, max: 80, enabled: true },
	production: { window: 10, max: 60, enabled: true },
	test: { window: 10, max: 60, enabled: false },
};

const COOKIE_DOMAIN_BY_ENV: Partial<Record<JanovixEnvironment, string>> = {
	local: ".janovix.workers.dev",
	preview: ".janovix.workers.dev",
	dev: ".janovix.workers.dev",
	qa: ".algenium.qa",
	production: ".janovix.com",
};

const TRUSTED_ORIGINS_BY_ENV: Partial<Record<JanovixEnvironment, string[]>> = {
	local: ["https://*.janovix.workers.dev"],
	preview: ["https://*.janovix.workers.dev"],
	dev: ["https://*.janovix.workers.dev"],
	qa: ["https://*.algenium.qa"],
	production: ["https://*.janovix.com"],
};

const LOCAL_DEVELOPMENT_ORIGINS = [
	"http://localhost:*",
	"https://localhost:*",
	"http://127.0.0.1:*",
	"https://127.0.0.1:*",
];

const CROSS_SUBDOMAIN_ENVS: ReadonlySet<JanovixEnvironment> = new Set([
	"local",
	"preview",
	"dev",
	"qa",
	"production",
]);

export type AuthAccessPolicy = {
	enforceInternal: boolean;
	token?: string;
};

/**
 * Stripe price IDs for subscription plans
 * These are fetched from the database plan_prices table
 */
export type StripePriceIds = {
	watchlist: string;
	business: string;
	pro: string;
	ultra: string;
};

export type ResolvedAuthConfig = {
	cacheKey: string;
	secret: string;
	options: BetterAuthOptions;
	accessPolicy: AuthAccessPolicy;
};

export function resolveAuthEnvironment(env: Bindings): JanovixEnvironment {
	const fallback = env.ENVIRONMENT?.toLowerCase?.() ?? "local";
	return ENVIRONMENT_MAP[fallback] ?? "local";
}

export function buildResolvedAuthConfig(
	env: Bindings,
	executionContext?: ExecutionContext,
	stripePriceIds?: StripePriceIds,
): ResolvedAuthConfig {
	const resolvedEnv = resolveAuthEnvironment(env);
	const secret = resolveSecret(env.BETTER_AUTH_SECRET, resolvedEnv);
	const baseURL = resolveBaseURL(env.BETTER_AUTH_URL, resolvedEnv);
	const accessPolicy = resolveAccessPolicy(env, resolvedEnv);
	const cookieDomain = resolveCookieDomain(env, resolvedEnv);
	const trustedOrigins = resolveTrustedOrigins(env, resolvedEnv, cookieDomain);

	const options: BetterAuthOptions = {
		appName: `${ORG_SLUG}-auth-core-${resolvedEnv}`,
		basePath: BASE_PATH,
		baseURL,
		secret,
		// Email/Password is enabled ONLY for signup (to capture user's name).
		// Users never use passwords to sign in - all sign-in uses OTP codes.
		// The password field during signup is auto-generated and never used.
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			// No password reset - passwordless system
		},
		plugins: [
			openAPI({
				// Better Auth's OpenAPI plugin generates:
				// 1. A reference page at /api/auth/reference (Scalar UI)
				// 2. The JSON schema endpoint at /api/auth/open-api/generate-schema
				path: "/reference",
			}),
			jwt({
				jwks: {
					// Exposed as `${basePath}/jwks` (i.e. `/api/auth/jwks`)
					jwksPath: "/jwks",
				},
				jwt: {
					expirationTime: resolvedEnv === "production" ? "15m" : "30m",
					// Include organization ID in JWT claims for multi-tenant support
					definePayload: async ({ user, session }) => {
						return {
							sub: user.id,
							email: user.email,
							name: user.name,
							// activeOrganizationId is set by better-auth organization plugin
							// when user switches organizations via setActiveOrganization
							organizationId: session.activeOrganizationId ?? null,
						};
					},
				},
			}),
			admin({
				// Admin users can manage all users, roles, and perform admin operations
				// Users with "admin" role or in adminUserIds list get admin privileges
				defaultRole: "user",
				adminRoles: ["admin"],
			}),
			organization({
				// Organization creation is controlled by subscription limits
				// The actual limit check happens in databaseHooks.organization.create.before
				allowUserToCreateOrganization: async (user) => {
					// Check if user has an active subscription with available org slots
					// Priority: subscriptions with stripeSubscriptionId (real subs) over placeholders
					// Then by active/trialing status, then by most recent
					const subscription = await env.DB.prepare(
						`SELECT plan, status, stripeSubscriptionId FROM subscription 
					 WHERE referenceId = ? 
					 ORDER BY 
					   CASE WHEN stripeSubscriptionId IS NOT NULL THEN 0 ELSE 1 END,
					   CASE WHEN status IN ('active', 'trialing') THEN 0 ELSE 1 END,
					   createdAt DESC 
					 LIMIT 1`,
					)
						.bind(user.id)
						.first<{
							plan: string;
							status: string;
							stripeSubscriptionId: string | null;
						}>();

					// Debug: log what we found
					console.log(
						`[Org Guard] User ${user.id} subscription lookup:`,
						subscription,
					);

					if (!subscription) {
						console.log(
							`[Org Guard] User ${user.id} has no subscription, denying org creation`,
						);
						return false;
					}

					if (
						subscription.status !== "active" &&
						subscription.status !== "trialing"
					) {
						console.log(
							`[Org Guard] User ${user.id} subscription is ${subscription.status} (stripeSubId: ${subscription.stripeSubscriptionId}), denying org creation`,
						);
						return false;
					}

					// Get org limit based on plan
					const limits = PLAN_LIMITS[subscription.plan as PlanName];
					if (!limits) {
						console.log(
							`[Org Guard] Unknown plan ${subscription.plan} for user ${user.id}, denying org creation`,
						);
						return false;
					}

					// Count organizations owned by user
					const orgsResult = await env.DB.prepare(
						`SELECT COUNT(*) as count FROM members WHERE userId = ? AND role = 'owner'`,
					)
						.bind(user.id)
						.first<{ count: number }>();

					const orgsOwned = orgsResult?.count ?? 0;

					if (orgsOwned >= limits.maxOrganizations) {
						console.log(
							`[Org Guard] User ${user.id} has ${orgsOwned}/${limits.maxOrganizations} orgs, denying creation`,
						);
						return false;
					}

					console.log(
						`[Org Guard] User ${user.id} can create org (${orgsOwned}/${limits.maxOrganizations} used)`,
					);
					return true;
				},
				// Organization creator gets "owner" role by default
				creatorRole: "owner",
				// We keep teams disabled for now; can be enabled later without breaking the API surface.
				teams: { enabled: false },
				// Send invitation emails
				sendInvitationEmail:
					/* istanbul ignore next -- @preserve Mandrill email sending tested via integration */
					async (data: {
						invitation?: { id?: string };
						id?: string;
						organization?: { name?: string };
						inviter?: { user?: { name?: string; email?: string } };
						email?: string;
						role?: string;
					}) => {
						const apiKey = env.MANDRILL_API_KEY;
						if (!apiKey) {
							console.error(
								"[Org Invitation] MANDRILL_API_KEY is not configured; invitation email skipped",
							);
							return;
						}

						// Invitation acceptance happens in the auth app at /invite
						const authAppUrl =
							env.AUTH_FRONTEND_URL || "https://auth.janovix.workers.dev";

						const invitationId = data.invitation?.id ?? data.id ?? "";

						const inviteUrl = invitationId
							? `${authAppUrl}/invite?invitationId=${encodeURIComponent(invitationId)}`
							: `${authAppUrl}/invite`;

						const organizationName =
							data.organization?.name ?? "tu organización";
						// inviter is a member with nested user info
						const inviterUser = data.inviter?.user;
						const inviterName =
							inviterUser?.name ?? inviterUser?.email ?? "Janovix";
						const email = data.email ?? "";

						if (!email) {
							console.error(
								"[Org Invitation] Missing recipient email; invitation email skipped",
							);
							return;
						}

						const invitationPromise = sendOrganizationInvitationEmail(apiKey, {
							email,
							inviteUrl,
							organizationName,
							inviterName,
							role: data.role,
						});

						if (
							executionContext &&
							typeof executionContext.waitUntil === "function"
						) {
							executionContext.waitUntil(invitationPromise);
						} else {
							// Fallback: ensure promise completes and errors are handled
							invitationPromise.catch((error) => {
								console.error(
									"[Org Invitation] Unhandled email promise rejection",
									error,
								);
							});
						}
					},
			}),
			emailOTP({
				otpLength: 6,
				expiresIn: 300, // 5 minutes
				// Replace default email verification link with OTP
				// This ensures signup flow stays in-app and preserves redirectTo
				disableSignUp: false,
				// Override the default email verification with OTP-based verification
				// This means no email links are sent - only OTP codes
				sendVerificationOnSignUp: true,
				sendVerificationOTP:
					/* istanbul ignore next -- @preserve Mandrill email sending tested via integration */
					async ({
						email,
						otp,
						type,
					}: {
						email: string;
						otp: string;
						type: string;
					}) => {
						console.log(
							`[Email OTP] sendVerificationOTP called for ${email}, type: ${type}`,
						);

						// Mark that OTP callback was called (for rate-limit detection)
						markOtpSent(email);

						const apiKey = env.MANDRILL_API_KEY;
						if (!apiKey) {
							console.error(
								"[Email OTP] MANDRILL_API_KEY is not configured; OTP email skipped",
							);
							return;
						}

						const trimmedEmail = email.trim();
						const userName = trimmedEmail.includes("@")
							? trimmedEmail.split("@")[0]
							: trimmedEmail || email;

						// Use waitUntil for Cloudflare Workers to ensure async operation completes
						const emailPromise = sendOtpEmail(
							apiKey,
							email,
							userName,
							otp,
							type,
						);

						if (
							executionContext &&
							typeof executionContext.waitUntil === "function"
						) {
							executionContext.waitUntil(emailPromise);
						} else {
							emailPromise.catch((error) => {
								console.error(
									"[Email OTP] Unhandled email promise rejection",
									error,
								);
							});
						}
					},
			}),
			// Stripe plugin for user-based billing
			// Price IDs are fetched from database (plan_prices table) or fall back to env vars
			...(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
				? [
						stripe({
							stripeClient: new Stripe(env.STRIPE_SECRET_KEY),
							stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
							createCustomerOnSignUp: true,
							subscription: {
								enabled: true,
								plans: [
									{
										name: "watchlist",
										// Price ID from database (via stripePriceIds param) or env var fallback
										priceId:
											stripePriceIds?.watchlist ||
											env.STRIPE_WATCHLIST_PRICE_ID ||
											"price_watchlist",
										limits: PLAN_LIMITS.watchlist,
										freeTrial: {
											days: 14,
										},
									},
									{
										name: "business",
										priceId:
											stripePriceIds?.business ||
											env.STRIPE_BUSINESS_PRICE_ID ||
											"price_aml_business",
										limits: PLAN_LIMITS.business,
										freeTrial: {
											days: 14,
										},
									},
									{
										name: "pro",
										priceId:
											stripePriceIds?.pro ||
											env.STRIPE_PRO_PRICE_ID ||
											"price_aml_pro",
										limits: PLAN_LIMITS.pro,
										freeTrial: {
											days: 14,
										},
									},
									{
										name: "ultra",
										priceId:
											stripePriceIds?.ultra ||
											env.STRIPE_ULTRA_PRICE_ID ||
											"price_aml_ultra",
										limits: PLAN_LIMITS.ultra,
										freeTrial: {
											days: 14,
										},
									},
								],
								// Customize checkout session to enable Link payments and other options
								getCheckoutSessionParams: async () => ({
									params: {
										// Enable Link and card payment methods
										// When payment_method_types is not set, Stripe uses dynamic payment methods
										// which automatically includes Link if enabled in the Stripe Dashboard
										// Setting explicitly ensures Link is always available
										payment_method_types: ["card", "link"],
										// Allow promotion codes for discounts
										allow_promotion_codes: true,
										// Collect billing address for invoicing
										billing_address_collection: "auto",
										// Note: Don't set customer_email here - Better Auth Stripe plugin
										// already sets the `customer` param when a customer exists,
										// and Stripe doesn't allow both customer and customer_email
									},
								}),
							},
						}),
					]
				: []),
			// Cloudflare Turnstile captcha protection for email-sending endpoints
			// Protects against bots triggering expensive email operations
			...(env.TURNSTILE_SECRET_KEY
				? [
						captcha({
							provider: "cloudflare-turnstile",
							secretKey: env.TURNSTILE_SECRET_KEY,
							// Protect only endpoints that SEND emails (expensive operation)
							// /sign-in/email-otp is NOT included - it verifies OTP, doesn't send email
							endpoints: [
								"/sign-up/email", // Sends verification OTP on signup
								"/email-otp/send-verification-otp", // Send/resend OTP email
								"/forget-password", // Password reset email
							],
						}),
					]
				: []),
		],
		session: {
			updateAge: 60 * 30,
			expiresIn:
				resolvedEnv === "production" ? 60 * 60 * 24 * 7 : 60 * 60 * 24 * 14,
			freshAge: 60 * 15,
			cookieCache: {
				enabled: true,
				strategy: "jwe",
				refreshCache: true,
			},
		},
		rateLimit: RATE_LIMITS[resolvedEnv],
		advanced: buildAdvancedOptions(resolvedEnv, cookieDomain),
		trustedOrigins,
		// Note: Stripe customer creation is now handled by @better-auth/stripe plugin
		// when createCustomerOnSignUp: true is set. Users are the billing entity, not orgs.
		// Database hooks for syncing user changes to Stripe
		databaseHooks: {
			user: {
				update: {
					after: async (user: {
						id: string;
						name?: string | null;
						email?: string;
					}) => {
						// Sync user to Stripe customer when profile is updated
						if (!env.STRIPE_SECRET_KEY) {
							return;
						}

						// Skip if no name was updated (nothing to sync)
						if (!user.name) {
							console.log(
								`[Stripe Sync] No name in update for user ${user.id}, skipping`,
							);
							return;
						}

						const syncStripeCustomer = async () => {
							const stripeClient = new Stripe(env.STRIPE_SECRET_KEY as string);

							// Get full user record to ensure we have email
							// (the hook may only receive updated fields)
							const fullUser = await env.DB.prepare(
								`SELECT id, email, name FROM users WHERE id = ?`,
							)
								.bind(user.id)
								.first<{ id: string; email: string; name: string | null }>();

							if (!fullUser) {
								console.error(
									`[Stripe Sync] User ${user.id} not found in database`,
								);
								return;
							}

							const userEmail = fullUser.email;
							const userName = user.name || fullUser.name || undefined;

							console.log(
								`[Stripe Sync] Syncing user ${user.id} (${userEmail}) with name "${userName}"`,
							);

							// Look up the Stripe customer ID from the subscription table
							const subscription = await env.DB.prepare(
								`SELECT id, stripeCustomerId FROM subscription WHERE referenceId = ? ORDER BY createdAt DESC LIMIT 1`,
							)
								.bind(user.id)
								.first<{ id: string; stripeCustomerId: string | null }>();

							let customerId = subscription?.stripeCustomerId;

							// If no customer exists in our DB, search Stripe by email first
							// Email is our unique identifier since all emails are validated
							if (!customerId) {
								console.log(
									`[Stripe Sync] No Stripe customer ID in DB for user ${user.id}, searching by email ${userEmail}`,
								);

								// Search for existing customer by email
								const existingCustomers = await stripeClient.customers.list({
									email: userEmail,
									limit: 1,
								});

								if (existingCustomers.data.length > 0) {
									// Use existing customer
									customerId = existingCustomers.data[0].id;
									console.log(
										`[Stripe Sync] Found existing Stripe customer ${customerId} for email ${userEmail}`,
									);

									// Update the customer name
									await stripeClient.customers.update(customerId, {
										name: userName,
										metadata: {
											userId: user.id,
											source: "janovix-auth-hook",
										},
									});
									console.log(
										`[Stripe Sync] Updated Stripe customer ${customerId} name to "${userName}"`,
									);
								} else {
									// Create new customer only if none exists for this email
									const customer = await stripeClient.customers.create({
										email: userEmail,
										name: userName || undefined,
										metadata: {
											userId: user.id,
											source: "janovix-auth-hook",
										},
									});
									customerId = customer.id;
									console.log(
										`[Stripe Sync] Created new Stripe customer ${customerId} for email ${userEmail} with name "${userName}"`,
									);
								}

								// Store customer ID in subscription table
								if (subscription?.id) {
									await env.DB.prepare(
										`UPDATE subscription SET stripeCustomerId = ?, updatedAt = datetime('now') WHERE id = ?`,
									)
										.bind(customerId, subscription.id)
										.run();
								} else {
									await env.DB.prepare(
										`INSERT INTO subscription (id, plan, referenceId, stripeCustomerId, status, createdAt, updatedAt)
										 VALUES (?, 'none', ?, ?, 'incomplete', datetime('now'), datetime('now'))`,
									)
										.bind(crypto.randomUUID(), user.id, customerId)
										.run();
								}
							} else {
								// Update existing customer's name
								await stripeClient.customers.update(customerId, {
									name: userName,
								});
								console.log(
									`[Stripe Sync] Updated Stripe customer ${customerId} name to "${userName}"`,
								);
							}
						};

						// Use waitUntil for async operation if available
						const promise = syncStripeCustomer().catch((error) => {
							console.error(
								`[Stripe Sync] Error syncing user to Stripe:`,
								error,
							);
						});

						if (
							executionContext &&
							typeof executionContext.waitUntil === "function"
						) {
							executionContext.waitUntil(promise);
						}
					},
				},
			},
			// Note: Better Auth databaseHooks doesn't support 'member' hooks.
			// Member seat updates are handled via custom endpoints in routes/organization.ts:
			// - POST /api/organization/update-seats (called after invitation acceptance)
			// - POST /api/subscription/usage/sync-members (for admin sync)
		},
	};

	return {
		cacheKey: `${ORG_SLUG}-${resolvedEnv}`,
		secret,
		options,
		accessPolicy,
	};
}

function buildAdvancedOptions(
	env: JanovixEnvironment,
	cookieDomain: string | undefined,
): BetterAuthOptions["advanced"] {
	const advanced: BetterAuthOptions["advanced"] = {
		disableCSRFCheck: env === "local" || env === "test",
		disableOriginCheck: env === "local" || env === "test",
		useSecureCookies: env !== "local" && env !== "test",
		// Explicitly set cookie path to "/" so cookies are accessible on all paths.
		// Without this, cookies might only be sent to paths matching the basePath (/api/auth).
		defaultCookieAttributes: {
			path: "/",
			sameSite: "lax",
		},
	};

	if (shouldEnableCrossSubdomainCookies(env, cookieDomain)) {
		advanced.crossSubDomainCookies = {
			enabled: true,
			domain: cookieDomain,
		};
	}

	return advanced;
}

function resolveSecret(secret: string | undefined, env: JanovixEnvironment) {
	if (secret && secret.length >= 32) {
		return secret;
	}

	if (env === "local" || env === "test") {
		return "local-dev-secret-please-override-0123456789";
	}

	throw new Error(
		"BETTER_AUTH_SECRET is not configured or too short. Set a >=32 char secret via `wrangler secret put BETTER_AUTH_SECRET`.",
	);
}

function resolveBaseURL(
	baseURL: string | undefined,
	env: JanovixEnvironment,
): string | undefined {
	// baseURL is optional for local/test environments where Better Auth can infer it
	if (env === "local" || env === "test") {
		return baseURL;
	}

	// For production environments, baseURL should be set for proper JWT issuer/audience validation
	if (!baseURL || baseURL.trim().length === 0) {
		throw new Error(
			"BETTER_AUTH_URL is required for non-local environments. Set it via environment variable or `wrangler secret put BETTER_AUTH_URL`.",
		);
	}

	// Validate URL format
	try {
		const url = new URL(baseURL);
		if (!["http:", "https:"].includes(url.protocol)) {
			throw new Error("BETTER_AUTH_URL must use http:// or https:// protocol.");
		}
	} catch (error) {
		if (error instanceof TypeError) {
			throw new Error(
				`BETTER_AUTH_URL must be a valid URL. Received: ${baseURL}`,
			);
		}
		throw error;
	}

	return baseURL.trim();
}

function resolveAccessPolicy(
	env: Bindings,
	resolvedEnv: JanovixEnvironment,
): AuthAccessPolicy {
	const enforceInternal = resolvedEnv !== "local" && resolvedEnv !== "test";
	const token = env.AUTH_INTERNAL_TOKEN;

	if (enforceInternal && (!token || token.length < 16)) {
		throw new Error(
			"AUTH_INTERNAL_TOKEN is required for non-local environments. Configure it via `wrangler secret put AUTH_INTERNAL_TOKEN`.",
		);
	}

	return token
		? {
				enforceInternal,
				token,
			}
		: {
				enforceInternal,
			};
}

function resolveCookieDomain(env: Bindings, resolvedEnv: JanovixEnvironment) {
	const override = normalizeCookieDomain(env.AUTH_COOKIE_DOMAIN);
	if (override) {
		return override;
	}

	return COOKIE_DOMAIN_BY_ENV[resolvedEnv];
}

function normalizeCookieDomain(domain: string | undefined) {
	if (!domain) {
		return undefined;
	}

	const cleaned = domain.trim().toLowerCase();
	if (!cleaned) {
		return undefined;
	}

	if (!cleaned.includes(".")) {
		throw new Error(
			'AUTH_COOKIE_DOMAIN must include a "." (example: .example.com).',
		);
	}

	if (cleaned.includes("*")) {
		throw new Error(
			"AUTH_COOKIE_DOMAIN does not support wildcard values. Provide a concrete domain such as .example.com",
		);
	}

	return cleaned.startsWith(".") ? cleaned : `.${cleaned}`;
}

function shouldEnableCrossSubdomainCookies(
	env: JanovixEnvironment,
	cookieDomain?: string,
): cookieDomain is string {
	return CROSS_SUBDOMAIN_ENVS.has(env) && !!cookieDomain;
}

function resolveTrustedOrigins(
	env: Bindings,
	resolvedEnv: JanovixEnvironment,
	cookieDomain?: string,
) {
	const origins = new Set<string>();

	// Prioritize AUTH_TRUSTED_ORIGINS from wrangler vars over ENVIRONMENT-based defaults
	const explicitTrustedOrigins = parseList(env.AUTH_TRUSTED_ORIGINS);
	if (explicitTrustedOrigins.length > 0) {
		// If AUTH_TRUSTED_ORIGINS is set, use it and skip ENVIRONMENT-based defaults
		explicitTrustedOrigins.forEach((origin) => origins.add(origin));
	} else {
		// Fallback to ENVIRONMENT-based defaults only if AUTH_TRUSTED_ORIGINS is not set
		(TRUSTED_ORIGINS_BY_ENV[resolvedEnv] ?? []).forEach((origin) =>
			origins.add(origin),
		);
	}

	// Always add localhost origins for local/test environments
	if (resolvedEnv === "local" || resolvedEnv === "test") {
		LOCAL_DEVELOPMENT_ORIGINS.forEach((origin) => origins.add(origin));
	}

	// Add domain-based patterns from cookieDomain (for cross-subdomain cookies)
	domainToTrustedOriginPatterns(cookieDomain).forEach((origin) =>
		origins.add(origin),
	);

	return Array.from(origins).filter(Boolean);
}

function domainToTrustedOriginPatterns(domain?: string) {
	if (!domain) {
		return [];
	}

	const sanitized = domain.replace(/^\./, "");
	if (!sanitized) {
		return [];
	}

	return [`https://${sanitized}`, `https://*.${sanitized}`];
}

function parseList(value: string | undefined) {
	if (!value) {
		return [];
	}

	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}
