import { describe, expect, it, vi, beforeEach } from "vitest";
import { SELF } from "cloudflare:test";

describe("App Routes and Middleware", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Error Handling", () => {
		it("handles ApiException with proper format", async () => {
			// This is tested via the dummy endpoint which throws ApiException
			// But we can verify the error handler works correctly
			const res = await SELF.fetch("http://local.test/dummy/test-slug", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}), // Missing required 'name' field
			});

			expect(res.status).toBeGreaterThanOrEqual(400);
			const body = await res.json<{ success: boolean; errors: unknown[] }>();
			expect(body.success).toBe(false);
			expect(Array.isArray(body.errors)).toBe(true);
		});

		it("handles unexpected errors with 500 status", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const res = await SELF.fetch("http://local.test/", {
				headers: {
					"x-force-error": "1",
				},
			});

			expect(res.status).toBe(500);
			const body = await res.json<{
				success: boolean;
				errors: Array<{ code: number; message: string }>;
			}>();

			expect(body.success).toBe(false);
			expect(body.errors).toEqual([
				{
					code: 7000,
					message: "Internal Server Error",
				},
			]);

			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it("logs unexpected errors", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			await SELF.fetch("http://local.test/", {
				headers: {
					"x-force-error": "1",
				},
			});

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Global error handler caught:",
				expect.any(Error),
			);

			consoleErrorSpy.mockRestore();
		});
	});

	describe("CORS Middleware", () => {
		it("skips CORS for Better Auth routes", async () => {
			// Better Auth routes should not have CORS middleware applied
			// This is tested indirectly via the CORS test file
			// But we can verify the middleware doesn't interfere
			const res = await SELF.fetch("http://local.test/api/auth/session", {
				method: "GET",
			});

			// The response should be handled by Better Auth, not blocked by CORS
			// Status may vary, but shouldn't be a CORS error
			expect([200, 401, 403, 404]).toContain(res.status);
		});

		it("applies CORS to non-auth routes", async () => {
			const res = await SELF.fetch("http://local.test/healthz", {
				method: "GET",
				headers: {
					origin: "https://app.janovix.workers.dev",
				},
			});

			// Should have CORS headers for trusted origins
			// This is more thoroughly tested in cors.test.ts
			expect(res.status).toBe(200);
		});
	});

	describe("Root Route", () => {
		it("returns app metadata", async () => {
			const res = await SELF.fetch("http://local.test/");
			const body = await res.json<{ name: string; version: string }>();

			expect(res.status).toBe(200);
			expect(body).toHaveProperty("name");
			expect(body).toHaveProperty("version");
			expect(typeof body.name).toBe("string");
			expect(typeof body.version).toBe("string");
		});

		it("throws error when x-force-error header is present", async () => {
			const res = await SELF.fetch("http://local.test/", {
				headers: {
					"x-force-error": "1",
				},
			});

			expect(res.status).toBe(500);
		});
	});

	describe("Health Check Route", () => {
		it("returns ok status", async () => {
			const res = await SELF.fetch("http://local.test/healthz");
			const body = await res.json<{ ok: boolean }>();

			expect(res.status).toBe(200);
			expect(body.ok).toBe(true);
		});
	});

	describe("Documentation Routes", () => {
		it("serves Scalar HTML at /docsz", async () => {
			const res = await SELF.fetch("http://local.test/docsz");
			const html = await res.text();

			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toContain("text/html");
			expect(html).toContain("@scalar/api-reference");
		});

		it("serves OpenAPI JSON", async () => {
			const res = await SELF.fetch("http://local.test/openapi.json");
			const body = await res.json<{ openapi?: string; info?: unknown }>();

			expect(res.status).toBe(200);
			expect(body).toHaveProperty("openapi");
			expect(body).toHaveProperty("info");
		});
	});
});
