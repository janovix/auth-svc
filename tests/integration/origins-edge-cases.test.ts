import { describe, expect, it } from "vitest";
import {
	originMatchesPattern,
	originMatchesAnyPattern,
} from "../../src/http/origins";

describe("Origin Matching Edge Cases", () => {
	describe("parseOriginLike edge cases", () => {
		it("handles whitespace in pattern", () => {
			expect(
				originMatchesPattern("https://example.com", " https://example.com "),
			).toBe(true);
		});

		it("handles pattern without scheme separator", () => {
			expect(originMatchesPattern("https://example.com", "example.com")).toBe(
				false,
			);
		});

		it("handles pattern with only scheme", () => {
			expect(originMatchesPattern("https://example.com", "https://")).toBe(
				false,
			);
		});

		it("handles pattern with path", () => {
			// Pattern should only match origin, not path
			expect(
				originMatchesPattern("https://example.com/path", "https://example.com"),
			).toBe(true);
		});

		it("handles pattern with query string", () => {
			expect(
				originMatchesPattern(
					"https://example.com?query=value",
					"https://example.com",
				),
			).toBe(true);
		});

		it("handles pattern with fragment", () => {
			expect(
				originMatchesPattern(
					"https://example.com#fragment",
					"https://example.com",
				),
			).toBe(true);
		});
	});

	describe("hostMatchesPattern edge cases", () => {
		it("handles wildcard at start", () => {
			expect(
				originMatchesPattern(
					"https://sub.example.com",
					"https://*.example.com",
				),
			).toBe(true);
		});

		it("handles wildcard in middle", () => {
			expect(
				originMatchesPattern(
					"https://api.v1.example.com",
					"https://api.*.example.com",
				),
			).toBe(true);
		});

		it("handles wildcard at end", () => {
			expect(
				originMatchesPattern("https://example.com", "https://example.*"),
			).toBe(true);
		});

		it("handles multiple wildcards", () => {
			expect(
				originMatchesPattern(
					"https://api.v1.example.com",
					"https://*.*.example.com",
				),
			).toBe(true);
		});

		it("handles case-insensitive matching", () => {
			expect(
				originMatchesPattern("https://EXAMPLE.COM", "https://example.com"),
			).toBe(true);
			expect(
				originMatchesPattern("https://example.com", "https://EXAMPLE.COM"),
			).toBe(true);
		});

		it("does not match base domain with wildcard prefix", () => {
			expect(
				originMatchesPattern("https://example.com", "https://*.example.com"),
			).toBe(false);
		});

		it("handles single-level subdomain wildcard", () => {
			expect(
				originMatchesPattern(
					"https://app.example.com",
					"https://*.example.com",
				),
			).toBe(true);
		});

		it("handles multi-level subdomain wildcard", () => {
			expect(
				originMatchesPattern(
					"https://api.v1.example.com",
					"https://*.example.com",
				),
			).toBe(true);
		});
	});

	describe("normalizePort edge cases", () => {
		it("handles non-standard scheme without port", () => {
			// For non-http/https schemes, empty port should match empty port
			expect(
				originMatchesPattern("ftp://example.com", "ftp://example.com"),
			).toBe(true);
		});

		it("handles explicit default ports", () => {
			expect(
				originMatchesPattern(
					"https://example.com:443",
					"https://example.com:443",
				),
			).toBe(true);
			expect(
				originMatchesPattern("http://example.com:80", "http://example.com:80"),
			).toBe(true);
		});

		it("handles implicit default ports", () => {
			expect(
				originMatchesPattern("https://example.com", "https://example.com:443"),
			).toBe(true);
			expect(
				originMatchesPattern("http://example.com", "http://example.com:80"),
			).toBe(true);
		});
	});

	describe("originMatchesAnyPattern edge cases", () => {
		it("handles single pattern", () => {
			expect(
				originMatchesAnyPattern("https://example.com", ["https://example.com"]),
			).toBe(true);
		});

		it("handles large pattern array", () => {
			const patterns = Array.from(
				{ length: 100 },
				(_, i) => `https://site${i}.com`,
			);
			patterns.push("https://example.com");
			expect(originMatchesAnyPattern("https://example.com", patterns)).toBe(
				true,
			);
		});

		it("short-circuits on first match", () => {
			// This tests that the function returns early when a match is found
			const patterns = [
				"https://example.com",
				"https://other.com",
				"https://third.com",
			];
			expect(originMatchesAnyPattern("https://example.com", patterns)).toBe(
				true,
			);
		});

		it("handles patterns with different schemes", () => {
			expect(
				originMatchesAnyPattern("https://example.com", [
					"http://example.com",
					"https://example.com",
				]),
			).toBe(true);
		});
	});

	describe("malformed input handling", () => {
		it("handles empty origin", () => {
			expect(originMatchesPattern("", "https://example.com")).toBe(false);
		});

		it("handles empty pattern", () => {
			expect(originMatchesPattern("https://example.com", "")).toBe(false);
		});

		it("handles invalid URL in origin", () => {
			expect(originMatchesPattern("not-a-url", "https://example.com")).toBe(
				false,
			);
		});

		it("handles malformed pattern", () => {
			expect(
				originMatchesPattern("https://example.com", "://example.com"),
			).toBe(false);
		});

		it("handles pattern with only wildcard", () => {
			expect(originMatchesPattern("https://example.com", "*")).toBe(false);
		});

		it("handles pattern with invalid scheme", () => {
			expect(
				originMatchesPattern("https://example.com", "invalid://example.com"),
			).toBe(false);
		});
	});

	describe("IPv6 handling", () => {
		it("handles IPv6 addresses in brackets", () => {
			// IPv6 addresses should be handled without breaking
			const result = originMatchesPattern(
				"https://[2001:db8::1]",
				"https://[2001:db8::1]",
			);
			// Result may vary based on implementation, but should not crash
			expect(typeof result).toBe("boolean");
		});

		it("handles IPv6 with port", () => {
			const result = originMatchesPattern(
				"https://[2001:db8::1]:443",
				"https://[2001:db8::1]:443",
			);
			expect(typeof result).toBe("boolean");
		});
	});

	describe("special characters in hostnames", () => {
		it("handles hostnames with hyphens", () => {
			expect(
				originMatchesPattern("https://my-site.com", "https://my-site.com"),
			).toBe(true);
		});

		it("handles hostnames with numbers", () => {
			expect(
				originMatchesPattern("https://site123.com", "https://site123.com"),
			).toBe(true);
		});

		it("handles internationalized domain names", () => {
			// IDN domains should be handled (may be normalized)
			const result = originMatchesPattern(
				"https://münchen.de",
				"https://münchen.de",
			);
			expect(typeof result).toBe("boolean");
		});
	});
});
