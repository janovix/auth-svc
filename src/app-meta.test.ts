import { describe, expect, it } from "vitest";
import { getOpenApiInfo, getScalarHtml, type AppMeta } from "./app-meta";

describe("app-meta", () => {
	describe("getOpenApiInfo", () => {
		it("returns correct info with description", () => {
			const meta: AppMeta = {
				name: "test-app",
				version: "1.0.0",
				description: "Test description",
			};

			const result = getOpenApiInfo(meta);

			expect(result).toEqual({
				title: "test-app",
				version: "1.0.0",
				description: "Test description",
			});
		});

		it("returns fallback description when description is missing", () => {
			const meta: AppMeta = {
				name: "test-app",
				version: "1.0.0",
			};

			const result = getOpenApiInfo(meta);

			expect(result).toEqual({
				title: "test-app",
				version: "1.0.0",
				description: "OpenAPI documentation for test-app (1.0.0).",
			});
		});

		it("handles empty description", () => {
			const meta: AppMeta = {
				name: "test-app",
				version: "1.0.0",
				description: "",
			};

			const result = getOpenApiInfo(meta);

			expect(result.description).toBe("");
		});
	});

	describe("getScalarHtml", () => {
		it("generates HTML with correct app name and version", () => {
			const meta: AppMeta = {
				name: "test-app",
				version: "2.3.4",
			};

			const html = getScalarHtml(meta);

			expect(html).toContain("test-app API Reference (v2.3.4)");
			expect(html).toContain("<title>test-app API Reference (v2.3.4)</title>");
		});

		it("includes Scalar API reference script", () => {
			const meta: AppMeta = {
				name: "test-app",
				version: "1.0.0",
			};

			const html = getScalarHtml(meta);

			expect(html).toContain("@scalar/api-reference");
			expect(html).toContain('id="api-reference"');
			expect(html).toContain('data-url="/openapi.json"');
		});

		it("includes proper HTML structure", () => {
			const meta: AppMeta = {
				name: "test-app",
				version: "1.0.0",
			};

			const html = getScalarHtml(meta);

			expect(html).toContain("<!doctype html>");
			expect(html).toContain('<html lang="en">');
			expect(html).toContain('<meta charset="utf-8" />');
			expect(html).toContain(
				'<meta name="viewport" content="width=device-width, initial-scale=1" />',
			);
		});

		it("includes Scalar CSS link", () => {
			const meta: AppMeta = {
				name: "test-app",
				version: "1.0.0",
			};

			const html = getScalarHtml(meta);

			expect(html).toContain(
				'<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/dist/style.css" />',
			);
		});

		it("includes Scalar standalone script", () => {
			const meta: AppMeta = {
				name: "test-app",
				version: "1.0.0",
			};

			const html = getScalarHtml(meta);

			expect(html).toContain(
				'<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/dist/browser/standalone.js"></script>',
			);
		});

		it("handles special characters in app name", () => {
			const meta: AppMeta = {
				name: "test-app & co.",
				version: "1.0.0",
			};

			const html = getScalarHtml(meta);

			expect(html).toContain("test-app & co. API Reference (v1.0.0)");
		});

		it("handles version with pre-release identifiers", () => {
			const meta: AppMeta = {
				name: "test-app",
				version: "1.0.0-beta.1",
			};

			const html = getScalarHtml(meta);

			expect(html).toContain("test-app API Reference (v1.0.0-beta.1)");
		});
	});
});
