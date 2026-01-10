import { describe, it, expect, vi, beforeEach } from "vitest";
import { settingsRoutes } from "./settings";
import * as authModule from "../auth/instance";
import { SettingsService } from "../domain/settings";

const mockGetSession = vi.fn();

const createEnv = () => {
	const mockFirst = vi.fn();
	const mockRun = vi.fn();
	const mockBind = vi.fn().mockReturnValue({
		first: mockFirst,
		run: mockRun,
	});

	const mockStatement = {
		bind: mockBind,
		first: mockFirst,
		run: mockRun,
	};

	const mockPrepare = vi.fn().mockReturnValue(mockStatement);

	return {
		env: {
			DB: {
				prepare: mockPrepare,
			} as unknown as D1Database,
		},
		mockFirst,
		mockRun,
		mockBind,
		mockPrepare,
	};
};

const mockAuthContext = () => {
	vi.spyOn(authModule, "getBetterAuthContext").mockReturnValue({
		auth: {
			api: {
				getSession: mockGetSession,
			},
		},
	});
};

describe("settingsRoutes", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mockGetSession.mockReset();
	});

	it("returns 401 when user session is missing", async () => {
		mockAuthContext();
		mockGetSession.mockResolvedValueOnce(null);

		const res = await settingsRoutes.request("/user");
		expect(res.status).toBe(401);
	});

	it("returns current user settings when authenticated", async () => {
		mockAuthContext();
		mockGetSession.mockResolvedValueOnce({
			user: { id: "user-123" },
			session: {},
		});
		vi.spyOn(SettingsService.prototype, "getUserSettings").mockResolvedValueOnce({
			id: "user-settings-1",
		});

		const res = await settingsRoutes.request(
			"/user",
			{
				method: "GET",
			},
			createEnv().env,
		);

		expect(res.status).toBe(200);
		expect(SettingsService.prototype.getUserSettings).toHaveBeenCalledWith(
			"user-123",
		);
		const body = await res.json();
		expect(body.success).toBe(true);
	});

	it("returns 400 when user payload is invalid", async () => {
		mockAuthContext();
		mockGetSession.mockResolvedValueOnce({
			user: { id: "user-123" },
			session: {},
		});

		const res = await settingsRoutes.request(
			"/user",
			{
				method: "PATCH",
				body: JSON.stringify({ theme: "invalid" }),
				headers: {
					"Content-Type": "application/json",
				},
			},
			createEnv().env,
		);

		expect(res.status).toBe(400);
		expect(SettingsService.prototype.updateUserSettings).not.toHaveBeenCalled();
	});

	it("updates user settings when payload is valid", async () => {
		mockAuthContext();
		mockGetSession.mockResolvedValueOnce({
			user: { id: "user-123" },
			session: {},
		});
		vi.spyOn(SettingsService.prototype, "updateUserSettings").mockResolvedValueOnce(
			{
				id: "user-settings-1",
				theme: "dark",
			},
		);

		const res = await settingsRoutes.request(
			"/user",
			{
				method: "PATCH",
				body: JSON.stringify({ theme: "dark" }),
				headers: {
					"Content-Type": "application/json",
				},
			},
			createEnv().env,
		);

		expect(res.status).toBe(200);
		expect(SettingsService.prototype.updateUserSettings).toHaveBeenCalledWith(
			"user-123",
			{ theme: "dark" },
		);
	});

	it("returns null organization settings when not found", async () => {
		mockAuthContext();
		mockGetSession.mockResolvedValueOnce({
			user: { id: "user-123" },
			session: {},
		});
		vi.spyOn(SettingsService.prototype, "getOrganizationSettings").mockResolvedValueOnce(
			null,
		);

		const res = await settingsRoutes.request(
			"/organization/org-1",
			{ method: "GET" },
			createEnv().env,
		);

		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.data).toBeNull();
	});

	it("returns 403 when user is not org admin", async () => {
		mockAuthContext();
		mockGetSession.mockResolvedValueOnce({
			user: { id: "user-123" },
			session: {},
		});
		const env = createEnv();
		env.mockFirst.mockResolvedValueOnce({ role: "member" });

		const res = await settingsRoutes.request(
			"/organization/org-1",
			{
				method: "PATCH",
				body: JSON.stringify({ theme: "dark" }),
				headers: { "Content-Type": "application/json" },
			},
			env.env,
		);

		expect(res.status).toBe(403);
		expect(SettingsService.prototype.updateOrganizationSettings).not.toHaveBeenCalled();
	});

	it("updates organization settings for admins", async () => {
		mockAuthContext();
		mockGetSession.mockResolvedValueOnce({
			user: { id: "user-123" },
			session: {},
		});
		const env = createEnv();
		env.mockFirst.mockResolvedValueOnce({ role: "owner" });
		vi.spyOn(
			SettingsService.prototype,
			"updateOrganizationSettings",
		).mockResolvedValueOnce({
			id: "org-settings-1",
			theme: "dark",
		});

		const res = await settingsRoutes.request(
			"/organization/org-1",
			{
				method: "PATCH",
				body: JSON.stringify({ theme: "dark" }),
				headers: { "Content-Type": "application/json" },
			},
			env.env,
		);

		expect(res.status).toBe(200);
		expect(SettingsService.prototype.updateOrganizationSettings).toHaveBeenCalledWith(
			"org-1",
			{ theme: "dark" },
		);
	});

	it("returns 400 when org payload is invalid", async () => {
		mockAuthContext();
		mockGetSession.mockResolvedValueOnce({
			user: { id: "user-123" },
			session: {},
		});
		const env = createEnv();
		env.mockFirst.mockResolvedValueOnce({ role: "owner" });

		const res = await settingsRoutes.request(
			"/organization/org-1",
			{
				method: "PATCH",
				body: JSON.stringify({ language: "xx" }),
				headers: { "Content-Type": "application/json" },
			},
			env.env,
		);

		expect(res.status).toBe(400);
		expect(SettingsService.prototype.updateOrganizationSettings).not.toHaveBeenCalled();
	});

	it("resolves merged settings with browser hints", async () => {
		mockAuthContext();
		mockGetSession.mockResolvedValueOnce({
			user: { id: "user-123" },
			session: { activeOrganizationId: "org-1" },
		});
		vi.spyOn(SettingsService.prototype, "parseBrowserHints").mockReturnValueOnce({
			theme: "dark",
		});
		vi.spyOn(SettingsService.prototype, "resolveSettings").mockResolvedValueOnce({
			theme: "dark",
		} as ResolvedSettings);

		const res = await settingsRoutes.request(
			"/resolved?headers=encoded",
			{ method: "GET" },
			createEnv().env,
		);

		expect(res.status).toBe(200);
		expect(SettingsService.prototype.parseBrowserHints).toHaveBeenCalledWith("encoded");
		expect(SettingsService.prototype.resolveSettings).toHaveBeenCalledWith(
			"user-123",
			"org-1",
			{ theme: "dark" },
		);
	});

	it("returns 401 when auth context throws errors", async () => {
		mockAuthContext();
		mockGetSession.mockRejectedValueOnce(new Error("boom"));

		const res = await settingsRoutes.request("/user");

		expect(res.status).toBe(401);
	});
});

