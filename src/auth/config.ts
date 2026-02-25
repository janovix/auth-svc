import type { BetterAuthOptions } from "better-auth";
import * as Sentry from "@sentry/cloudflare";
import { admin } from "better-auth/plugins/admin";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import { emailOTP, openAPI, captcha } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { stripe } from "@better-auth/stripe";
import Stripe from "stripe";

import type { Bindings, JanovixEnvironment } from "../types/bindings";
import {
	sendOtpEmail,
	sendOrganizationInvitationEmail,
} from "../utils/mandrill";
import { executeInBackground, getExecutionContext } from "./execution-context";

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
		operationsPerMonth: 0,
		clientsPerMonth: 0,
		watchlistQueriesPerDay: 50,
	},
	business: {
		maxOrganizations: 1,
		usersPerOrg: 2,
		reportsPerMonth: 1,
		noticesPerMonth: 2,
		alertsPerMonth: 20,
		operationsPerMonth: 50,
		clientsPerMonth: 25,
		watchlistQueriesPerDay: 50,
	},
	pro: {
		maxOrganizations: 3,
		usersPerOrg: 10,
		reportsPerMonth: 15,
		noticesPerMonth: 20,
		alertsPerMonth: 100,
		operationsPerMonth: 500,
		clientsPerMonth: 250,
		watchlistQueriesPerDay: 200,
	},
	ultra: {
		maxOrganizations: 10,
		usersPerOrg: 20,
		reportsPerMonth: 100,
		noticesPerMonth: 100,
		alertsPerMonth: 500,
		operationsPerMonth: 2000,
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

/**
 * Base rate limit configuration (without runtime KV storage).
 * Environments that use Cloudflare KV have `customStorage` attached at
 * build time via `buildRateLimitConfig`.
 */
type BaseRateLimitConfig = {
	window: number;
	max: number;
	enabled: boolean;
	/** Only used for in-memory or database storage (local/test). */
	storage?: "database" | "memory";
	modelName?: string;
	customRules?: Record<string, { window: number; max: number } | false>;
};

/**
 * Custom rate limit rules per endpoint.
 *
 * OTP endpoints: strict limits to prevent email abuse.
 *
 * get-session: explicitly disabled. This endpoint is called on every page load
 * and the cookie cache (60 s JWE) already absorbs most of the load. Better Auth
 * groups IPv6 addresses by /48 prefix, so all traffic from the same Cloudflare
 * PoP shares one KV counter key — a rate limit here would incorrectly throttle
 * legitimate users and causes KV 429 write-contention that hangs requests.
 */
const OTP_RATE_LIMIT_RULES: BaseRateLimitConfig["customRules"] = {
	// Limit OTP send requests: 3 per 10 seconds per IP
	"/email-otp/send-verification-otp": {
		window: 10,
		max: 3,
	},
	// Limit OTP verification attempts per IP
	"/sign-in/email-otp": {
		window: 10,
		max: 3,
	},
	// Disable rate limiting for get-session — read-only, high-frequency, already
	// protected by the 60 s JWE cookie cache. Exempting it eliminates KV write
	// contention that was causing request hangs under concurrent load.
	"/get-session": false,
};

const RATE_LIMITS: Record<JanovixEnvironment, BaseRateLimitConfig> = {
	local: {
		window: 10,
		max: 300,
		enabled: false,
		storage: "memory",
		customRules: OTP_RATE_LIMIT_RULES,
	},
	preview: {
		window: 10,
		max: 200,
		enabled: true,
		customRules: OTP_RATE_LIMIT_RULES,
	},
	dev: {
		window: 10,
		max: 1000,
		enabled: true,
		customRules: OTP_RATE_LIMIT_RULES,
	},
	qa: {
		window: 10,
		max: 1000,
		enabled: true,
		customRules: OTP_RATE_LIMIT_RULES,
	},
	production: {
		window: 10,
		max: 1000,
		enabled: true,
		customRules: OTP_RATE_LIMIT_RULES,
	},
	test: {
		window: 10,
		max: 60,
		enabled: false,
		storage: "memory",
		customRules: OTP_RATE_LIMIT_RULES,
	},
};

/**
 * Builds the final rate limit config for the given environment.
 *
 * For KV-backed environments (dev/qa/preview/production) we use
 * `storage: "secondary-storage"`, which is the Better Auth-recommended approach
 * for serverless runtimes. The `secondaryStorage` (KV) is already wired into
 * `betterAuth()` at the call site, and its `set()` implementation already clamps
 * any TTL to the 60-second KV minimum — so Better Auth passing the rate-limit
 * window (e.g. 10 s) as the TTL is handled correctly without any custom wrapper.
 */
function buildRateLimitConfig(
	resolvedEnv: JanovixEnvironment,
	kv: KVNamespace | undefined,
): BetterAuthOptions["rateLimit"] {
	const base = RATE_LIMITS[resolvedEnv];
	if (kv && base.enabled && !base.storage) {
		return { ...base, storage: "secondary-storage" };
	}
	return base;
}

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

/**
 * Resolves the WebAuthn Relying Party ID (rpID) from the frontend URL.
 * rpID must be the registrable domain of the origin where credentials are created.
 * Examples: "janovix.com" (prod), "janovix.workers.dev" (dev), "localhost" (local)
 */
function resolvePasskeyRpID(
	frontendUrl: string | undefined,
	env: JanovixEnvironment,
): string {
	if (frontendUrl) {
		try {
			const url = new URL(frontendUrl);
			return url.hostname;
		} catch {
			// fall through to defaults
		}
	}
	if (env === "production") {
		return "janovix.com";
	}
	if (env === "dev" || env === "preview") {
		return "janovix.workers.dev";
	}
	return "localhost";
}

/**
 * Resolves the WebAuthn origin(s) from the frontend URL.
 * Must exactly match the origin where navigator.credentials is called.
 * For local/test, includes common localhost origins.
 */
function resolvePasskeyOrigin(
	frontendUrl: string | undefined,
	env: JanovixEnvironment,
): string | string[] {
	if (frontendUrl) {
		try {
			const url = new URL(frontendUrl);
			const origin = `${url.protocol}//${url.host}`;
			if (env === "local" || env === "test") {
				return [
					origin,
					"http://localhost:3000",
					"http://localhost:3001",
					"http://localhost:8080",
					"https://localhost:3000",
				];
			}
			return origin;
		} catch {
			// fall through to defaults
		}
	}
	if (env === "local" || env === "test") {
		return [
			"http://localhost:3000",
			"http://localhost:3001",
			"http://localhost:8080",
			"https://localhost:3000",
		];
	}
	if (env === "production") {
		return "https://auth.janovix.com";
	}
	return "https://auth.janovix.workers.dev";
}

export function resolveAuthEnvironment(env: Bindings): JanovixEnvironment {
	const fallback = env.ENVIRONMENT?.toLowerCase?.() ?? "local";
	return ENVIRONMENT_MAP[fallback] ?? "local";
}

export function buildResolvedAuthConfig(
	env: Bindings,
	// executionContext is kept for API compatibility but no longer captured in closures.
	// Callbacks now use executeInBackground() which gets context dynamically.
	_executionContext?: ExecutionContext,
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
		onAPIError: {
			throw: false,
			onError: (error) => {
				console.error(`[Auth error:] `, error);
			},
			errorURL: `${env.AUTH_FRONTEND_URL}/error`,
		},
		// Store OAuth state (PKCE/state parameter) in an encrypted, signed cookie
		// on the client's browser instead of in D1. This avoids Cloudflare D1's
		// eventual-consistency / read-after-write problem: the sign-in initiation
		// writes the state to the D1 primary, but the callback may be served by a
		// different PoP whose D1 replica hasn't synced yet → "Verification not found".
		// With "cookie" strategy, the state is encrypted with BETTER_AUTH_SECRET,
		// lives in the browser, and is always immediately available on callback.
		account: {
			storeStateStrategy: "cookie",
		},
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID as string,
				clientSecret: env.GOOGLE_CLIENT_SECRET as string,
				accessType: "offline",
				prompt: "select_account consent",
			},
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
					// Include organization ID and role in JWT claims for multi-tenant support
					// and admin authorization in downstream services (aml-svc, etc.)
					definePayload: async ({ user, session }) => {
						return {
							sub: user.id,
							email: user.email,
							name: user.name,
							// User role for authorization (admin, user, etc.)
							// Used by aml-svc admin endpoints to verify admin access
							role: user.role ?? "user",
							// activeOrganizationId is set by better-auth organization plugin
							// when user switches organizations via setActiveOrganization.
							// For users who haven't explicitly selected an org, we auto-select
							// their first organization in session.create.before hook (see databaseHooks).
							organizationId: session.activeOrganizationId ?? null,
						};
					},
				},
			}),
			admin({
				// Admin users can manage all users, roles, and perform admin operations
				// Users with "admin" role or in adminUserIds list get admin privileges
				// New users start as "visitor" until manually promoted to "user" by an admin
				// This enables a beta access flow where visitors see a waiting page
				defaultRole: "visitor",
				adminRoles: ["admin"],
			}),
			organization({
				// Organization creation is controlled by subscription limits.
				// The actual limit check happens in databaseHooks.organization.create.before.
				allowUserToCreateOrganization: async (user) => {
					// 5 s timeout guards against slow/locked D1 queries stalling the request.
					// On timeout we deny creation (false) — the user can simply retry.
					const checkAllowed = async () => {
						// Check if user has an active subscription with available org slots.
						// Priority: subscriptions with stripeSubscriptionId (real subs) over placeholders,
						// then by active/trialing status, then by most recent.
						const subscription = await env.DB.prepare(
							`SELECT plan, status, stripeSubscriptionId, licenseId FROM subscription 
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
								licenseId: string | null;
							}>();

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

						// Resolve organization limit based on plan type
						let maxOrganizations: number;

						if (subscription.plan === "enterprise" && subscription.licenseId) {
							// Enterprise license: fetch limits from the license record
							const license = await env.DB.prepare(
								`SELECT max_organizations FROM enterprise_licenses WHERE id = ? AND status = 'active'`,
							)
								.bind(subscription.licenseId)
								.first<{ max_organizations: number }>();

							// 0 means unlimited
							maxOrganizations = license?.max_organizations ?? 0;
							console.log(
								`[Org Guard] User ${user.id} has enterprise license, maxOrganizations: ${maxOrganizations === 0 ? "unlimited" : maxOrganizations}`,
							);
						} else {
							// Stripe plan: use hardcoded PLAN_LIMITS
							const limits = PLAN_LIMITS[subscription.plan as PlanName];
							if (!limits) {
								console.log(
									`[Org Guard] Unknown plan ${subscription.plan} for user ${user.id}, denying org creation`,
								);
								return false;
							}
							maxOrganizations = limits.maxOrganizations;
						}

						// Count organizations owned by user
						const orgsResult = await env.DB.prepare(
							`SELECT COUNT(*) as count FROM members WHERE userId = ? AND role = 'owner'`,
						)
							.bind(user.id)
							.first<{ count: number }>();

						const orgsOwned = orgsResult?.count ?? 0;

						// 0 means unlimited -- skip limit check
						if (maxOrganizations > 0 && orgsOwned >= maxOrganizations) {
							console.log(
								`[Org Guard] User ${user.id} has ${orgsOwned}/${maxOrganizations} orgs, denying creation`,
							);
							return false;
						}

						console.log(
							`[Org Guard] User ${user.id} can create org (${orgsOwned}/${maxOrganizations === 0 ? "unlimited" : maxOrganizations} used)`,
						);
						return true;
					};

					try {
						return await Promise.race([
							checkAllowed(),
							new Promise<false>((resolve) =>
								setTimeout(() => {
									console.error(
										`[Org Guard] Subscription check timed out for user ${user.id}, denying org creation`,
									);
									resolve(false);
								}, 5_000),
							),
						]);
					} catch (error) {
						Sentry.captureException(error, {
							tags: { context: "allow-user-create-org" },
							extra: { userId: user.id },
						});
						return false;
					}
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

						// Use dynamic execution context to handle background task
						executeInBackground(
							invitationPromise,
							`Org invitation email to ${email}`,
						);
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
						const callbackStart = Date.now();
						console.log(
							`[Email OTP] sendVerificationOTP called for ${email}, type: ${type}`,
						);

						try {
							const apiKey = env.MANDRILL_API_KEY;
							if (!apiKey) {
								console.error(
									"[Email OTP] MANDRILL_API_KEY is not configured; OTP email skipped",
								);
								console.log(
									`[Email OTP] Callback completed for ${email} in ${Date.now() - callbackStart}ms (no API key)`,
								);
								return;
							}

							const trimmedEmail = email.trim();
							const userName = trimmedEmail.includes("@")
								? trimmedEmail.split("@")[0]
								: trimmedEmail || email;

							// Use waitUntil for Cloudflare Workers to ensure async operation completes
							// even after the response is sent to the client.
							// IMPORTANT: We do NOT await this promise to prevent blocking the response.
							const emailPromise = sendOtpEmail(
								apiKey,
								email,
								userName,
								otp,
								type,
							)
								.then(() => {
									const elapsed = Date.now() - callbackStart;
									console.log(
										`[Email OTP] Email sent successfully for ${email} in ${elapsed}ms`,
									);
								})
								.catch((error) => {
									// Catch and log errors to prevent unhandled rejections
									const elapsed = Date.now() - callbackStart;
									console.error(
										`[Email OTP] Failed to send email for ${email} after ${elapsed}ms:`,
										error instanceof Error ? error.message : String(error),
									);
									Sentry.captureException(error, {
										tags: { context: "otp-email-send-failed" },
										extra: { email, elapsed, type },
									});
								});

							// Use dynamic execution context to handle background task
							console.log(
								`[Email OTP] Scheduling background email task for ${email}`,
							);
							executeInBackground(emailPromise, `OTP email to ${email}`);

							// Callback returns immediately; email sends in background via waitUntil
							console.log(
								`[Email OTP] Callback completed for ${email} in ${Date.now() - callbackStart}ms (email sending in background)`,
							);
						} catch (error) {
							// Log any unexpected errors that would cause callback to fail silently
							console.error(
								`[Email OTP] UNEXPECTED ERROR in sendVerificationOTP for ${email}:`,
								error instanceof Error ? error.message : String(error),
								error instanceof Error ? error.stack : undefined,
							);
							Sentry.captureException(error, {
								tags: { context: "otp-callback-error" },
								extra: { email, type },
							});
							console.log(
								`[Email OTP] Callback completed for ${email} in ${Date.now() - callbackStart}ms (with error)`,
							);
						}
					},
			}),
			passkey({
				rpID: resolvePasskeyRpID(env.AUTH_FRONTEND_URL, resolvedEnv),
				rpName: "Janovix",
				origin: resolvePasskeyOrigin(env.AUTH_FRONTEND_URL, resolvedEnv),
			}),
			// Stripe plugin for user-based billing
			// Price IDs are fetched from database (plan_prices table)
			...(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && stripePriceIds
				? [
						stripe({
							stripeClient: new Stripe(env.STRIPE_SECRET_KEY, {
								timeout: 15_000, // 15 second timeout for Stripe API calls
							}),
							stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
							createCustomerOnSignUp: true,
							subscription: {
								enabled: true,
								plans: [
									{
										name: "watchlist",
										priceId: stripePriceIds.watchlist,
										limits: PLAN_LIMITS.watchlist,
										freeTrial: {
											days: 14,
										},
									},
									{
										name: "business",
										priceId: stripePriceIds.business,
										limits: PLAN_LIMITS.business,
										freeTrial: {
											days: 14,
										},
									},
									{
										name: "pro",
										priceId: stripePriceIds.pro,
										limits: PLAN_LIMITS.pro,
										freeTrial: {
											days: 14,
										},
									},
									{
										name: "ultra",
										priceId: stripePriceIds.ultra,
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
			// Turnstile captcha plugin for bot protection on email-sending endpoints
			// Only load if TURNSTILE_SECRET_KEY is configured (production)
			// In local/test environments without the secret, captcha is skipped
			...(env.TURNSTILE_SECRET_KEY
				? [
						captcha({
							provider: "cloudflare-turnstile",
							secretKey: env.TURNSTILE_SECRET_KEY,
							// Protect the endpoints that send emails to prevent abuse
							endpoints: ["/sign-up/email", "/email-otp/send-verification-otp"],
						}),
					]
				: []),
		],
		session: {
			updateAge: 60 * 30,
			expiresIn:
				resolvedEnv === "production" ? 60 * 60 * 24 * 7 : 60 * 60 * 24 * 14,
			freshAge: 60 * 15,
			// Keep D1 as the source of truth for sessions.
			// When secondaryStorage (KV) is present, Better Auth defaults to storing
			// sessions ONLY in KV. Setting storeSessionInDatabase: true ensures
			// sessions are written to both — KV acts as a fast read cache while D1
			// remains authoritative (important for databaseHooks consistency and for
			// avoiding KV eventual-consistency misses on get-session).
			storeSessionInDatabase: true,
			cookieCache: {
				enabled: true,
				// "compact" performs a lightweight HMAC verification on each cached
				// session read, significantly cheaper than JWE decryption on the Edge.
				strategy: "compact",
				// maxAge of 60 seconds ensures:
				// - Cookie cache expires regularly, forcing DB validation and session refresh
				// - updateAge (30 min) session refresh logic runs properly
				// - Set-Cookie headers are sent with extended maxAge
				// - Banned users are detected within ~60 seconds (reduced from 5 minutes)
				maxAge: 60, // 60 seconds - balance between DB hits and session freshness
				// refreshCache intentionally NOT set (defaults to false)
				// With refreshCache: false, when the cookie cache expires, Better Auth
				// hits the database, which properly triggers updateAge session refresh
				// and sends updated Set-Cookie headers with extended maxAge.
			},
		},
		rateLimit: buildRateLimitConfig(resolvedEnv, env.KV),
		advanced: buildAdvancedOptions(resolvedEnv, cookieDomain),
		trustedOrigins,
		// Note: Stripe customer creation is now handled by @better-auth/stripe plugin
		// when createCustomerOnSignUp: true is set. Users are the billing entity, not orgs.
		// Database hooks for syncing user changes to Stripe
		databaseHooks: {
			session: {
				create: {
					// Auto-select user's first organization when session is created.
					// This handles existing users who login without going through onboarding
					// (which would have called setActiveOrganization after org creation).
					before: async (session) => {
						// Skip if session already has an active organization
						if (session.activeOrganizationId) {
							return { data: session };
						}

						try {
							// 3 s timeout guards against a slow/locked D1 query blocking sign-in.
							// On timeout we return the session unchanged — the user lands without
							// an active org set; subsequent navigation handles org selection.
							const memberResult = await Promise.race([
								env.DB.prepare(
									`SELECT organizationId FROM members WHERE userId = ? LIMIT 1`,
								)
									.bind(session.userId)
									.first<{ organizationId: string }>(),
								new Promise<null>((resolve) =>
									setTimeout(() => resolve(null), 3_000),
								),
							]);

							if (memberResult?.organizationId) {
								console.log(
									`[Session] Auto-selected organization ${memberResult.organizationId} for user ${session.userId}`,
								);
								return {
									data: {
										...session,
										activeOrganizationId: memberResult.organizationId,
									},
								};
							}
						} catch (error) {
							console.error(
								`[Session] Error auto-selecting organization for user ${session.userId}:`,
								error,
							);
							Sentry.captureException(error, {
								tags: { context: "session-hook-auto-select-org" },
								extra: { userId: session.userId },
							});
						}

						// No organization found, timeout, or error — return session unchanged
						return { data: session };
					},
				},
			},
			user: {
				create: {
					after: async (user: { id: string; email: string; role?: string }) => {
						// Defer to background so the sign-up response is not blocked by
						// these D1 queries. Promotion isn't needed in the immediate response —
						// the user lands on onboarding where org membership is established.
						executeInBackground(
							(async () => {
								// Check if the newly registered user has pending org invitations.
								// If so, promote them from "visitor" to "user" so they can onboard.
								const pendingInvite = await env.DB.prepare(
									`SELECT id FROM invitations
							 WHERE email = ? AND status = 'pending'
							 AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
							 LIMIT 1`,
								)
									.bind(user.email)
									.first<{ id: string }>();

								if (pendingInvite) {
									await env.DB.prepare(
										`UPDATE users SET role = 'user' WHERE id = ? AND role = 'visitor'`,
									)
										.bind(user.id)
										.run();
									console.log(
										`[User Create] Auto-promoted user ${user.id} (${user.email}) from visitor to user due to pending invitation ${pendingInvite.id}`,
									);
								}
							})(),
							"user-create-pending-invite-check",
						);
					},
				},
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

						// Timeout for Stripe operations (10 seconds)
						const STRIPE_TIMEOUT_MS = 10_000;

						const syncStripeCustomer = async () => {
							const stripeClient = new Stripe(env.STRIPE_SECRET_KEY as string, {
								timeout: STRIPE_TIMEOUT_MS,
							});

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

						// Use dynamic execution context to handle background task
						// The task has its own internal timeout via Stripe client config
						const promise = syncStripeCustomer().catch((error) => {
							console.error(
								`[Stripe Sync] Error syncing user to Stripe:`,
								error,
							);
							Sentry.captureException(error, {
								tags: { context: "stripe-sync-user-update" },
								extra: { userId: user.id },
							});
						});

						executeInBackground(promise, `Stripe sync for user ${user.id}`);
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
		// Configure IP address detection for Cloudflare Workers.
		// This is REQUIRED for rate limiting to work - without a detected IP,
		// Better Auth silently skips rate limiting entirely.
		ipAddress: {
			ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
		},
		// Defer Better Auth's internal background tasks (D1 session cleanup,
		// cache invalidation, etc.) to Cloudflare Workers' waitUntil via ALS.
		// Without this, Better Auth blocks the response waiting for those tasks,
		// which causes the "script will never generate a response" hang.
		// Note: Better Auth passes a Promise directly (not a factory function).
		backgroundTasks: {
			handler: (promise) => {
				const ctx = getExecutionContext();
				if (ctx) {
					ctx.waitUntil(promise);
				} else {
					promise.catch((error: unknown) => {
						console.error("[BackgroundTask] Unhandled error:", error);
					});
				}
			},
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
