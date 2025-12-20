import type { BetterAuthOptions } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";

import type { Bindings, JanovixEnvironment } from "../types/bindings";
import { sendPasswordResetEmail } from "../utils/mandrill";

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
	preview: ".janovix.workers.dev",
	dev: ".janovix.workers.dev",
	qa: ".algenium.qa",
	production: ".janovix.ai",
};

const TRUSTED_ORIGINS_BY_ENV: Partial<Record<JanovixEnvironment, string[]>> = {
	preview: ["https://*.janovix.workers.dev"],
	dev: ["https://*.janovix.workers.dev"],
	qa: ["https://*.algenium.qa"],
	production: ["https://*.janovix.ai"],
};

const LOCAL_DEVELOPMENT_ORIGINS = [
	"http://localhost:*",
	"https://localhost:*",
	"http://127.0.0.1:*",
	"https://127.0.0.1:*",
];

const CROSS_SUBDOMAIN_ENVS: ReadonlySet<JanovixEnvironment> = new Set([
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
		emailAndPassword: {
			enabled: true,
			sendResetPassword: async ({ user, url }, _request) => {
				const apiKey = env.MANDRILL_API_KEY;
				if (!apiKey) {
					console.error("[Password Reset] MANDRILL_API_KEY is not configured");
					return;
				}

				// Use waitUntil for Cloudflare Workers to ensure async operation completes
				// Better Auth documentation recommends not awaiting email sending to prevent timing attacks
				const emailPromise = sendPasswordResetEmail(
					apiKey,
					user.email,
					user.name || user.email,
					url,
					"janovix-auth-password-recovery-template",
				);

				// Use waitUntil if execution context is available (Cloudflare Workers)
				if (
					executionContext &&
					typeof executionContext.waitUntil === "function"
				) {
					executionContext.waitUntil(emailPromise);
				} else {
					// Fallback: void for non-Cloudflare environments
					void emailPromise;
				}
			},
			onPasswordReset: async ({ user }, _request) => {
				// Optional callback after password reset is successful
				// Log for audit purposes or trigger additional actions
				console.log(`Password reset completed for user: ${user.email}`);
			},
		},
		plugins: [
			jwt({
				jwks: {
					// Exposed as `${basePath}/jwks` (i.e. `/api/auth/jwks`)
					jwksPath: "/jwks",
				},
				jwt: {
					expirationTime: resolvedEnv === "production" ? "15m" : "30m",
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
