import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Dummy API Integration Tests", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
	});

	describe("POST /dummy/{slug}", () => {
		it("should return the log details", async () => {
			const slug = "test-slug";
			const requestBody = { name: "Test Name" };
			const response = await SELF.fetch(`http://local.test/dummy/${slug}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(requestBody),
			});
			const body = await response.json<{ success: boolean; result: any }>();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.result.slug).toBe(slug);
			expect(body.result.name).toBe(requestBody.name);
			expect(body.result).toHaveProperty("msg");
		});

		it("should handle ApiException errors with proper format", async () => {
			// Missing required body field should trigger ApiException
			const slug = "test-slug";
			const response = await SELF.fetch(`http://local.test/dummy/${slug}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			const body = await response.json<{ success: boolean; errors: any[] }>();

			expect(response.status).toBeGreaterThanOrEqual(400);
			expect(body.success).toBe(false);
			expect(body.errors).toBeDefined();
			expect(Array.isArray(body.errors)).toBe(true);
		});

		it("should handle ApiException for invalid body type", async () => {
			const slug = "test-slug";
			const response = await SELF.fetch(`http://local.test/dummy/${slug}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: 123 }), // Invalid type
			});
			const body = await response.json<{ success: boolean; errors: any[] }>();

			expect(response.status).toBeGreaterThanOrEqual(400);
			expect(body.success).toBe(false);
			expect(body.errors).toBeDefined();
		});
	});
});
