import type { BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import { emailOTP, openAPI } from "better-auth/plugins";
import Stripe from "stripe";

import type { Bindings, JanovixEnvironment } from "../types/bindings";
import {
	sendOtpEmail,
	sendOrganizationInvitationEmail,
} from "../utils/mandrill";

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
				// Allow users to create organizations
				allowUserToCreateOrganization: true,
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

						// Invitation acceptance happens in the AML app, not the auth app
						const partnerAppUrl =
							env.AML_FRONTEND_URL || "https://aml.janovix.workers.dev";

						const invitationId = data.invitation?.id ?? data.id ?? "";

						const inviteUrl = invitationId
							? `${partnerAppUrl}/invitations/accept?invitationId=${encodeURIComponent(invitationId)}`
							: `${partnerAppUrl}/invitations`;

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
		// Database hooks to create Stripe Customer when organization is created
		databaseHooks: {
			organization: {
				create: {
					after: async (organization: {
						id: string;
						name: string;
						slug: string;
					}) => {
						// Skip Stripe customer creation if Stripe is not configured
						if (!env.STRIPE_SECRET_KEY) {
							console.warn(
								"[Org Created] STRIPE_SECRET_KEY not configured, skipping Stripe customer creation",
							);
							return;
						}

						const stripeSecretKey = env.STRIPE_SECRET_KEY;

						// Create Stripe customer for the organization
						const createStripeCustomerPromise = (async () => {
							try {
								const stripe = new Stripe(stripeSecretKey);

								// Create the Stripe Customer
								const stripeCustomer = await stripe.customers.create({
									name: organization.name,
									metadata: {
										organizationId: organization.id,
										organizationName: organization.name,
										organizationSlug: organization.slug,
										planType: "free",
										isEnterprise: "false",
									},
								});

								// Create the organization_subscriptions record with "free" status
								console.log(
									`[Org Created] Created Stripe customer ${stripeCustomer.id} for org ${organization.id}`,
								);

								// Insert the subscription record
								const subscriptionId = crypto.randomUUID();
								await env.DB.prepare(
									`
									INSERT INTO organization_subscriptions (
										id, organization_id, stripe_customer_id, status, created_at, updated_at
									) VALUES (?, ?, ?, 'inactive', datetime('now'), datetime('now'))
								`,
								)
									.bind(subscriptionId, organization.id, stripeCustomer.id)
									.run();

								console.log(
									`[Org Created] Created subscription record for org ${organization.id}`,
								);
							} catch (error) {
								console.error(
									"[Org Created] Failed to create Stripe customer:",
									error,
								);
							}
						})();

						// Use waitUntil if available to ensure async operation completes
						if (
							executionContext &&
							typeof executionContext.waitUntil === "function"
						) {
							executionContext.waitUntil(createStripeCustomerPromise);
						} else {
							// Fallback: let the promise run in background
							createStripeCustomerPromise.catch((error) => {
								console.error(
									"[Org Created] Unhandled Stripe customer creation error:",
									error,
								);
							});
						}
					},
				},
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any, // Type assertion needed as Better Auth types don't include organization hooks
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
