import { describe, expect, it } from "vitest";

import {
	originMatchesAnyPattern,
	originMatchesPattern,
} from "../../src/http/origins";

describe("originMatchesPattern", () => {
	it("matches exact origin", () => {
		expect(
			originMatchesPattern("https://example.com", "https://example.com"),
		).toBe(true);
	});

	it("matches wildcard subdomain pattern", () => {
		expect(
			originMatchesPattern("https://app.example.com", "https://*.example.com"),
		).toBe(true);
		expect(
			originMatchesPattern("https://api.example.com", "https://*.example.com"),
		).toBe(true);
	});

	it("does not match base domain with wildcard pattern", () => {
		expect(
			originMatchesPattern("https://example.com", "https://*.example.com"),
		).toBe(false);
	});

	it("matches localhost with wildcard port", () => {
		expect(
			originMatchesPattern("http://localhost:3000", "http://localhost:*"),
		).toBe(true);
		expect(
			originMatchesPattern("http://localhost:8080", "http://localhost:*"),
		).toBe(true);
	});

	it("does not match different schemes", () => {
		expect(
			originMatchesPattern("http://example.com", "https://example.com"),
		).toBe(false);
	});

	it("handles invalid origin gracefully", () => {
		expect(originMatchesPattern("not-a-url", "https://example.com")).toBe(
			false,
		);
	});
});

describe("originMatchesAnyPattern", () => {
	it("returns true if any pattern matches", () => {
		expect(
			originMatchesAnyPattern("https://app.example.com", [
				"https://*.example.com",
				"https://other.com",
			]),
		).toBe(true);
	});

	it("returns false if no pattern matches", () => {
		expect(
			originMatchesAnyPattern("https://app.example.com", [
				"https://other.com",
				"https://*.different.com",
			]),
		).toBe(false);
	});

	it("returns false for empty patterns array", () => {
		expect(originMatchesAnyPattern("https://example.com", [])).toBe(false);
	});
});
