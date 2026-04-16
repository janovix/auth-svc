/**
 * Session-authenticated webhook management for the auth dashboard SPA.
 * Mounted at /api/webhooks in app.ts
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";
import {
	createWebhookEndpoint,
	deleteWebhookEndpoint,
	listWebhookDeliveries,
	listWebhookEndpoints,
	parseWebhookEnvironment,
	updateWebhookEndpoint,
} from "../domain/webhooks/service";

type WebhooksPublicBindings = { Bindings: Bindings };
type WebhooksPublicContext = Context<WebhooksPublicBindings>;

const publicWebhookRoutes = new Hono<WebhooksPublicBindings>();

async function getAuthenticatedUser(c: WebhooksPublicContext): Promise<{
	id: string;
	organizationId: string | null;
} | null> {
	try {
		const { auth } = await getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) return null;

		const activeOrgId =
			(session.session as { activeOrganizationId?: string })
				?.activeOrganizationId ?? null;

		return {
			id: session.user.id,
			organizationId: activeOrgId,
		};
	} catch {
		return null;
	}
}

async function isOrgOwnerOrAdmin(
	db: D1Database,
	userId: string,
	organizationId: string,
): Promise<boolean> {
	const result = await db
		.prepare(
			`SELECT role FROM members WHERE userId = ? AND organizationId = ? LIMIT 1`,
		)
		.bind(userId, organizationId)
		.first<{ role: string }>();
	return result?.role === "owner" || result?.role === "admin";
}

async function resolveWebhookAccess(
	c: WebhooksPublicContext,
): Promise<Response | { userId: string; organizationId: string }> {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}
	if (!user.organizationId) {
		return c.json({ success: false, error: "No active organization" }, 409);
	}
	const canManage = await isOrgOwnerOrAdmin(
		c.env.DB,
		user.id,
		user.organizationId,
	);
	if (!canManage) {
		return c.json(
			{
				success: false,
				error: "Forbidden: Owner or admin access required",
			},
			403,
		);
	}
	return { userId: user.id, organizationId: user.organizationId };
}

publicWebhookRoutes.get("/endpoints", async (c) => {
	const ctx = await resolveWebhookAccess(c);
	if (ctx instanceof Response) return ctx;

	const environment = parseWebhookEnvironment(c.req.query("environment"));
	const data = await listWebhookEndpoints(
		c.env.DB,
		ctx.organizationId,
		environment,
	);

	return c.json({ success: true, data });
});

publicWebhookRoutes.post("/endpoints", async (c) => {
	const ctx = await resolveWebhookAccess(c);
	if (ctx instanceof Response) return ctx;

	const body = await c.req.json<{
		organizationId?: string;
		url: string;
		description?: string;
		events: string[];
		environment?: string;
	}>();

	if (!body.url || !body.events?.length) {
		return c.json(
			{ success: false, error: "url and events are required" },
			400,
		);
	}

	const environment = parseWebhookEnvironment(body.environment);

	const { data, secret } = await createWebhookEndpoint(c.env.DB, {
		organizationId: ctx.organizationId,
		environment,
		url: body.url,
		description: body.description ?? null,
		events: body.events,
		createdById: ctx.userId,
	});

	return c.json(
		{
			success: true,
			data: {
				...data,
				secret,
			},
		},
		201,
	);
});

publicWebhookRoutes.put("/endpoints/:id", async (c) => {
	const ctx = await resolveWebhookAccess(c);
	if (ctx instanceof Response) return ctx;

	const id = c.req.param("id");
	const body = await c.req.json<{
		organizationId?: string;
		url?: string;
		description?: string;
		events?: string[];
		active?: boolean;
	}>();

	const updated = await updateWebhookEndpoint(
		c.env.DB,
		id,
		ctx.organizationId,
		{
			url: body.url,
			description: body.description,
			events: body.events,
			active: body.active,
		},
	);

	if (!updated) {
		return c.json({ success: false, error: "Endpoint not found" }, 404);
	}

	return c.json({ success: true, data: updated });
});

publicWebhookRoutes.delete("/endpoints/:id", async (c) => {
	const ctx = await resolveWebhookAccess(c);
	if (ctx instanceof Response) return ctx;

	const id = c.req.param("id");
	const deleted = await deleteWebhookEndpoint(c.env.DB, id, ctx.organizationId);

	if (!deleted) {
		return c.json({ success: false, error: "Endpoint not found" }, 404);
	}

	return c.json({ success: true });
});

publicWebhookRoutes.get("/deliveries", async (c) => {
	const ctx = await resolveWebhookAccess(c);
	if (ctx instanceof Response) return ctx;

	const environment = parseWebhookEnvironment(c.req.query("environment"));
	const data = await listWebhookDeliveries(
		c.env.DB,
		ctx.organizationId,
		environment,
	);

	return c.json({ success: true, data });
});

export { publicWebhookRoutes };
