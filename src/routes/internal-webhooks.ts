/**
 * Internal webhook management routes (service binding access).
 *
 * Mounted at /internal/webhooks in app.ts
 * Called by the api worker via service binding for webhook CRUD and delivery log access.
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";

type InternalBindings = { Bindings: Bindings };

const internalWebhookRoutes = new Hono<InternalBindings>();

interface WebhookEndpointRow {
	id: string;
	organization_id: string;
	environment: string;
	url: string;
	secret: string;
	description: string | null;
	events: string;
	active: number;
	created_by_id: string;
	created_at: string;
	updated_at: string;
}

interface WebhookDeliveryRow {
	id: string;
	endpoint_id: string;
	organization_id: string;
	environment: string;
	event_type: string;
	payload: string;
	status: string;
	attempts: number;
	last_attempt_at: string | null;
	last_response_status: number | null;
	last_error: string | null;
	created_at: string;
}

function mapEndpoint(row: WebhookEndpointRow) {
	return {
		id: row.id,
		organizationId: row.organization_id,
		environment: row.environment,
		url: row.url,
		description: row.description,
		events: JSON.parse(row.events),
		active: Boolean(row.active),
		createdById: row.created_by_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapDelivery(row: WebhookDeliveryRow) {
	return {
		id: row.id,
		endpointId: row.endpoint_id,
		organizationId: row.organization_id,
		environment: row.environment,
		eventType: row.event_type,
		payload: JSON.parse(row.payload),
		status: row.status,
		attempts: row.attempts,
		lastAttemptAt: row.last_attempt_at,
		lastResponseStatus: row.last_response_status,
		lastError: row.last_error,
		createdAt: row.created_at,
	};
}

// ── Endpoint CRUD ───────────────────────────────────────────────────────────

internalWebhookRoutes.get("/endpoints", async (c) => {
	const organizationId = c.req.query("organizationId");
	const environment = c.req.query("environment") ?? "production";

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const result = await c.env.DB.prepare(
		`SELECT * FROM webhook_endpoints
		 WHERE organization_id = ? AND environment = ?
		 ORDER BY created_at DESC`,
	)
		.bind(organizationId, environment)
		.all<WebhookEndpointRow>();

	return c.json({
		success: true,
		data: (result.results ?? []).map(mapEndpoint),
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

	const id = crypto.randomUUID();
	const secret = generateWebhookSecret();
	const now = new Date().toISOString();
	const environment = body.environment ?? "production";

	await c.env.DB.prepare(
		`INSERT INTO webhook_endpoints
		 (id, organization_id, environment, url, secret, description, events, active, created_by_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
	)
		.bind(
			id,
			body.organizationId,
			environment,
			body.url,
			secret,
			body.description ?? null,
			JSON.stringify(body.events),
			body.organizationId,
			now,
			now,
		)
		.run();

	return c.json(
		{
			success: true,
			data: {
				id,
				organizationId: body.organizationId,
				environment,
				url: body.url,
				description: body.description ?? null,
				events: body.events,
				active: true,
				secret,
				createdAt: now,
				updatedAt: now,
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

	const row = await c.env.DB.prepare(
		`SELECT * FROM webhook_endpoints WHERE id = ? AND organization_id = ? LIMIT 1`,
	)
		.bind(id, organizationId)
		.first<WebhookEndpointRow>();

	if (!row) {
		return c.json({ success: false, error: "Endpoint not found" }, 404);
	}

	return c.json({ success: true, data: mapEndpoint(row) });
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

	const existing = await c.env.DB.prepare(
		`SELECT id FROM webhook_endpoints WHERE id = ? AND organization_id = ? LIMIT 1`,
	)
		.bind(id, body.organizationId)
		.first<{ id: string }>();

	if (!existing) {
		return c.json({ success: false, error: "Endpoint not found" }, 404);
	}

	const sets: string[] = [];
	const values: (string | number)[] = [];

	if (body.url !== undefined) {
		sets.push("url = ?");
		values.push(body.url);
	}
	if (body.description !== undefined) {
		sets.push("description = ?");
		values.push(body.description);
	}
	if (body.events !== undefined) {
		sets.push("events = ?");
		values.push(JSON.stringify(body.events));
	}
	if (body.active !== undefined) {
		sets.push("active = ?");
		values.push(body.active ? 1 : 0);
	}

	if (sets.length === 0) {
		return c.json({ success: true, data: { id } });
	}

	sets.push("updated_at = ?");
	values.push(new Date().toISOString());
	values.push(id);

	await c.env.DB.prepare(
		`UPDATE webhook_endpoints SET ${sets.join(", ")} WHERE id = ?`,
	)
		.bind(...values)
		.run();

	const updated = await c.env.DB.prepare(
		`SELECT * FROM webhook_endpoints WHERE id = ? LIMIT 1`,
	)
		.bind(id)
		.first<WebhookEndpointRow>();

	return c.json({ success: true, data: updated ? mapEndpoint(updated) : null });
});

internalWebhookRoutes.delete("/endpoints/:id", async (c) => {
	const id = c.req.param("id");
	const organizationId = c.req.query("organizationId");

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const existing = await c.env.DB.prepare(
		`SELECT id FROM webhook_endpoints WHERE id = ? AND organization_id = ? LIMIT 1`,
	)
		.bind(id, organizationId)
		.first<{ id: string }>();

	if (!existing) {
		return c.json({ success: false, error: "Endpoint not found" }, 404);
	}

	await c.env.DB.prepare(`DELETE FROM webhook_endpoints WHERE id = ?`)
		.bind(id)
		.run();

	return c.json({ success: true });
});

// ── Delivery logs ───────────────────────────────────────────────────────────

internalWebhookRoutes.get("/deliveries", async (c) => {
	const organizationId = c.req.query("organizationId");
	const environment = c.req.query("environment") ?? "production";

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const result = await c.env.DB.prepare(
		`SELECT * FROM webhook_deliveries
		 WHERE organization_id = ? AND environment = ?
		 ORDER BY created_at DESC
		 LIMIT 100`,
	)
		.bind(organizationId, environment)
		.all<WebhookDeliveryRow>();

	return c.json({
		success: true,
		data: (result.results ?? []).map(mapDelivery),
	});
});

internalWebhookRoutes.get("/deliveries/:id", async (c) => {
	const id = c.req.param("id");
	const organizationId = c.req.query("organizationId");

	if (!organizationId) {
		return c.json({ success: false, error: "organizationId required" }, 400);
	}

	const row = await c.env.DB.prepare(
		`SELECT * FROM webhook_deliveries WHERE id = ? AND organization_id = ? LIMIT 1`,
	)
		.bind(id, organizationId)
		.first<WebhookDeliveryRow>();

	if (!row) {
		return c.json({ success: false, error: "Delivery not found" }, 404);
	}

	return c.json({ success: true, data: mapDelivery(row) });
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

	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	await c.env.DB.prepare(
		`INSERT INTO webhook_deliveries
		 (id, endpoint_id, organization_id, environment, event_type, payload, status, attempts, last_attempt_at, last_response_status, last_error, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
	)
		.bind(
			id,
			body.endpointId,
			body.organizationId,
			body.environment,
			body.eventType,
			body.payload,
			body.status,
			now,
			body.responseStatus ?? null,
			body.error ?? null,
			now,
		)
		.run();

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

function generateWebhookSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return `whsec_${Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;
}

export { internalWebhookRoutes };
