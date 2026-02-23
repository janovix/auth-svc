import { SELF } from "cloudflare:test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Admin Organizations Routes (/admin/organizations)
 *
 * These routes require session + admin role. Without a valid admin session,
 * all requests return 403. Tests verify the route exists and enforces admin auth.
 */
describe("Admin Organizations Routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	interface ApiResponse<T> {
		success: boolean;
		data?: T;
		error?: string;
		message?: string;
	}

	describe("GET /admin/organizations", () => {
		it("returns 403 when no admin session", async () => {
			const response = await SELF.fetch(
				"http://local.test/admin/organizations",
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as ApiResponse<unknown>;
			expect(body.success).toBe(false);
			expect(body.error).toBe("Unauthorized");
			expect(body.message).toBe("Admin access required");
		});

		it("returns 403 for request with invalid session cookie", async () => {
			const response = await SELF.fetch(
				"http://local.test/admin/organizations?limit=10&offset=5",
				{
					headers: {
						Cookie: "better-auth.session_token=invalid-token",
					},
				},
			);

			expect(response.status).toBe(403);
		});
	});

	describe("GET /admin/organizations/:id", () => {
		it("returns 403 when no admin session", async () => {
			const response = await SELF.fetch(
				"http://local.test/admin/organizations/non-existent-id",
			);

			expect(response.status).toBe(403);
		});
	});

	describe("GET /admin/organizations/:id/members", () => {
		it("returns 403 when no admin session", async () => {
			const response = await SELF.fetch(
				"http://local.test/admin/organizations/non-existent-id/members",
			);

			expect(response.status).toBe(403);
		});
	});

	describe("GET /admin/organizations/:id/invitations", () => {
		it("returns 403 when no admin session", async () => {
			const response = await SELF.fetch(
				"http://local.test/admin/organizations/non-existent-id/invitations",
			);

			expect(response.status).toBe(403);
		});
	});

	describe("PATCH /admin/organizations/:id", () => {
		it("returns 403 when no admin session", async () => {
			const response = await SELF.fetch(
				"http://local.test/admin/organizations/test-org-id",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "Updated Name" }),
				},
			);

			expect(response.status).toBe(403);
		});
	});

	describe("DELETE /admin/organizations/:id", () => {
		it("returns 403 when no admin session", async () => {
			const response = await SELF.fetch(
				"http://local.test/admin/organizations/non-existent-id",
				{
					method: "DELETE",
				},
			);

			expect(response.status).toBe(403);
		});
	});
});
