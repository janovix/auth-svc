import { describe, expect, it } from "vitest";

import { getTrustedOriginPatterns } from "../../src/middleware/cors";
import type { Bindings } from "../../src/types/bindings";

const SECRET = "test-secret-123456789012345678901234567890";

const baseEnv: Bindings = {
	DB: {} as D1Database,
	ENVIRONMENT: "local",
	BETTER_AUTH_SECRET: SECRET,
} as Bindings;

describe("getTrustedOriginPatterns", () => {
	it("returns localhost origins for local environment", () => {
		const patterns = getTrustedOriginPatterns(baseEnv);
		expect(patterns).toContain("http://localhost:*");
		expect(patterns).toContain("https://localhost:*");
	});

	it("returns environment-specific origins for dev", () => {
		const patterns = getTrustedOriginPatterns({
			...baseEnv,
			ENVIRONMENT: "dev",
			AUTH_INTERNAL_TOKEN: "test-token-123456",
		});
		expect(patterns).toContain("https://*.janovix.workers.dev");
	});

	it("includes custom trusted origins", () => {
		const patterns = getTrustedOriginPatterns({
			...baseEnv,
			ENVIRONMENT: "dev",
			AUTH_INTERNAL_TOKEN: "test-token-123456",
			AUTH_TRUSTED_ORIGINS: "https://custom.example.com,https://*.custom.com",
		});
		expect(patterns).toContain("https://custom.example.com");
		expect(patterns).toContain("https://*.custom.com");
	});

	it("caches results for same environment", () => {
		const env1 = {
			...baseEnv,
			ENVIRONMENT: "dev",
			AUTH_INTERNAL_TOKEN: "test-token-123456",
		};
		const env2 = {
			...baseEnv,
			ENVIRONMENT: "dev",
			AUTH_INTERNAL_TOKEN: "test-token-123456",
		};
		const patterns1 = getTrustedOriginPatterns(env1);
		const patterns2 = getTrustedOriginPatterns(env2);
		expect(patterns1).toBe(patterns2); // Same reference due to caching
	});
});
