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
	it("creates auth instance on first call", async () => {
		const env = buildEnv();
		const context = await getBetterAuthContext(env);

		expect(context.auth).toBeDefined();
		expect(context.accessPolicy).toBeDefined();
	});

	it("caches auth instance for same DB instance and environment", async () => {
		const env = buildEnv();
		const context1 = await getBetterAuthContext(env);
		const context2 = await getBetterAuthContext(env);

		expect(context1.auth).toBe(context2.auth);
	});

	it("reuses the same instance for different DB proxy objects with identical config", async () => {
		// With the module-level Map keyed by config hash (not by DB object identity),
		// two requests that arrive with different env.DB proxy objects but the same
		// configuration share the same cached auth instance. This is the desired
		// behaviour — it eliminates per-request betterAuth() reconstruction and the
		// JWKS D1 write-lock contention that caused infinite hangs.
		const env1 = buildEnv({ DB: {} as D1Database });
		const env2 = buildEnv({ DB: {} as D1Database });

		const context1 = await getBetterAuthContext(env1);
		const context2 = await getBetterAuthContext(env2);

		expect(context1.auth).toBe(context2.auth);
	});

	it("creates different instances for different environments", async () => {
		const sharedDb = {} as D1Database;
		const env1 = buildEnv({
			DB: sharedDb,
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
		});
		const env2 = buildEnv({ DB: sharedDb, ENVIRONMENT: "local" });

		const context1 = await getBetterAuthContext(env1);
		const context2 = await getBetterAuthContext(env2);

		expect(context1.auth).not.toBe(context2.auth);
	});

	it("returns auth and accessPolicy (no cleanup in new API)", async () => {
		const env = buildEnv({ DB: {} as D1Database });
		const context = await getBetterAuthContext(env);

		expect(context.auth).toBeDefined();
		expect(context.accessPolicy).toBeDefined();
		expect("cleanup" in context).toBe(false);
	});
});

describe("invalidateBetterAuthCache", () => {
	it("removes cached auth instance", async () => {
		const env = buildEnv({
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
		});

		const context1 = await getBetterAuthContext(env);
		const cachedAuth = context1.auth;

		const context2 = await getBetterAuthContext(env);
		expect(context2.auth).toBe(cachedAuth);

		invalidateBetterAuthCache(env);

		const context3 = await getBetterAuthContext(env);
		expect(context3.auth).not.toBe(cachedAuth);
	});

	it("only invalidates cache for specific environment", async () => {
		const sharedDb = {} as D1Database;
		const env1 = buildEnv({
			DB: sharedDb,
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
		});
		const env2 = buildEnv({ DB: sharedDb, ENVIRONMENT: "local" });

		const context1a = await getBetterAuthContext(env1);
		const context2a = await getBetterAuthContext(env2);

		invalidateBetterAuthCache(env1);

		const context1b = await getBetterAuthContext(env1);
		expect(context1b.auth).not.toBe(context1a.auth);

		const context2b = await getBetterAuthContext(env2);
		expect(context2b.auth).toBe(context2a.auth);
	});

	it("handles invalidation when cache is empty", () => {
		const env = buildEnv({ DB: {} as D1Database, ENVIRONMENT: "test" });

		expect(() => {
			invalidateBetterAuthCache(env);
		}).not.toThrow();
	});
});
