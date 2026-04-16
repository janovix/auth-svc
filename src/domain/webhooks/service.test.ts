import { describe, expect, it } from "vitest";
import { parseWebhookEnvironment } from "./service";

describe("parseWebhookEnvironment", () => {
	it("defaults unknown values to production", () => {
		expect(parseWebhookEnvironment(undefined)).toBe("production");
		expect(parseWebhookEnvironment("")).toBe("production");
		expect(parseWebhookEnvironment("prod")).toBe("production");
	});

	it("accepts staging and development", () => {
		expect(parseWebhookEnvironment("staging")).toBe("staging");
		expect(parseWebhookEnvironment("development")).toBe("development");
	});

	it("accepts production explicitly", () => {
		expect(parseWebhookEnvironment("production")).toBe("production");
	});
});
