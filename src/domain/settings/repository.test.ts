import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsRepository } from "./repository";

const createMockDb = () => {
	const mockPrepare = vi.fn();
	const mockBind = vi.fn();
	const mockFirst = vi.fn();
	const mockRun = vi.fn();
	const mockAll = vi.fn();

	const statement = {
		bind: mockBind,
		first: mockFirst,
		run: mockRun,
		all: mockAll,
	};

	mockBind.mockReturnValue(statement);
	mockPrepare.mockReturnValue(statement);

	return {
		prepare: mockPrepare,
		_mockBind: mockBind,
		_mockFirst: mockFirst,
		_mockRun: mockRun,
		_mockAll: mockAll,
	};
};

const sampleOrgRow = {
	id: "org-settings-1",
	organization_id: "org-1",
	theme: "dark",
	timezone: "UTC",
	language: "en",
	date_format: "MM/DD/YYYY",
	avatar_url: "https://cdn/avatar.png",
	metadata: JSON.stringify({ branding: "custom" }),
	created_at: "2024-01-01T00:00:00.000Z",
	updated_at: "2024-01-02T00:00:00.000Z",
};

const sampleUserRow = {
	id: "user-settings-1",
	user_id: "user-1",
	theme: "light",
	timezone: "UTC",
	language: "es",
	date_format: "DD/MM/YYYY",
	avatar_url: null,
	payment_methods: JSON.stringify([
		{ id: "pm-1", type: "card", label: "Visa" },
	]),
	metadata: JSON.stringify({ beta: true }),
	created_at: "2024-01-01T00:00:00.000Z",
	updated_at: "2024-01-02T00:00:00.000Z",
};

describe("SettingsRepository", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let repository: SettingsRepository;

	beforeEach(() => {
		mockDb = createMockDb();
		repository = new SettingsRepository(mockDb as unknown as D1Database);
	});

	it("getOrganizationSettings returns mapped result", async () => {
		mockDb._mockFirst.mockResolvedValueOnce(sampleOrgRow);

		const result = await repository.getOrganizationSettings("org-1");

		expect(mockDb.prepare).toHaveBeenCalledWith(
			expect.stringContaining("organization_settings"),
		);
		expect(result).toEqual({
			id: "org-settings-1",
			organizationId: "org-1",
			theme: "dark",
			timezone: "UTC",
			language: "en",
			dateFormat: "MM/DD/YYYY",
			clockFormat: "12h",
			avatarUrl: "https://cdn/avatar.png",
			metadata: { branding: "custom" },
			createdAt: new Date("2024-01-01T00:00:00.000Z"),
			updatedAt: new Date("2024-01-02T00:00:00.000Z"),
		});
	});

	it("createOrganizationSettings uses defaults and returns entry", async () => {
		mockDb._mockRun.mockResolvedValueOnce({ meta: { changes: 1 } });
		mockDb._mockFirst.mockResolvedValueOnce(sampleOrgRow);

		const result = await repository.createOrganizationSettings(
			"org-settings-1",
			"org-1",
			{},
		);

		const insertCall = mockDb._mockBind.mock.calls[0];
		expect(insertCall?.[2]).toBe("system");
		expect(insertCall?.[3]).toBe("UTC");
		expect(result?.id).toBe("org-settings-1");
	});

	it("updateOrganizationSettings returns null when missing", async () => {
		mockDb._mockFirst.mockResolvedValueOnce(null);

		const result = await repository.updateOrganizationSettings("org-1", {
			theme: "dark",
		});

		expect(result).toBeNull();
		expect(mockDb._mockRun).not.toHaveBeenCalled();
	});

	it("updateOrganizationSettings applies changes and returns updated record", async () => {
		mockDb._mockFirst
			.mockResolvedValueOnce(sampleOrgRow)
			.mockResolvedValueOnce({ ...sampleOrgRow, theme: "light" });
		mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });

		const updated = await repository.updateOrganizationSettings("org-1", {
			theme: "light",
			metadata: { branding: "updated" },
		});

		const updateCall = mockDb._mockBind.mock.calls.find(
			(args) => args.length > 1,
		);
		expect(updateCall?.[0]).toBe("light");
		expect(updateCall?.[1]).toBe(JSON.stringify({ branding: "updated" }));
		expect(typeof updateCall?.[2]).toBe("string");
		expect(updateCall?.[3]).toBe("org-1");
		expect(updated?.theme).toBe("light");
	});

	it("getUserSettings maps payment methods and metadata", async () => {
		mockDb._mockFirst.mockResolvedValueOnce(sampleUserRow);

		const result = await repository.getUserSettings("user-1");

		expect(result?.paymentMethods).toEqual([
			{ id: "pm-1", type: "card", label: "Visa" },
		]);
		expect(result?.metadata).toEqual({ beta: true });
	});

	it("updateUserSettings returns existing entry when no changes provided", async () => {
		mockDb._mockFirst.mockResolvedValueOnce(sampleUserRow);

		const result = await repository.updateUserSettings("user-1", {});

		expect(mockDb._mockRun).not.toHaveBeenCalled();
		expect(result?.id).toBe("user-settings-1");
	});

	it("upsertUserSettings creates record when not found", async () => {
		mockDb._mockFirst
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(sampleUserRow);
		mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });

		const result = await repository.upsertUserSettings(
			"user-settings-1",
			"user-1",
			{ theme: "light" },
		);

		expect(result?.userId).toBe("user-1");
	});

	it("upsertOrganizationSettings updates when record exists", async () => {
		mockDb._mockFirst
			.mockResolvedValueOnce(sampleOrgRow)
			.mockResolvedValueOnce(sampleOrgRow)
			.mockResolvedValueOnce({ ...sampleOrgRow, theme: "light" });
		mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });

		const result = await repository.upsertOrganizationSettings(
			"org-settings-1",
			"org-1",
			{ theme: "light" },
		);

		expect(result?.theme).toBe("light");
	});

	it("delete operations return change status", async () => {
		mockDb._mockRun
			.mockResolvedValueOnce({ meta: { changes: 1 } })
			.mockResolvedValueOnce({ meta: { changes: 0 } });

		const userDeleted = await repository.deleteUserSettings("user-1");
		const orgDeleted = await repository.deleteOrganizationSettings("org-1");

		expect(userDeleted).toBe(true);
		expect(orgDeleted).toBe(false);
	});
});
