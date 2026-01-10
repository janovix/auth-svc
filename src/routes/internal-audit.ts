/**
 * Internal audit routes for service binding access
 * These endpoints are used by other services via Cloudflare service bindings
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";
import { AuditService } from "../domain/audit";
import { createAuditLogSchema } from "../domain/audit/schemas";

type InternalBindings = {
	Bindings: Bindings;
};

const internalAuditRoutes = new Hono<InternalBindings>();

/**
 * POST /internal/audit/log
 * Create an audit log entry from another service
 *
 * This endpoint is used by other services (aml-svc, import-svc, etc.)
 * to log audit events via service binding.
 *
 * No authentication required - service bindings are trusted.
 */
internalAuditRoutes.post("/log", async (c) => {
	const jsonBody = await c.req.json();
	const parseResult = createAuditLogSchema.safeParse(jsonBody);

	if (!parseResult.success) {
		return c.json(
			{
				success: false,
				error: "Invalid input",
				details: parseResult.error.errors,
			},
			400,
		);
	}

	const input = parseResult.data;
	const service = new AuditService(c.env.DB);

	try {
		const entry = await service.createLog(input);

		return c.json({
			success: true,
			data: {
				id: entry.id,
				signature: entry.signature,
			},
		});
	} catch (error) {
		console.error("Failed to create audit log:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to create audit log",
			},
			500,
		);
	}
});

/**
 * GET /internal/audit/latest
 * Get the latest audit log entry (for chain verification)
 */
internalAuditRoutes.get("/latest", async (c) => {
	const db = c.env.DB;
	const result = await db
		.prepare(
			`SELECT signature FROM audit_logs ORDER BY created_at DESC LIMIT 1`,
		)
		.first<{ signature: string }>();

	return c.json({
		success: true,
		data: {
			latestSignature: result?.signature ?? null,
		},
	});
});

/**
 * POST /internal/audit/verify
 * Verify chain integrity (for monitoring)
 */
internalAuditRoutes.post("/verify", async (c) => {
	const auditService = new AuditService(c.env.DB);

	const result = await auditService.verifyChainIntegrity(
		undefined,
		undefined,
		100,
	);

	return c.json({
		success: true,
		data: result,
	});
});

export { internalAuditRoutes };
