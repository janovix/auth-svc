import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import worker from "../../src/testWorker";
import { getTrustedOriginPatterns } from "../../src/middleware/cors";
import type { Bindings } from "../../src/types/bindings";

const SECRET = "test-secret-123456789012345678901234567890";
const TEST_INTERNAL_TOKEN = "test-internal-token-12345";

const typedWorker = worker as unknown as {
	fetch: (
		request: Request,
		env: unknown,
		ctx: ExecutionContext,
	) => Promise<Response>;
};

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
			BETTER_AUTH_URL: "https://auth-svc.janovix.workers.dev",
			AUTH_INTERNAL_TOKEN: "test-token-123456",
		});
		expect(patterns).toContain("https://*.janovix.workers.dev");
	});

	it("includes custom trusted origins", () => {
		const patterns = getTrustedOriginPatterns({
			...baseEnv,
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-svc.janovix.workers.dev",
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
			BETTER_AUTH_URL: "https://auth-svc.janovix.workers.dev",
			AUTH_INTERNAL_TOKEN: "test-token-123456",
		};
		const env2 = {
			...baseEnv,
			ENVIRONMENT: "dev",
			BETTER_AUTH_URL: "https://auth-svc.janovix.workers.dev",
			AUTH_INTERNAL_TOKEN: "test-token-123456",
		};
		const patterns1 = getTrustedOriginPatterns(env1);
		const patterns2 = getTrustedOriginPatterns(env2);
		expect(patterns1).toBe(patterns2); // Same reference due to caching
	});
});

describe("createCorsMiddleware integration", () => {
	it("applies CORS headers for trusted origins on non-auth routes", async () => {
		const request = new Request("http://localhost/dummy/test-slug", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				origin: "https://app.janovix.workers.dev",
			},
			body: JSON.stringify({ name: "Test" }),
		});

		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "dev",
				BETTER_AUTH_SECRET: SECRET,
				BETTER_AUTH_URL: "https://auth-svc.janovix.workers.dev",
				AUTH_INTERNAL_TOKEN: TEST_INTERNAL_TOKEN,
			},
			{} as ExecutionContext,
		);

		// Should have CORS header for trusted origin
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://app.janovix.workers.dev",
		);
	});

	it("does not apply CORS headers for untrusted origins on non-auth routes", async () => {
		const request = new Request("http://localhost/dummy/test-slug", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				origin: "https://evil.com",
			},
			body: JSON.stringify({ name: "Test" }),
		});

		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "dev",
				BETTER_AUTH_SECRET: SECRET,
				BETTER_AUTH_URL: "https://auth-svc.janovix.workers.dev",
				AUTH_INTERNAL_TOKEN: TEST_INTERNAL_TOKEN,
			},
			{} as ExecutionContext,
		);

		// Should not have CORS header for untrusted origin
		expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe(
			"https://evil.com",
		);
	});

	it("handles requests without origin header", async () => {
		const request = new Request("http://localhost/dummy/test-slug", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name: "Test" }),
		});

		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "local", // Use local env to skip internal token requirement
				BETTER_AUTH_SECRET: SECRET,
			},
			{} as ExecutionContext,
		);

		// Should return successful response without CORS headers
		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
	});
});
