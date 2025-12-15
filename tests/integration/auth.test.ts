import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import worker from "../../src/testWorker";

import { INTERNAL_AUTH_HEADER } from "../../src/auth/routes";

const typedWorker = worker as unknown as {
	fetch: (
		request: Request,
		env: unknown,
		ctx: ExecutionContext,
	) => Promise<Response>;
};

const TEST_SECRET = "test-secret-1234567890123456789012345";
const TEST_INTERNAL_TOKEN = "test-internal-token-12345";

describe("Better Auth route access control", () => {
	it("rejects requests without the internal token in non-local envs", async () => {
		const request = new Request("http://localhost/api/auth/health");
		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "dev",
				BETTER_AUTH_SECRET: TEST_SECRET,
				AUTH_INTERNAL_TOKEN: TEST_INTERNAL_TOKEN,
			},
			{} as ExecutionContext,
		);

		expect(response.status).toBe(403);
	});

	it("allows JWKS to be fetched without the internal token", async () => {
		const request = new Request("http://localhost/api/auth/jwks");
		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "dev",
				BETTER_AUTH_SECRET: TEST_SECRET,
				AUTH_INTERNAL_TOKEN: TEST_INTERNAL_TOKEN,
			},
			{} as ExecutionContext,
		);

		// Depending on whether migrations were applied in the test DB, this may be 200/500/404,
		// but it must not be blocked by the private-surface guard.
		expect(response.status).not.toBe(403);
	});

	it("allows requests with the correct internal token header", async () => {
		const request = new Request("http://localhost/api/auth/health", {
			headers: {
				[INTERNAL_AUTH_HEADER]: TEST_INTERNAL_TOKEN,
			},
		});

		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "dev",
				BETTER_AUTH_SECRET: TEST_SECRET,
				AUTH_INTERNAL_TOKEN: TEST_INTERNAL_TOKEN,
			},
			{} as ExecutionContext,
		);

		expect(response.status).not.toBe(403);
	});

	it("does not require the header in local env", async () => {
		const request = new Request("http://localhost/api/auth/health");

		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "local",
				BETTER_AUTH_SECRET: TEST_SECRET,
				AUTH_INTERNAL_TOKEN: TEST_INTERNAL_TOKEN,
			},
			{} as ExecutionContext,
		);

		expect(response.status).not.toBe(403);
	});

	it("allows trusted browser origins in non-local envs", async () => {
		const request = new Request("http://localhost/api/auth/health", {
			headers: {
				origin: "https://app.janovix.workers.dev",
			},
		});

		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "dev",
				BETTER_AUTH_SECRET: TEST_SECRET,
				AUTH_INTERNAL_TOKEN: TEST_INTERNAL_TOKEN,
			},
			{} as ExecutionContext,
		);

		// Should not be blocked by 403 even without internal token if origin is trusted
		expect(response.status).not.toBe(403);
	});

	it("rejects requests with incorrect internal token", async () => {
		const request = new Request("http://localhost/api/auth/health", {
			headers: {
				[INTERNAL_AUTH_HEADER]: "wrong-token",
			},
		});

		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "dev",
				BETTER_AUTH_SECRET: TEST_SECRET,
				AUTH_INTERNAL_TOKEN: TEST_INTERNAL_TOKEN,
			},
			{} as ExecutionContext,
		);

		expect(response.status).toBe(403);
	});
});
