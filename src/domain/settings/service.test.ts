/**
 * Settings service unit tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsService } from "./service";
import type { BrowserHints } from "./types";

// Mock D1Database
const createMockDb = () => {
	const mockPrepare = vi.fn();
	const mockBind = vi.fn();
	const mockFirst = vi.fn();
	const mockRun = vi.fn();

	mockPrepare.mockReturnValue({
		bind: mockBind.mockReturnValue({
			first: mockFirst,
			run: mockRun,
		}),
	});

	return {
		prepare: mockPrepare,
		_mockFirst: mockFirst,
		_mockRun: mockRun,
	};
};

describe("SettingsService", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let service: SettingsService;

	beforeEach(() => {
		mockDb = createMockDb();
		service = new SettingsService(mockDb as unknown as D1Database);
	});

	describe("parseBrowserHints", () => {
		it("should parse valid base64-encoded headers", () => {
			const headers = {
				"accept-language": "en-US,en;q=0.9,es;q=0.8",
				"x-timezone": "America/Mexico_City",
				"x-preferred-theme": "dark",
			};
			const encoded = btoa(JSON.stringify(headers));

			const result = service.parseBrowserHints(encoded);

			expect(result.language).toBe("en-US,en;q=0.9,es;q=0.8");
			expect(result.timezone).toBe("America/Mexico_City");
			expect(result.theme).toBe("dark");
		});

		it("should return empty object for invalid base64", () => {
			const result = service.parseBrowserHints("invalid-base64!!!");
			expect(result).toEqual({});
		});

		it("should return empty object for undefined input", () => {
			const result = service.parseBrowserHints(undefined);
			expect(result).toEqual({});
		});

		it("should handle partial headers", () => {
			const headers = { "accept-language": "es-MX" };
			const encoded = btoa(JSON.stringify(headers));

			const result = service.parseBrowserHints(encoded);

			expect(result.language).toBe("es-MX");
			expect(result.timezone).toBeUndefined();
			expect(result.theme).toBeUndefined();
		});
	});

	describe("resolveSettings", () => {
		it("should return default settings when no user or org settings exist", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const result = await service.resolveSettings("user-123");

			expect(result.theme).toBe("system");
			expect(result.timezone).toBe("UTC");
			expect(result.language).toBe("en");
			expect(result.dateFormat).toBe("MM/DD/YYYY");
			expect(result.sources.theme).toBe("default");
		});

		it("should use browser language hint when no user/org settings", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const browserHints: BrowserHints = {
				language: "es-MX,es;q=0.9",
			};

			const result = await service.resolveSettings(
				"user-123",
				undefined,
				browserHints,
			);

			expect(result.language).toBe("es");
			expect(result.sources.language).toBe("browser");
		});

		it("should use browser timezone hint when no user/org settings", async () => {
			mockDb._mockFirst.mockResolvedValue(null);

			const browserHints: BrowserHints = {
				timezone: "America/New_York",
			};

			const result = await service.resolveSettings(
				"user-123",
				undefined,
				browserHints,
			);

			expect(result.timezone).toBe("America/New_York");
			expect(result.sources.timezone).toBe("browser");
		});

		it("should prioritize user settings over org settings", async () => {
			// First call for user settings, second for org settings
			mockDb._mockFirst
				.mockResolvedValueOnce({
					id: "us-1",
					user_id: "user-123",
					theme: "dark",
					timezone: null,
					language: null,
					date_format: null,
					avatar_url: null,
					payment_methods: null,
					metadata: null,
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-01T00:00:00Z",
				})
				.mockResolvedValueOnce({
					id: "os-1",
					organization_id: "org-123",
					theme: "light",
					timezone: "America/Chicago",
					language: "es",
					date_format: "DD/MM/YYYY",
					avatar_url: null,
					metadata: null,
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-01T00:00:00Z",
				});

			const result = await service.resolveSettings("user-123", "org-123");

			expect(result.theme).toBe("dark");
			expect(result.sources.theme).toBe("user");
			expect(result.timezone).toBe("America/Chicago");
			expect(result.sources.timezone).toBe("organization");
		});
	});
});
