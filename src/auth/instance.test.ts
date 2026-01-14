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

	it("creates fresh auth instance for each call (to get fresh execution context)", () => {
		const env = buildEnv();
		const context1 = getBetterAuthContext(env);
		const context2 = getBetterAuthContext(env);

		// Auth instances should be different (recreated each call for fresh execution context)
		// Only Prisma client and KV storage are cached
		expect(context1.auth).not.toBe(context2.auth);
		// But both should have valid auth and policy
		expect(context1.auth).toBeDefined();
		expect(context2.auth).toBeDefined();
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
	it("clears cached Prisma and KV storage", () => {
		const env = buildEnv({
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
		});

		// Create instances to populate the cache
		const context1 = getBetterAuthContext(env);
		expect(context1.auth).toBeDefined();

		// Invalidate cache
		invalidateBetterAuthCache(env);

		// Should not throw and should create new context
		const context2 = getBetterAuthContext(env);
		expect(context2.auth).toBeDefined();
	});

	it("only invalidates cache for specific environment", () => {
		const env1 = buildEnv({
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
		});
		const env2 = buildEnv({ ENVIRONMENT: "local" });

		// Create instances for both environments
		getBetterAuthContext(env1);
		getBetterAuthContext(env2);

		// Invalidate only dev environment - should not throw
		expect(() => {
			invalidateBetterAuthCache(env1);
		}).not.toThrow();

		// Both should still work
		const context1b = getBetterAuthContext(env1);
		const context2b = getBetterAuthContext(env2);
		expect(context1b.auth).toBeDefined();
		expect(context2b.auth).toBeDefined();
	});

	it("handles invalidation when cache is empty", () => {
		const env = buildEnv({ ENVIRONMENT: "test" });

		// Should not throw when cache is empty
		expect(() => {
			invalidateBetterAuthCache(env);
		}).not.toThrow();
	});
});
