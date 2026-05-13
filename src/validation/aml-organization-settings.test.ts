import { describe, it, expect } from "vitest";
import {
	organizationSettingsCreateSchema,
	organizationSettingsUpdateSchema,
} from "./aml-organization-settings";

describe("aml-organization-settings schemas", () => {
	const validBase = {
		obligatedSubjectKey: "ABC010101XY9",
		activityKey: "VEH",
	};

	it("create schema accepts watchlist rescan fields", () => {
		const r = organizationSettingsCreateSchema.safeParse({
			...validBase,
			watchlistRescanEnabled: true,
			watchlistRescanIntervalDays: 90,
			watchlistRescanIncludeBcs: true,
			watchlistRescanNotifyOnStatusChange: true,
			watchlistRescanDailyCap: 5000,
			watchlistRescanNotifyChannels: ["in_app", "email"],
			watchlistRescanSources: ["ofac", "un", "sat69b", "pep", "adverse_media"],
		});
		expect(r.success).toBe(true);
	});

	it("create schema rejects invalid rescan interval", () => {
		const r = organizationSettingsCreateSchema.safeParse({
			...validBase,
			watchlistRescanIntervalDays: 89,
		});
		expect(r.success).toBe(false);
	});

	it("update schema allows partial watchlist fields only", () => {
		const r = organizationSettingsUpdateSchema.safeParse({
			watchlistRescanDailyCap: 1000,
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.watchlistRescanDailyCap).toBe(1000);
		}
	});
});
