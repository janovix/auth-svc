import { describe, expect, it, vi } from "vitest";

import { buildResolvedAuthConfig } from "./config";
import type { Bindings } from "../types/bindings";

const SECRET = "test-secret-123456789012345678901234567890";
const INTERNAL_TOKEN = "internal-token-123456";

const baseEnv: Bindings = {
	DB: {} as D1Database,
	ENVIRONMENT: "local",
	BETTER_AUTH_SECRET: SECRET,
	AUTH_INTERNAL_TOKEN: INTERNAL_TOKEN,
} as Bindings;

function buildEnv(overrides: Partial<Bindings> = {}) {
	return {
		...baseEnv,
		...overrides,
	} satisfies Bindings;
}

function buildEnvWithoutInternalToken(overrides: Partial<Bindings> = {}) {
	const env = buildEnv(overrides);
	delete env.AUTH_INTERNAL_TOKEN;
	return env;
}

describe("buildResolvedAuthConfig", () => {
	it("enables cross-subdomain cookies for dev and allows *.janovix.workers.dev origins", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
			}),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".janovix.workers.dev",
		});
		expect(config.options.trustedOrigins).toContain(
			"https://*.janovix.workers.dev",
		);
		expect(config.options.advanced?.useSecureCookies).toBe(true);
		// JWT/JWKS plugin is enabled by default
		expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(config.options as any).plugins?.some(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(plugin: any) => plugin?.id === "jwt",
			),
		).toBe(true);
	});

	it("isolates QA cookies and trusted origins under *.algenium.qa", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "qa",
				BETTER_AUTH_URL: "https://auth-core.algenium.qa",
			}),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".algenium.qa",
		});
		expect(config.options.trustedOrigins).toContain("https://*.algenium.qa");
		expect(config.options.trustedOrigins).not.toContain(
			"https://*.janovix.workers.dev",
		);
	});

	it("uses custom cookie domain and trusted origins overrides in production", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "production",
				BETTER_AUTH_URL: "https://auth-core.janovix.ai",
				AUTH_COOKIE_DOMAIN: "login.client.com",
				AUTH_TRUSTED_ORIGINS:
					"https://portal.client.com,https://*.client-staging.com",
			}),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".login.client.com",
		});
		// When AUTH_TRUSTED_ORIGINS is explicitly set, it replaces ENVIRONMENT-based defaults
		// but domain-based patterns from cookieDomain are still added
		expect(config.options.trustedOrigins).toEqual(
			expect.arrayContaining([
				"https://portal.client.com",
				"https://*.client-staging.com",
				"https://login.client.com",
				"https://*.login.client.com",
			]),
		);
		// ENVIRONMENT-based default should NOT be included when AUTH_TRUSTED_ORIGINS is set
		expect(config.options.trustedOrigins).not.toContain("https://*.janovix.ai");
	});

	it("keeps localhost origins for local env without cross-subdomain cookies", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({ ENVIRONMENT: "local" }),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toBeUndefined();
		expect(config.options.trustedOrigins).toEqual(
			expect.arrayContaining(["http://localhost:*", "https://localhost:*"]),
		);
	});

	it("passes BETTER_AUTH_URL through as baseURL when provided", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).baseURL).toBe(
			"https://auth-core.janovix.workers.dev",
		);
	});

	it("allows missing BETTER_AUTH_URL in local environment", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({
				ENVIRONMENT: "local",
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).baseURL).toBeUndefined();
	});

	it("requires BETTER_AUTH_URL in production environment", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "production",
					BETTER_AUTH_URL: undefined,
				}),
			);
		}).toThrow("BETTER_AUTH_URL is required for non-local environments");
	});

	it("validates BETTER_AUTH_URL format", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "not-a-valid-url",
				}),
			);
		}).toThrow("BETTER_AUTH_URL must be a valid URL");

		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "ftp://invalid-protocol.com",
				}),
			);
		}).toThrow("BETTER_AUTH_URL must use http:// or https:// protocol");
	});

	it("validates AUTH_COOKIE_DOMAIN format", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					AUTH_COOKIE_DOMAIN: "nodot",
				}),
			);
		}).toThrow('AUTH_COOKIE_DOMAIN must include a "."');

		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					AUTH_COOKIE_DOMAIN: "*.example.com",
				}),
			);
		}).toThrow("AUTH_COOKIE_DOMAIN does not support wildcard values");
	});

	it("handles execution context parameter", () => {
		const mockExecutionContext = {
			waitUntil: () => {},
			passThroughOnException: () => {},
			props: {},
		} as ExecutionContext;

		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
			}),
			mockExecutionContext,
		);

		expect(config.options).toBeDefined();
	});

	it("handles empty sanitized cookie domain", () => {
		// When domain is just ".", it gets normalized but domainToTrustedOriginPatterns returns empty
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				AUTH_COOKIE_DOMAIN: ".",
			}),
		);

		// The domain "." is normalized and used, but domainToTrustedOriginPatterns returns []
		expect(config.options.advanced?.crossSubDomainCookies?.domain).toBe(".");
		// Trusted origins should still include environment defaults
		expect(config.options.trustedOrigins).toContain(
			"https://*.janovix.workers.dev",
		);
	});

	it("throws error when secret is too short in non-local env", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					BETTER_AUTH_SECRET: "short",
				}),
			);
		}).toThrow("BETTER_AUTH_SECRET is not configured or too short");
	});

	it("uses default secret for local env when secret is missing", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({
				ENVIRONMENT: "local",
				BETTER_AUTH_SECRET: undefined,
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).secret).toBe(
			"local-dev-secret-please-override-0123456789",
		);
	});

	it("uses default secret for test env when secret is missing", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({
				ENVIRONMENT: "test",
				BETTER_AUTH_SECRET: undefined,
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).secret).toBe(
			"local-dev-secret-please-override-0123456789",
		);
	});

	it("throws error when AUTH_INTERNAL_TOKEN is missing in non-local env", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnvWithoutInternalToken({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				}),
			);
		}).toThrow("AUTH_INTERNAL_TOKEN is required for non-local environments");
	});

	it("throws error when AUTH_INTERNAL_TOKEN is too short in non-local env", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					AUTH_INTERNAL_TOKEN: "short",
				}),
			);
		}).toThrow("AUTH_INTERNAL_TOKEN is required for non-local environments");
	});

	it("handles normalizeCookieDomain with whitespace-only domain", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				AUTH_COOKIE_DOMAIN: "   ",
			}),
		);

		// Whitespace-only domain should be normalized to undefined
		// Should fall back to environment default
		expect(config.options.advanced?.crossSubDomainCookies?.domain).toBe(
			".janovix.workers.dev",
		);
	});

	it("handles normalizeCookieDomain with domain without leading dot", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				AUTH_COOKIE_DOMAIN: "example.com",
			}),
		);

		// Domain without leading dot should be normalized to include it
		expect(config.options.advanced?.crossSubDomainCookies?.domain).toBe(
			".example.com",
		);
	});

	it("handles normalizeCookieDomain with domain already having leading dot", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				AUTH_COOKIE_DOMAIN: ".example.com",
			}),
		);

		// Domain with leading dot should remain unchanged
		expect(config.options.advanced?.crossSubDomainCookies?.domain).toBe(
			".example.com",
		);
	});

	it("configures email callbacks with execution context", () => {
		const mockExecutionContext = {
			waitUntil: vi.fn(),
			passThroughOnException: () => {},
			props: {},
		} as ExecutionContext;

		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				MANDRILL_API_KEY: "test-api-key",
			}),
			mockExecutionContext,
		);

		// Verify email callbacks are configured
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const emailAndPassword = (config.options as any).emailAndPassword;
		expect(emailAndPassword.sendResetPassword).toBeDefined();
		expect(emailAndPassword.onPasswordReset).toBeDefined();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const emailVerification = (config.options as any).emailVerification;
		expect(emailVerification.sendVerificationEmail).toBeDefined();
	});

	it("configures organization plugin with invitation email callback", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				MANDRILL_API_KEY: "test-api-key",
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (config.options as any).plugins;
		// Verify organization plugin is included
		// Plugin should exist - the exact structure depends on better-auth internals
		// Just verify plugins array contains organization plugin
		expect(plugins.length).toBeGreaterThan(0);
		// Verify the config was built successfully with organization plugin
		expect(config.options).toBeDefined();
	});

	it("handles missing MANDRILL_API_KEY in email callbacks gracefully", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				MANDRILL_API_KEY: undefined,
			}),
		);

		// Email callbacks should still be configured, they'll just log errors
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const emailAndPassword = (config.options as any).emailAndPassword;
		expect(emailAndPassword.sendResetPassword).toBeDefined();
	});

	it("handles BETTER_AUTH_URL with trailing whitespace", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "  https://auth-core.janovix.workers.dev  ",
			}),
		);

		// URL should be trimmed
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).baseURL).toBe(
			"https://auth-core.janovix.workers.dev",
		);
	});

	it("handles BETTER_AUTH_URL with empty string in non-local env", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "",
				}),
			);
		}).toThrow("BETTER_AUTH_URL is required for non-local environments");
	});

	it("handles environment mapping for various environment strings", () => {
		const environments = [
			"dev",
			"development",
			"qa",
			"test",
			"testing",
			"prod",
			"production",
			"preview",
			"local",
		];

		for (const env of environments) {
			const config = buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: env,
					BETTER_AUTH_URL:
						env === "local" || env === "test"
							? undefined
							: "https://auth-core.janovix.workers.dev",
				}),
			);
			expect(config.options).toBeDefined();
		}
	});

	it("handles unknown environment string by defaulting to local", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({
				ENVIRONMENT: "unknown-env",
			}),
		);

		// Should default to local environment behavior
		expect(config.options.advanced?.disableCSRFCheck).toBe(true);
		expect(config.options.advanced?.disableOriginCheck).toBe(true);
	});
});
