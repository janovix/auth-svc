import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/webhooks/endpoints", () => {
	it("returns 401 without a session", async () => {
		const res = await SELF.fetch(
			"http://local.test/api/webhooks/endpoints?environment=staging",
			{ method: "GET" },
		);
		expect(res.status).toBe(401);
		const body = (await res.json()) as { success: boolean; error?: string };
		expect(body.success).toBe(false);
		expect(body.error).toBeDefined();
	});
});

describe("GET /api/webhooks/deliveries", () => {
	it("returns 401 without a session", async () => {
		const res = await SELF.fetch(
			"http://local.test/api/webhooks/deliveries?environment=production",
			{ method: "GET" },
		);
		expect(res.status).toBe(401);
	});
});

describe("POST /api/webhooks/endpoints", () => {
	it("returns 401 without a session", async () => {
		const res = await SELF.fetch("http://local.test/api/webhooks/endpoints", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com/hook",
				events: ["client.created"],
				environment: "staging",
			}),
		});
		expect(res.status).toBe(401);
	});
});
