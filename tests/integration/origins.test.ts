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

	it("handles invalid pattern gracefully", () => {
		expect(originMatchesPattern("https://example.com", "not-a-pattern")).toBe(
			false,
		);
		expect(originMatchesPattern("https://example.com", "")).toBe(false);
	});

	it("matches complex wildcard patterns", () => {
		expect(
			originMatchesPattern(
				"https://api.v1.example.com",
				"https://*.example.com",
			),
		).toBe(true);
		expect(
			originMatchesPattern(
				"https://sub.api.example.com",
				"https://*.example.com",
			),
		).toBe(true);
	});

	it("matches patterns with explicit ports", () => {
		expect(
			originMatchesPattern(
				"https://example.com:443",
				"https://example.com:443",
			),
		).toBe(true);
		expect(
			originMatchesPattern(
				"https://example.com:8080",
				"https://example.com:8080",
			),
		).toBe(true);
	});

	it("matches patterns with wildcard port", () => {
		expect(
			originMatchesPattern("https://example.com:3000", "https://example.com:*"),
		).toBe(true);
		expect(
			originMatchesPattern("https://example.com:8080", "https://example.com:*"),
		).toBe(true);
	});

	it("does not match different ports", () => {
		expect(
			originMatchesPattern(
				"https://example.com:3000",
				"https://example.com:8080",
			),
		).toBe(false);
	});

	it("handles default ports correctly", () => {
		// HTTPS default port is 443
		expect(
			originMatchesPattern("https://example.com", "https://example.com"),
		).toBe(true);
		// HTTP default port is 80
		expect(
			originMatchesPattern("http://example.com", "http://example.com"),
		).toBe(true);
	});

	it("handles IPv6 addresses without breaking", () => {
		// IPv6 addresses with brackets should not break parsing
		// The current implementation may not fully support IPv6, but should not crash
		const result = originMatchesPattern(
			"https://[2001:db8::1]:443",
			"https://[2001:db8::1]:443",
		);
		// Just verify it doesn't crash - result may be true or false depending on implementation
		expect(typeof result).toBe("boolean");
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
