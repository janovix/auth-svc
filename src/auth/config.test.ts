import { describe, expect, it } from "vitest";

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
	it("enables cross-subdomain cookies for dev and allows *.algenium.dev origins", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
			}),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".algenium.dev",
		});
		expect(config.options.trustedOrigins).toContain("https://*.algenium.dev");
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
			}),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".algenium.qa",
		});
		expect(config.options.trustedOrigins).toContain("https://*.algenium.qa");
		expect(config.options.trustedOrigins).not.toContain(
			"https://*.algenium.dev",
		);
	});

	it("uses custom cookie domain and trusted origins overrides in production", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "production",
				AUTH_COOKIE_DOMAIN: "login.client.com",
				AUTH_TRUSTED_ORIGINS:
					"https://portal.client.com,https://*.client-staging.com",
			}),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".login.client.com",
		});
		expect(config.options.trustedOrigins).toEqual(
			expect.arrayContaining([
				"https://*.algenium.app",
				"https://portal.client.com",
				"https://*.client-staging.com",
				"https://*.login.client.com",
			]),
		);
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
				BETTER_AUTH_URL: "https://auth-core.algenium.dev",
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).baseURL).toBe(
			"https://auth-core.algenium.dev",
		);
	});
});
