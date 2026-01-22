/**
 * Admin routes for auth-svc
 *
 * All routes in this file require admin role
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";
import { sendPromotionEmail } from "../utils/mandrill";
import { executeInBackground } from "../auth/execution-context";

type AdminBindings = {
	Bindings: Bindings;
};

type AdminContext = Context<AdminBindings>;

export const adminRoutes = new Hono<AdminBindings>();

/**
 * Helper to get authenticated admin user
 */
async function getAuthenticatedAdmin(c: AdminContext): Promise<{
	id: string;
	email?: string;
} | null> {
	try {
		const executionContext = (
			c as unknown as { executionCtx?: ExecutionContext }
		).executionCtx;
		const { auth } = await getBetterAuthContext(c.env, executionContext);

		let session;
		try {
			session = await auth.api.getSession(c.req.raw);
		} catch {
			session = await auth.api.getSession({
				headers: c.req.raw.headers,
			});
		}

		if (!session?.user) {
			return null;
		}

		// Check if user has admin role
		const userRole = (session.user as { role?: string })?.role;
		if (userRole !== "admin") {
			return null;
		}

		return {
			id: session.user.id,
			email: session.user.email,
		};
	} catch (error) {
		console.error("[Admin] Error getting authenticated admin:", error);
		return null;
	}
}

/**
 * DELETE /api/admin/kv/flush
 * Flush all KV cache entries (admin only)
 *
 * WARNING: This is a destructive operation that removes all cached data.
 * Use with caution in production environments.
 */
adminRoutes.delete("/kv/flush", async (c) => {
	const admin = await getAuthenticatedAdmin(c);

	if (!admin) {
		return c.json(
			{
				success: false,
				error: "Unauthorized",
				message: "Admin access required",
			},
			403,
		);
	}

	const kv = c.env.KV;

	if (!kv) {
		return c.json(
			{
				success: false,
				error: "KV namespace not configured",
				message: "The KV namespace is not available",
			},
			503,
		);
	}

	try {
		let deletedCount = 0;
		let cursor: string | undefined;

		// Iterate through all keys and delete them
		do {
			const listResult = await kv.list({ cursor, limit: 1000 });
			const keys = listResult.keys;

			if (keys.length > 0) {
				// Delete keys in parallel batches
				await Promise.all(keys.map((key) => kv.delete(key.name)));
				deletedCount += keys.length;
			}

			cursor = listResult.list_complete ? undefined : listResult.cursor;
		} while (cursor);

		console.log(
			`[Admin] KV flush completed by admin ${admin.email}: ${deletedCount} entries deleted`,
		);

		return c.json({
			success: true,
			data: {
				deletedCount,
				message: `Successfully flushed ${deletedCount} KV entries`,
			},
		});
	} catch (error) {
		console.error("[Admin] Error flushing KV:", error);
		return c.json(
			{
				success: false,
				error: "KV Flush Failed",
				message:
					error instanceof Error ? error.message : "Unknown error occurred",
			},
			500,
		);
	}
});

/**
 * POST /api/admin/users/:userId/promote
 * Promote a visitor to user role (beta access grant)
 *
 * This endpoint:
 * 1. Validates the admin is authenticated
 * 2. Checks the target user exists and is a visitor
 * 3. Updates the user's role to "user"
 * 4. Sends a promotion notification email
 */
adminRoutes.post("/users/:userId/promote", async (c) => {
	const admin = await getAuthenticatedAdmin(c);

	if (!admin) {
		return c.json(
			{
				success: false,
				error: "Unauthorized",
				message: "Admin access required",
			},
			403,
		);
	}

	const userId = c.req.param("userId");

	if (!userId) {
		return c.json(
			{
				success: false,
				error: "Bad Request",
				message: "User ID is required",
			},
			400,
		);
	}

	try {
		// Get the target user
		const targetUser = await c.env.DB.prepare(
			`SELECT id, email, name, role FROM users WHERE id = ?`,
		)
			.bind(userId)
			.first<{
				id: string;
				email: string;
				name: string | null;
				role: string;
			}>();

		if (!targetUser) {
			return c.json(
				{
					success: false,
					error: "Not Found",
					message: "User not found",
				},
				404,
			);
		}

		// Check if user is already promoted
		if (targetUser.role !== "visitor") {
			return c.json(
				{
					success: false,
					error: "Bad Request",
					message: `User is already a ${targetUser.role}, not a visitor`,
				},
				400,
			);
		}

		// Update user role to "user"
		await c.env.DB.prepare(
			`UPDATE users SET role = 'user', updatedAt = datetime('now') WHERE id = ?`,
		)
			.bind(userId)
			.run();

		console.log(
			`[Admin] User ${userId} promoted from visitor to user by admin ${admin.email}`,
		);

		// Send promotion email in background
		const apiKey = c.env.MANDRILL_API_KEY;
		if (apiKey) {
			const authAppUrl =
				c.env.AUTH_FRONTEND_URL || "https://auth.janovix.workers.dev";

			const emailPromise = sendPromotionEmail(apiKey, {
				email: targetUser.email,
				userName: targetUser.name || targetUser.email.split("@")[0],
				loginUrl: `${authAppUrl}/login`,
			});

			executeInBackground(
				emailPromise,
				`Promotion email to ${targetUser.email}`,
			);
		} else {
			console.warn(
				"[Admin] MANDRILL_API_KEY not configured; promotion email skipped",
			);
		}

		return c.json({
			success: true,
			data: {
				userId: targetUser.id,
				email: targetUser.email,
				previousRole: "visitor",
				newRole: "user",
				message: "User promoted successfully",
			},
		});
	} catch (error) {
		console.error("[Admin] Error promoting user:", error);
		return c.json(
			{
				success: false,
				error: "Promotion Failed",
				message:
					error instanceof Error ? error.message : "Unknown error occurred",
			},
			500,
		);
	}
});
