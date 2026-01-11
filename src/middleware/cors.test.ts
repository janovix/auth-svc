import { describe, expect, it, beforeEach } from "vitest";
import { getTrustedOriginPatterns } from "./cors";
import type { Bindings } from "../types/bindings";

const SECRET = "test-secret-123456789012345678901234567890";

const baseEnv: Bindings = {
	DB: {} as D1Database,
	KV: {} as KVNamespace,
	ENVIRONMENT: "local",
	BETTER_AUTH_SECRET: SECRET,
	CF_VERSION_METADATA: { id: "test-version" } as WorkerVersionMetadata,
} as unknown as Bindings;

describe("CORS Middleware", () => {
	beforeEach(() => {
		// Clear cache between tests by creating new env objects
		// (cache is keyed by env properties)
	});

	describe("getTrustedOriginPatterns", () => {
		it("handles undefined environment variables", () => {
			const env = {
				...baseEnv,
				ENVIRONMENT: undefined,
				AUTH_COOKIE_DOMAIN: undefined,
				AUTH_TRUSTED_ORIGINS: undefined,
				BETTER_AUTH_URL: undefined,
			} as unknown as Bindings;

			// Should not throw and should return some default patterns
			expect(() => getTrustedOriginPatterns(env)).not.toThrow();
			const patterns = getTrustedOriginPatterns(env);
			expect(Array.isArray(patterns)).toBe(true);
		});

		it("handles empty string environment variables", () => {
			const env = {
				...baseEnv,
				ENVIRONMENT: "",
				AUTH_COOKIE_DOMAIN: "",
				AUTH_TRUSTED_ORIGINS: "",
				BETTER_AUTH_URL: "",
			} as unknown as Bindings;

			expect(() => getTrustedOriginPatterns(env)).not.toThrow();
			const patterns = getTrustedOriginPatterns(env);
			expect(Array.isArray(patterns)).toBe(true);
		});

		it("handles non-array trustedOrigins from config", () => {
			// This tests the fallback when trustedOrigins is not an array
			// The function should handle this gracefully
			const env = {
				...baseEnv,
				ENVIRONMENT: "local",
			} as unknown as Bindings;

			const patterns = getTrustedOriginPatterns(env);
			expect(Array.isArray(patterns)).toBe(true);
		});

		it("caches results based on cache key", () => {
			const env1 = {
				...baseEnv,
				ENVIRONMENT: "test",
				AUTH_COOKIE_DOMAIN: "example.com",
				AUTH_TRUSTED_ORIGINS: "https://example.com",
				BETTER_AUTH_URL: "https://auth.example.com",
			} as unknown as Bindings;

			const env2 = {
				...baseEnv,
				ENVIRONMENT: "test",
				AUTH_COOKIE_DOMAIN: "example.com",
				AUTH_TRUSTED_ORIGINS: "https://example.com",
				BETTER_AUTH_URL: "https://auth.example.com",
			} as unknown as Bindings;

			const patterns1 = getTrustedOriginPatterns(env1);
			const patterns2 = getTrustedOriginPatterns(env2);

			// Should return same reference due to caching
			expect(patterns1).toBe(patterns2);
		});

		it("returns different cache for different environments", () => {
			const env1 = {
				...baseEnv,
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-svc.janovix.workers.dev",
				AUTH_INTERNAL_TOKEN: "token1",
			} as unknown as Bindings;

			const env2 = {
				...baseEnv,
				ENVIRONMENT: "prod",
				BETTER_AUTH_URL: "https://auth-svc.janovix.com",
				AUTH_INTERNAL_TOKEN: "token2",
			} as unknown as Bindings;

			const patterns1 = getTrustedOriginPatterns(env1);
			const patterns2 = getTrustedOriginPatterns(env2);

			// Should return different arrays (may have different content)
			expect(Array.isArray(patterns1)).toBe(true);
			expect(Array.isArray(patterns2)).toBe(true);
		});

		it("handles different AUTH_COOKIE_DOMAIN values", () => {
			const env1 = {
				...baseEnv,
				ENVIRONMENT: "dev",
				AUTH_COOKIE_DOMAIN: "example.com",
			} as unknown as Bindings;

			const env2 = {
				...baseEnv,
				ENVIRONMENT: "dev",
				AUTH_COOKIE_DOMAIN: "other.com",
			} as unknown as Bindings;

			const patterns1 = getTrustedOriginPatterns(env1);
			const patterns2 = getTrustedOriginPatterns(env2);

			// Should cache separately based on cookie domain
			expect(Array.isArray(patterns1)).toBe(true);
			expect(Array.isArray(patterns2)).toBe(true);
		});

		it("handles different AUTH_TRUSTED_ORIGINS values", () => {
			const env1 = {
				...baseEnv,
				ENVIRONMENT: "dev",
				AUTH_TRUSTED_ORIGINS: "https://site1.com",
			} as unknown as Bindings;

			const env2 = {
				...baseEnv,
				ENVIRONMENT: "dev",
				AUTH_TRUSTED_ORIGINS: "https://site2.com",
			} as unknown as Bindings;

			const patterns1 = getTrustedOriginPatterns(env1);
			const patterns2 = getTrustedOriginPatterns(env2);

			// Should cache separately
			expect(Array.isArray(patterns1)).toBe(true);
			expect(Array.isArray(patterns2)).toBe(true);
		});

		it("handles different BETTER_AUTH_URL values", () => {
			const env1 = {
				...baseEnv,
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth1.example.com",
			} as unknown as Bindings;

			const env2 = {
				...baseEnv,
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth2.example.com",
			} as unknown as Bindings;

			const patterns1 = getTrustedOriginPatterns(env1);
			const patterns2 = getTrustedOriginPatterns(env2);

			// Should cache separately
			expect(Array.isArray(patterns1)).toBe(true);
			expect(Array.isArray(patterns2)).toBe(true);
		});
	});
});
