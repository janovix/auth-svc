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
