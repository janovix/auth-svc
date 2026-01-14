import { SELF } from "cloudflare:test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Internal Organizations Routes", () => {
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
	}

	describe("GET /internal/organizations", () => {
		it("returns organizations list structure", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations",
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as ApiResponse<{
				organizations: unknown[];
				total: number;
				limit: number;
				offset: number;
			}>;
			expect(body.success).toBe(true);
			expect(body.data).toHaveProperty("organizations");
			expect(body.data).toHaveProperty("total");
			expect(body.data).toHaveProperty("limit");
			expect(body.data).toHaveProperty("offset");
			expect(Array.isArray(body.data?.organizations)).toBe(true);
		});

		it("respects pagination params", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations?limit=10&offset=5",
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as ApiResponse<{
				organizations: unknown[];
				total: number;
				limit: number;
				offset: number;
			}>;
			expect(body.success).toBe(true);
			expect(body.data?.limit).toBe(10);
			expect(body.data?.offset).toBe(5);
		});

		it("enforces max limit of 100", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations?limit=200",
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as ApiResponse<{
				limit: number;
			}>;
			expect(body.data?.limit).toBe(100);
		});
	});

	describe("GET /internal/organizations/:id", () => {
		it("returns 404 for non-existent organization", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations/non-existent-id",
			);

			expect(response.status).toBe(404);
			const body = (await response.json()) as ApiResponse<unknown>;
			expect(body.success).toBe(false);
			expect(body.error).toBe("Organization not found");
		});
	});

	describe("GET /internal/organizations/:id/members", () => {
		it("returns empty members array for non-existent org", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations/non-existent-id/members",
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as ApiResponse<{
				members: unknown[];
				total: number;
			}>;
			expect(body.success).toBe(true);
			expect(body.data?.members).toEqual([]);
			expect(body.data?.total).toBe(0);
		});
	});

	describe("GET /internal/organizations/:id/invitations", () => {
		it("returns empty invitations array for non-existent org", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations/non-existent-id/invitations",
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as ApiResponse<{
				invitations: unknown[];
				total: number;
			}>;
			expect(body.success).toBe(true);
			expect(body.data?.invitations).toEqual([]);
			expect(body.data?.total).toBe(0);
		});
	});

	describe("PATCH /internal/organizations/:id", () => {
		it("validates at least one field is required", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations/test-org-id",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				},
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as ApiResponse<unknown>;
			expect(body.success).toBe(false);
			expect(body.error).toBe(
				"At least one field (name, slug, logo, metadata) must be provided",
			);
		});

		it("validates name cannot be empty", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations/test-org-id",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "" }),
				},
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as ApiResponse<unknown>;
			expect(body.success).toBe(false);
			expect(body.error).toBe("Organization name cannot be empty");
		});

		it("validates slug cannot be empty", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations/test-org-id",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ slug: "" }),
				},
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as ApiResponse<unknown>;
			expect(body.success).toBe(false);
			expect(body.error).toBe("Organization slug cannot be empty");
		});

		it("validates slug format", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations/test-org-id",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ slug: "Invalid Slug!" }),
				},
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as ApiResponse<unknown>;
			expect(body.success).toBe(false);
			expect(body.error).toBe(
				"Slug must be lowercase and contain only letters, numbers, and hyphens",
			);
		});

		it("returns 404 for non-existent organization", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations/non-existent-id",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "Updated Name" }),
				},
			);

			expect(response.status).toBe(404);
			const body = (await response.json()) as ApiResponse<unknown>;
			expect(body.success).toBe(false);
			expect(body.error).toBe("Organization not found");
		});
	});

	describe("DELETE /internal/organizations/:id", () => {
		it("returns 404 for non-existent organization", async () => {
			const response = await SELF.fetch(
				"http://local.test/internal/organizations/non-existent-id",
				{
					method: "DELETE",
				},
			);

			expect(response.status).toBe(404);
			const body = (await response.json()) as ApiResponse<unknown>;
			expect(body.success).toBe(false);
			expect(body.error).toBe("Organization not found");
		});
	});
});
