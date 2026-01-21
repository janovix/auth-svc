import { SELF } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";

describe("Admin Routes", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	interface ErrorResponse {
		success: boolean;
		error: string;
		message: string;
	}

	describe("DELETE /api/admin/kv/flush", () => {
		it("should return 403 when user is not authenticated", async () => {
			const response = await SELF.fetch(
				"http://local.test/api/admin/kv/flush",
				{
					method: "DELETE",
				},
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.success).toBe(false);
			expect(body.error).toBe("Unauthorized");
		});

		it("should return 403 when user has no valid session", async () => {
			// This test verifies behavior when no valid session exists
			// A full test would require mocking Better Auth's session middleware
			const response = await SELF.fetch(
				"http://local.test/api/admin/kv/flush",
				{
					method: "DELETE",
					headers: {
						Cookie: "better-auth.session_token=invalid-token",
					},
				},
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.success).toBe(false);
		});

		// Note: Testing with a valid admin session would require:
		// 1. Creating a user with admin role in the test database
		// 2. Generating a valid session token
		// This is complex because Better Auth manages session tokens internally
		// For comprehensive testing, consider using integration tests with the full auth flow
	});
});
