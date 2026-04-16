/**
 * Internal webhook management routes (service binding access).
 *
 * Mounted at /internal/webhooks in app.ts
 * Called by the api worker via service binding for webhook CRUD and delivery log access.
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";
import {
	createWebhookDelivery,
	createWebhookEndpoint,
	deleteWebhookEndpoint,
	getWebhookDeliveryById,
	getWebhookEndpointById,
	listWebhookDeliveries,
	listWebhookEndpoints,
	parseWebhookEnvironment,
	updateWebhookEndpoint,
} from "../domain/webhooks/service";

type InternalBindings = { Bindings: Bindings };

const internalWebhookRoutes = new Hono<InternalBindings>();

// ── Endpoint CRUD ───────────────────────────────────────────────────────────

internalWebhookRoutes.get("/endpoints", async (c) => {
	const organizationId = c.req.query("organizationId");
	const environment = parseWebhookEnvironment(c.req.query("environment"));

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const data = await listWebhookEndpoints(
		c.env.DB,
		organizationId,
		environment,
	);

	return c.json({
		success: true,
		data,
	});
});

internalWebhookRoutes.post("/endpoints", async (c) => {
	const body = await c.req.json<{
		organizationId: string;
		environment: string;
		url: string;
		description?: string;
		events: string[];
	}>();

	if (!body.organizationId || !body.url || !body.events?.length) {
		return c.json(
			{ success: false, error: "organizationId, url, and events required" },
			400,
		);
	}

	const environment = parseWebhookEnvironment(body.environment);

	const { data, secret } = await createWebhookEndpoint(c.env.DB, {
		organizationId: body.organizationId,
		environment,
		url: body.url,
		description: body.description ?? null,
		events: body.events,
		// Preserves historical internal contract (was bound to organizationId)
		createdById: body.organizationId,
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

internalWebhookRoutes.get("/endpoints/:id", async (c) => {
	const id = c.req.param("id");
	const organizationId = c.req.query("organizationId");

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const data = await getWebhookEndpointById(c.env.DB, id, organizationId);

	if (!data) {
		return c.json({ success: false, error: "Endpoint not found" }, 404);
	}

	return c.json({ success: true, data });
});

internalWebhookRoutes.put("/endpoints/:id", async (c) => {
	const id = c.req.param("id");
	const body = await c.req.json<{
		organizationId: string;
		url?: string;
		description?: string;
		events?: string[];
		active?: boolean;
	}>();

	if (!body.organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const updated = await updateWebhookEndpoint(
		c.env.DB,
		id,
		body.organizationId,
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

internalWebhookRoutes.delete("/endpoints/:id", async (c) => {
	const id = c.req.param("id");
	const organizationId = c.req.query("organizationId");

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const deleted = await deleteWebhookEndpoint(c.env.DB, id, organizationId);

	if (!deleted) {
		return c.json({ success: false, error: "Endpoint not found" }, 404);
	}

	return c.json({ success: true });
});

// ── Delivery logs ───────────────────────────────────────────────────────────

internalWebhookRoutes.get("/deliveries", async (c) => {
	const organizationId = c.req.query("organizationId");
	const environment = parseWebhookEnvironment(c.req.query("environment"));

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const data = await listWebhookDeliveries(
		c.env.DB,
		organizationId,
		environment,
	);

	return c.json({
		success: true,
		data,
	});
});

internalWebhookRoutes.get("/deliveries/:id", async (c) => {
	const id = c.req.param("id");
	const organizationId = c.req.query("organizationId");

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const data = await getWebhookDeliveryById(c.env.DB, id, organizationId);

	if (!data) {
		return c.json({ success: false, error: "Delivery not found" }, 404);
	}

	return c.json({ success: true, data });
});

internalWebhookRoutes.post("/deliveries", async (c) => {
	const body = await c.req.json<{
		endpointId: string;
		organizationId: string;
		environment: string;
		eventType: string;
		payload: string;
		status: string;
		responseStatus?: number;
		error?: string;
	}>();

	const { id } = await createWebhookDelivery(c.env.DB, {
		endpointId: body.endpointId,
		organizationId: body.organizationId,
		environment: body.environment,
		eventType: body.eventType,
		payload: body.payload,
		status: body.status,
		responseStatus: body.responseStatus,
		error: body.error,
	});

	return c.json({ success: true, data: { id } }, 201);
});

internalWebhookRoutes.post("/test", async (c) => {
	const body = await c.req.json<{
		organizationId: string;
		environment: string;
	}>();

	if (!body.organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	return c.json({
		success: true,
		data: {
			message: "Test webhook event queued",
			eventType: "test.ping",
		},
	});
});

export { internalWebhookRoutes };
