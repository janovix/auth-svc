import { describe, expect, it, vi, afterEach } from "vitest";
import { env } from "cloudflare:test";
import worker from "../../src/testWorker";
import { verifyTurnstileToken, getClientIp } from "../../src/utils/turnstile";

const typedWorker = worker as unknown as {
	fetch: (
		request: Request,
		env: unknown,
		ctx: ExecutionContext,
	) => Promise<Response>;
};

const TEST_SECRET = "test-secret-1234567890123456789012345";

describe("Turnstile validation on forgot-password", () => {
	it("rejects forgot-password requests without turnstile token when configured", async () => {
		const request = new Request("http://localhost/api/auth/forgot-password", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:3000",
			},
			body: JSON.stringify({ email: "test@example.com" }),
		});

		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "local",
				BETTER_AUTH_SECRET: TEST_SECRET,
				TURNSTILE_SECRET_KEY: "test-turnstile-secret",
			},
			{} as ExecutionContext,
		);

		expect(response.status).toBe(400);
		const body = (await response.json()) as {
			success: boolean;
			message: string;
		};
		expect(body.success).toBe(false);
		expect(body.message).toContain("Turnstile token is required");
	});

	it("skips turnstile validation when TURNSTILE_SECRET_KEY is not configured", async () => {
		const request = new Request("http://localhost/api/auth/forgot-password", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:3000",
			},
			body: JSON.stringify({ email: "test@example.com" }),
		});

		const response = await typedWorker.fetch(
			request,
			{
				...env,
				ENVIRONMENT: "local",
				BETTER_AUTH_SECRET: TEST_SECRET,
				// No TURNSTILE_SECRET_KEY
			},
			{} as ExecutionContext,
		);

		// Should not be rejected by Turnstile validation (400)
		// Better Auth may return 200 or other status depending on email lookup
		expect(response.status).not.toBe(400);
	});
});

describe("Turnstile utility functions", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe("verifyTurnstileToken", () => {
		it("returns success when Cloudflare API verifies token", async () => {
			global.fetch = vi.fn().mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						success: true,
						challenge_ts: "2024-01-01T00:00:00Z",
						hostname: "example.com",
					}),
					{ status: 200 },
				),
			);

			const result = await verifyTurnstileToken({
				secretKey: "test-secret",
				token: "valid-token",
			});

			expect(result.success).toBe(true);
			expect(result.challenge_ts).toBeDefined();
			expect(global.fetch).toHaveBeenCalledWith(
				"https://challenges.cloudflare.com/turnstile/v0/siteverify",
				expect.objectContaining({
					method: "POST",
				}),
			);
		});

		it("returns failure when Cloudflare API rejects token", async () => {
			global.fetch = vi.fn().mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						success: false,
						"error-codes": ["invalid-input-response"],
					}),
					{ status: 200 },
				),
			);

			const result = await verifyTurnstileToken({
				secretKey: "test-secret",
				token: "invalid-token",
			});

			expect(result.success).toBe(false);
			expect(result["error-codes"]).toContain("invalid-input-response");
		});

		it("includes remoteIp in request when provided", async () => {
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ success: true }), { status: 200 }),
				);

			await verifyTurnstileToken({
				secretKey: "test-secret",
				token: "valid-token",
				remoteIp: "192.168.1.1",
			});

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock
				.calls[0];
			const formData = fetchCall[1].body as FormData;
			expect(formData.get("remoteip")).toBe("192.168.1.1");
		});

		it("returns server-error on non-ok response", async () => {
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

			const result = await verifyTurnstileToken({
				secretKey: "test-secret",
				token: "test-token",
			});

			expect(result.success).toBe(false);
			expect(result["error-codes"]).toContain("server-error");
		});

		it("returns network-error on fetch exception", async () => {
			global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

			const result = await verifyTurnstileToken({
				secretKey: "test-secret",
				token: "test-token",
			});

			expect(result.success).toBe(false);
			expect(result["error-codes"]).toContain("network-error");
		});
	});

	describe("getClientIp", () => {
		it("returns CF-Connecting-IP header value", () => {
			const request = new Request("http://localhost", {
				headers: {
					"CF-Connecting-IP": "1.2.3.4",
					"X-Forwarded-For": "5.6.7.8",
				},
			});

			expect(getClientIp(request)).toBe("1.2.3.4");
		});

		it("falls back to X-Forwarded-For first IP", () => {
			const request = new Request("http://localhost", {
				headers: {
					"X-Forwarded-For": "1.2.3.4, 5.6.7.8, 9.10.11.12",
				},
			});

			expect(getClientIp(request)).toBe("1.2.3.4");
		});

		it("falls back to X-Real-IP", () => {
			const request = new Request("http://localhost", {
				headers: {
					"X-Real-IP": "1.2.3.4",
				},
			});

			expect(getClientIp(request)).toBe("1.2.3.4");
		});

		it("returns undefined when no IP headers present", () => {
			const request = new Request("http://localhost");

			expect(getClientIp(request)).toBeUndefined();
		});
	});
});
