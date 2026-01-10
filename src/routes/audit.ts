/**
 * Audit routes for audit log management
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { AuditService } from "../domain/audit";
import {
	auditLogFiltersSchema,
	paginationSchema,
	exportRequestSchema,
	verifyChainSchema,
} from "../domain/audit/schemas";
import { getBetterAuthContext } from "../auth/instance";

type AuditBindings = {
	Bindings: Bindings;
};

type AuditContext = Context<AuditBindings>;

const auditRoutes = new Hono<AuditBindings>();

/**
 * Helper to get authenticated user from session
 */
async function getAuthenticatedUser(
	c: AuditContext,
): Promise<{ id: string; role: string } | null> {
	try {
		const { auth } = getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) {
			return null;
		}
		return {
			id: session.user.id,
			role: (session.user as { role?: string }).role ?? "user",
		};
	} catch {
		return null;
	}
}

/**
 * Check if user is admin
 */
function isAdmin(user: { role: string } | null): boolean {
	return user?.role === "admin" || user?.role === "owner";
}

/**
 * GET /api/audit
 * List audit logs with filters and pagination (admin only)
 */
auditRoutes.get("/", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!isAdmin(user)) {
		return c.json(
			{ success: false, error: "Forbidden: Admin access required" },
			403,
		);
	}

	// Parse query params
	const queryParams = {
		eventType: c.req.query("eventType"),
		entityType: c.req.query("entityType"),
		entityId: c.req.query("entityId"),
		actorUserId: c.req.query("actorUserId"),
		actorOrganizationId: c.req.query("actorOrganizationId"),
		sourceService: c.req.query("sourceService"),
		startDate: c.req.query("startDate"),
		endDate: c.req.query("endDate"),
		search: c.req.query("search"),
		page: c.req.query("page"),
		limit: c.req.query("limit"),
	};

	const parseResult = auditLogFiltersSchema
		.merge(paginationSchema)
		.safeParse(queryParams);
	if (!parseResult.success) {
		return c.json(
			{
				success: false,
				error: "Invalid query params",
				details: parseResult.error.errors,
			},
			400,
		);
	}

	const query = parseResult.data;
	const service = new AuditService(c.env.DB);

	// Parse dates if provided
	const filters = {
		...query,
		startDate: query.startDate ? new Date(query.startDate) : undefined,
		endDate: query.endDate ? new Date(query.endDate) : undefined,
	};

	const result = await service.list(filters, {
		page: query.page,
		limit: query.limit,
	});

	return c.json({
		success: true,
		data: result.data,
		pagination: result.pagination,
	});
});

/**
 * GET /api/audit/:id
 * Get single audit log entry (admin only)
 */
auditRoutes.get("/:id", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!isAdmin(user)) {
		return c.json(
			{ success: false, error: "Forbidden: Admin access required" },
			403,
		);
	}

	const id = c.req.param("id");
	const service = new AuditService(c.env.DB);
	const entry = await service.getById(id);

	if (!entry) {
		return c.json({ success: false, error: "Audit log not found" }, 404);
	}

	return c.json({
		success: true,
		data: entry,
	});
});

/**
 * GET /api/audit/verify
 * Verify chain integrity (admin only)
 */
auditRoutes.get("/verify", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!isAdmin(user)) {
		return c.json(
			{ success: false, error: "Forbidden: Admin access required" },
			403,
		);
	}

	const queryParams = {
		startId: c.req.query("startId"),
		endId: c.req.query("endId"),
		limit: c.req.query("limit"),
	};

	const parseResult = verifyChainSchema.safeParse(queryParams);
	if (!parseResult.success) {
		return c.json(
			{
				success: false,
				error: "Invalid query params",
				details: parseResult.error.errors,
			},
			400,
		);
	}

	const query = parseResult.data;
	const service = new AuditService(c.env.DB);

	const result = await service.verifyChainIntegrity(
		query.startId,
		query.endId,
		query.limit,
	);

	return c.json({
		success: true,
		data: result,
	});
});

/**
 * POST /api/audit/export
 * Export audit logs (admin only)
 */
auditRoutes.post("/export", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!isAdmin(user)) {
		return c.json(
			{ success: false, error: "Forbidden: Admin access required" },
			403,
		);
	}

	const jsonBody = await c.req.json();
	const parseResult = exportRequestSchema.safeParse(jsonBody);
	if (!parseResult.success) {
		return c.json(
			{
				success: false,
				error: "Invalid request body",
				details: parseResult.error.errors,
			},
			400,
		);
	}

	const body = parseResult.data;
	const service = new AuditService(c.env.DB);

	// Parse dates in filters if provided
	const filters = body.filters
		? {
				...body.filters,
				startDate: body.filters.startDate
					? new Date(body.filters.startDate)
					: undefined,
				endDate: body.filters.endDate
					? new Date(body.filters.endDate)
					: undefined,
			}
		: {};

	const result = await service.export(body.format, filters);

	return new Response(result.data, {
		headers: {
			"Content-Type": result.contentType,
			"Content-Disposition": `attachment; filename="${result.filename}"`,
		},
	});
});

export { auditRoutes };
