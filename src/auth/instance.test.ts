import { describe, expect, it } from "vitest";

import { getBetterAuthContext, invalidateBetterAuthCache } from "./instance";
import type { Bindings } from "../types/bindings";

const SECRET = "test-secret-123456789012345678901234567890";
const INTERNAL_TOKEN = "internal-token-123456";

const baseEnv: Bindings = {
	DB: {} as D1Database,
	KV: {} as KVNamespace,
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

describe("getBetterAuthContext", () => {
	it("creates auth instance on first call", () => {
		const env = buildEnv();
		const context = getBetterAuthContext(env);

		expect(context.auth).toBeDefined();
		expect(context.accessPolicy).toBeDefined();
	});

	it("caches auth instance for same environment", () => {
		const env = buildEnv();
		const context1 = getBetterAuthContext(env);
		const context2 = getBetterAuthContext(env);

		// Should return the same cached instance
		expect(context1.auth).toBe(context2.auth);
	});

	it("creates different instances for different environments", () => {
		const env1 = buildEnv({
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
		});
		const env2 = buildEnv({ ENVIRONMENT: "local" });

		const context1 = getBetterAuthContext(env1);
		const context2 = getBetterAuthContext(env2);

		// Should be different instances
		expect(context1.auth).not.toBe(context2.auth);
	});

	it("handles execution context parameter", () => {
		const env = buildEnv();
		const mockExecutionContext = {
			waitUntil: () => {},
			passThroughOnException: () => {},
			props: {},
		} as ExecutionContext;

		const context = getBetterAuthContext(env, mockExecutionContext);

		expect(context.auth).toBeDefined();
		expect(context.accessPolicy).toBeDefined();
	});
});

describe("invalidateBetterAuthCache", () => {
	it("removes cached auth instance", () => {
		const env = buildEnv({
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
		});

		// Create and cache an instance
		const context1 = getBetterAuthContext(env);
		const cachedAuth = context1.auth;

		// Verify it's cached
		const context2 = getBetterAuthContext(env);
		expect(context2.auth).toBe(cachedAuth);

		// Invalidate cache
		invalidateBetterAuthCache(env);

		// Next call should create a new instance
		const context3 = getBetterAuthContext(env);
		expect(context3.auth).not.toBe(cachedAuth);
	});

	it("only invalidates cache for specific environment", () => {
		const env1 = buildEnv({
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
		});
		const env2 = buildEnv({ ENVIRONMENT: "local" });

		// Create instances for both environments
		const context1a = getBetterAuthContext(env1);
		const context2a = getBetterAuthContext(env2);

		// Invalidate only dev environment
		invalidateBetterAuthCache(env1);

		// Dev should get a new instance
		const context1b = getBetterAuthContext(env1);
		expect(context1b.auth).not.toBe(context1a.auth);

		// Local should still use cached instance
		const context2b = getBetterAuthContext(env2);
		expect(context2b.auth).toBe(context2a.auth);
	});

	it("handles invalidation when cache is empty", () => {
		const env = buildEnv({ ENVIRONMENT: "test" });

		// Should not throw when cache is empty
		expect(() => {
			invalidateBetterAuthCache(env);
		}).not.toThrow();
	});
});
