/**
 * OpenAPI documentation for Admin endpoints
 *
 * These endpoint classes are used to generate OpenAPI documentation.
 * The actual implementations are in the corresponding route files.
 */
import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";

/**
 * DELETE /api/admin/kv/flush
 * Flush all KV cache entries (admin only)
 */
export class AdminKvFlushEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Admin"],
		summary: "Flush all KV cache entries",
		operationId: "adminKvFlush",
		description:
			"WARNING: This is a destructive operation that removes all cached data from the KV namespace. Use with caution in production environments. Requires admin role.",
		security: [{ BearerAuth: [] }],
		responses: {
			"200": {
				description: "KV cache flushed successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.object({
							deletedCount: z.number().describe("Number of KV entries deleted"),
							message: z.string(),
						}),
					}),
				),
			},
			"401": {
				description: "Unauthorized - missing or invalid token",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						message: z.string(),
					}),
				),
			},
			"403": {
				description: "Forbidden - admin role required",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						message: z.string(),
					}),
				),
			},
			"503": {
				description: "Service unavailable - KV namespace not configured",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						message: z.string(),
					}),
				),
			},
		},
	};

	// This is a documentation-only endpoint - actual implementation is in routes/admin.ts
	public async handle() {
		return {
			success: true,
			data: {
				deletedCount: 0,
				message: "Documentation endpoint",
			},
		};
	}
}

/**
 * POST /api/admin/users/:userId/promote
 * Promote a visitor to user role (beta access grant)
 */
export class AdminPromoteUserEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Admin"],
		summary: "Promote visitor to user",
		operationId: "adminPromoteUser",
		description:
			"Promotes a user from 'visitor' role to 'user' role, granting them full beta access. Sends a notification email to the user. Requires admin role.",
		security: [{ BearerAuth: [] }],
		request: {
			params: z.object({
				userId: z.string().describe("The ID of the user to promote"),
			}),
		},
		responses: {
			"200": {
				description: "User promoted successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.object({
							userId: z.string().describe("The promoted user's ID"),
							email: z.string().describe("The promoted user's email"),
							previousRole: z.string().describe("The previous role (visitor)"),
							newRole: z.string().describe("The new role (user)"),
							message: z.string(),
						}),
					}),
				),
			},
			"400": {
				description: "Bad request - missing userId or user is not a visitor",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						message: z.string(),
					}),
				),
			},
			"403": {
				description: "Forbidden - admin role required",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						message: z.string(),
					}),
				),
			},
			"404": {
				description: "Not found - user does not exist",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						message: z.string(),
					}),
				),
			},
			"500": {
				description: "Internal server error",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						message: z.string(),
					}),
				),
			},
		},
	};

	// This is a documentation-only endpoint - actual implementation is in routes/admin.ts
	public async handle() {
		return {
			success: true,
			data: {
				userId: "doc-user-id",
				email: "doc@example.com",
				previousRole: "visitor",
				newRole: "user",
				message: "Documentation endpoint",
			},
		};
	}
}
