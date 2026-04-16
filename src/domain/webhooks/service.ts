/**
 * Shared D1 persistence for webhook endpoints and delivery logs.
 * Used by internal (service binding) routes and public session routes.
 */

export interface WebhookEndpointRow {
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

export interface WebhookDeliveryRow {
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

export const WEBHOOK_ENVIRONMENTS = [
	"production",
	"staging",
	"development",
] as const;

export type WebhookEnvironment = (typeof WEBHOOK_ENVIRONMENTS)[number];

export function parseWebhookEnvironment(
	raw: string | undefined,
): WebhookEnvironment {
	if (raw === "staging" || raw === "development") return raw;
	return "production";
}

export function mapEndpoint(row: WebhookEndpointRow) {
	return {
		id: row.id,
		organizationId: row.organization_id,
		environment: row.environment,
		url: row.url,
		description: row.description,
		events: JSON.parse(row.events) as string[],
		active: Boolean(row.active),
		createdById: row.created_by_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function mapDelivery(row: WebhookDeliveryRow) {
	return {
		id: row.id,
		endpointId: row.endpoint_id,
		organizationId: row.organization_id,
		environment: row.environment,
		eventType: row.event_type,
		payload: JSON.parse(row.payload) as unknown,
		status: row.status,
		attempts: row.attempts,
		lastAttemptAt: row.last_attempt_at,
		lastResponseStatus: row.last_response_status,
		lastError: row.last_error,
		createdAt: row.created_at,
	};
}

export function generateWebhookSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return `whsec_${Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;
}

export async function listWebhookEndpoints(
	db: D1Database,
	organizationId: string,
	environment: string,
): Promise<ReturnType<typeof mapEndpoint>[]> {
	const result = await db
		.prepare(
			`SELECT * FROM webhook_endpoints
		 WHERE organization_id = ? AND environment = ?
		 ORDER BY created_at DESC`,
		)
		.bind(organizationId, environment)
		.all<WebhookEndpointRow>();

	return (result.results ?? []).map(mapEndpoint);
}

export async function getWebhookEndpointById(
	db: D1Database,
	id: string,
	organizationId: string,
): Promise<ReturnType<typeof mapEndpoint> | null> {
	const row = await db
		.prepare(
			`SELECT * FROM webhook_endpoints WHERE id = ? AND organization_id = ? LIMIT 1`,
		)
		.bind(id, organizationId)
		.first<WebhookEndpointRow>();

	return row ? mapEndpoint(row) : null;
}

export async function createWebhookEndpoint(
	db: D1Database,
	input: {
		organizationId: string;
		environment: string;
		url: string;
		description?: string | null;
		events: string[];
		createdById: string;
	},
): Promise<{ data: ReturnType<typeof mapEndpoint>; secret: string }> {
	const id = crypto.randomUUID();
	const secret = generateWebhookSecret();
	const now = new Date().toISOString();
	const environment = input.environment ?? "production";

	await db
		.prepare(
			`INSERT INTO webhook_endpoints
		 (id, organization_id, environment, url, secret, description, events, active, created_by_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
		)
		.bind(
			id,
			input.organizationId,
			environment,
			input.url,
			secret,
			input.description ?? null,
			JSON.stringify(input.events),
			input.createdById,
			now,
			now,
		)
		.run();

	const row = await db
		.prepare(`SELECT * FROM webhook_endpoints WHERE id = ? LIMIT 1`)
		.bind(id)
		.first<WebhookEndpointRow>();

	if (!row) {
		throw new Error("Failed to read created webhook endpoint");
	}

	return { data: mapEndpoint(row), secret };
}

export async function updateWebhookEndpoint(
	db: D1Database,
	id: string,
	organizationId: string,
	body: {
		url?: string;
		description?: string;
		events?: string[];
		active?: boolean;
	},
): Promise<ReturnType<typeof mapEndpoint> | null> {
	const existing = await db
		.prepare(
			`SELECT id FROM webhook_endpoints WHERE id = ? AND organization_id = ? LIMIT 1`,
		)
		.bind(id, organizationId)
		.first<{ id: string }>();

	if (!existing) {
		return null;
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
		return getWebhookEndpointById(db, id, organizationId);
	}

	sets.push("updated_at = ?");
	values.push(new Date().toISOString());
	values.push(id);

	await db
		.prepare(`UPDATE webhook_endpoints SET ${sets.join(", ")} WHERE id = ?`)
		.bind(...values)
		.run();

	return getWebhookEndpointById(db, id, organizationId);
}

export async function deleteWebhookEndpoint(
	db: D1Database,
	id: string,
	organizationId: string,
): Promise<boolean> {
	const existing = await db
		.prepare(
			`SELECT id FROM webhook_endpoints WHERE id = ? AND organization_id = ? LIMIT 1`,
		)
		.bind(id, organizationId)
		.first<{ id: string }>();

	if (!existing) {
		return false;
	}

	await db.prepare(`DELETE FROM webhook_endpoints WHERE id = ?`).bind(id).run();
	return true;
}

export async function listWebhookDeliveries(
	db: D1Database,
	organizationId: string,
	environment: string,
	limit = 100,
): Promise<ReturnType<typeof mapDelivery>[]> {
	const result = await db
		.prepare(
			`SELECT * FROM webhook_deliveries
		 WHERE organization_id = ? AND environment = ?
		 ORDER BY created_at DESC
		 LIMIT ?`,
		)
		.bind(organizationId, environment, limit)
		.all<WebhookDeliveryRow>();

	return (result.results ?? []).map(mapDelivery);
}

export async function getWebhookDeliveryById(
	db: D1Database,
	id: string,
	organizationId: string,
): Promise<ReturnType<typeof mapDelivery> | null> {
	const row = await db
		.prepare(
			`SELECT * FROM webhook_deliveries WHERE id = ? AND organization_id = ? LIMIT 1`,
		)
		.bind(id, organizationId)
		.first<WebhookDeliveryRow>();

	return row ? mapDelivery(row) : null;
}

export async function createWebhookDelivery(
	db: D1Database,
	body: {
		endpointId: string;
		organizationId: string;
		environment: string;
		eventType: string;
		payload: string;
		status: string;
		responseStatus?: number;
		error?: string | null;
	},
): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	await db
		.prepare(
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

	return { id };
}
