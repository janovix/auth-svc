import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const mockSettingsService = {
	resolveSettings: vi.fn(),
	parseBrowserHints: vi.fn(),
	getUserSettings: vi.fn(),
	getOrganizationSettings: vi.fn(),
};

const SettingsServiceMock = vi.fn(() => mockSettingsService);

vi.mock("../domain/settings", async () => {
	const actual = await vi.importActual<typeof import("../domain/settings")>(
		"../domain/settings",
	);
	return {
		...actual,
		SettingsService: SettingsServiceMock,
	};
});

let internalSettingsRoutes: typeof import("./internal-settings")["internalSettingsRoutes"];

const createEnv = () => ({
	env: {
		DB: {} as unknown as D1Database,
	},
});

describe("internalSettingsRoutes", () => {
	beforeAll(async () => {
		({ internalSettingsRoutes } = await import("./internal-settings"));
	});

	beforeEach(() => {
		SettingsServiceMock.mockClear();
		Object.values(mockSettingsService).forEach((fn) => fn.mockReset());
	});

	it("requires userId for resolved endpoint", async () => {
		const res = await internalSettingsRoutes.request("/resolved");

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain("userId");
	});

	it("returns resolved settings with parsed hints", async () => {
		mockSettingsService.parseBrowserHints.mockReturnValueOnce({ theme: "dark" });
		mockSettingsService.resolveSettings.mockResolvedValueOnce({
			theme: "dark",
		});

		const res = await internalSettingsRoutes.request(
			"/resolved?userId=user-1&orgId=org-1&headers=encoded",
			{ method: "GET" },
			createEnv().env,
		);

		expect(res.status).toBe(200);
		expect(mockSettingsService.parseBrowserHints).toHaveBeenCalledWith("encoded");
		expect(mockSettingsService.resolveSettings).toHaveBeenCalledWith(
			"user-1",
			"org-1",
			{ theme: "dark" },
		);
	});

	it("returns user settings for internal access", async () => {
		mockSettingsService.getUserSettings.mockResolvedValueOnce({
			id: "user-settings-1",
		});

		const res = await internalSettingsRoutes.request(
			"/user/user-1",
			{ method: "GET" },
			createEnv().env,
		);

		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.data.id).toBe("user-settings-1");
	});

	it("returns organization settings for internal access", async () => {
		mockSettingsService.getOrganizationSettings.mockResolvedValueOnce({
			id: "org-settings-1",
		});

		const res = await internalSettingsRoutes.request(
			"/organization/org-1",
			{ method: "GET" },
			createEnv().env,
		);

		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.data.id).toBe("org-settings-1");
	});
});

