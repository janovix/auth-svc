/**
 * Settings service unit tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsService } from "./service";
import type { BrowserHints, UserSettings, OrganizationSettings } from "./types";

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

	describe("repository helpers", () => {
		it("getOrCreateOrganizationSettings returns existing record", async () => {
			const repoMock = {
				getOrganizationSettings: vi
					.fn()
					.mockResolvedValue({ id: "org-settings-1" } as OrganizationSettings),
			};
			(service as unknown as { repository: typeof repoMock }).repository =
				repoMock;

			const result = await service.getOrCreateOrganizationSettings("org-123");

			expect(result.id).toBe("org-settings-1");
			expect(repoMock.getOrganizationSettings).toHaveBeenCalledWith("org-123");
		});

		it("getOrCreateOrganizationSettings creates defaults when missing", async () => {
			const repoMock = {
				getOrganizationSettings: vi.fn().mockResolvedValue(null),
				createOrganizationSettings: vi
					.fn()
					.mockResolvedValue({ id: "org-settings-2" } as OrganizationSettings),
			};
			(service as unknown as { repository: typeof repoMock }).repository =
				repoMock;

			const result = await service.getOrCreateOrganizationSettings("org-456");

			expect(result.id).toBe("org-settings-2");
			expect(repoMock.createOrganizationSettings).toHaveBeenCalled();
		});

		it("updateOrganizationSettings delegates to upsert with generated id", async () => {
			const uuidSpy = vi
				.spyOn(crypto, "randomUUID")
				.mockReturnValue("generated-id");
			const repoMock = {
				upsertOrganizationSettings: vi
					.fn()
					.mockResolvedValue({ id: "org-settings-3" } as OrganizationSettings),
			};
			(service as unknown as { repository: typeof repoMock }).repository =
				repoMock;

			const result = await service.updateOrganizationSettings("org-789", {
				theme: "dark",
			});

			expect(result.id).toBe("org-settings-3");
			expect(repoMock.upsertOrganizationSettings).toHaveBeenCalledWith(
				"generated-id",
				"org-789",
				{ theme: "dark" },
			);
			uuidSpy.mockRestore();
		});

		it("getOrCreateUserSettings falls back to creation", async () => {
			const repoMock = {
				getUserSettings: vi.fn().mockResolvedValue(null),
				createUserSettings: vi.fn().mockResolvedValue({
					id: "user-settings-1",
				} as UserSettings),
			};
			(service as unknown as { repository: typeof repoMock }).repository =
				repoMock;

			const result = await service.getOrCreateUserSettings("user-1");

			expect(result.id).toBe("user-settings-1");
			expect(repoMock.createUserSettings).toHaveBeenCalled();
		});

		it("updateUserSettings delegates to upsert", async () => {
			const uuidSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue("user-id");
			const repoMock = {
				upsertUserSettings: vi
					.fn()
					.mockResolvedValue({ id: "user-settings-2" } as UserSettings),
			};
			(service as unknown as { repository: typeof repoMock }).repository =
				repoMock;

			const result = await service.updateUserSettings("user-2", {
				theme: "light",
			});

			expect(result.id).toBe("user-settings-2");
			expect(repoMock.upsertUserSettings).toHaveBeenCalledWith(
				"user-id",
				"user-2",
				{
					theme: "light",
				},
			);
			uuidSpy.mockRestore();
		});

		it("delete helpers forward to repository", async () => {
			const repoMock = {
				deleteUserSettings: vi.fn().mockResolvedValue(true),
				deleteOrganizationSettings: vi.fn().mockResolvedValue(false),
			};
			(service as unknown as { repository: typeof repoMock }).repository =
				repoMock;

			expect(await service.deleteUserSettings("user-1")).toBe(true);
			expect(await service.deleteOrganizationSettings("org-1")).toBe(false);
			expect(repoMock.deleteUserSettings).toHaveBeenCalledWith("user-1");
			expect(repoMock.deleteOrganizationSettings).toHaveBeenCalledWith("org-1");
		});
	});
});
