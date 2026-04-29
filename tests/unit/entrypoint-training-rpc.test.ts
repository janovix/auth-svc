import { describe, it, expect, vi } from "vitest";
import type { Bindings } from "../../src/types/bindings";
import { AuthSvcEntrypoint } from "../../src/entrypoint";

function mockExecutionContext(): ExecutionContext {
	return {
		waitUntil: vi.fn(),
		passThroughOnException: vi.fn(),
	} as unknown as ExecutionContext;
}

function mockD1First<T>(row: T | null) {
	const stmt = {
		bind: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(row),
		all: vi.fn(),
	};
	return {
		prepare: vi.fn().mockReturnValue(stmt),
		_stmt: stmt,
	};
}

function mockD1All<T extends Record<string, unknown>>(rows: T[]) {
	const stmt = {
		bind: vi.fn().mockReturnThis(),
		first: vi.fn(),
		all: vi.fn().mockResolvedValue({ results: rows }),
	};
	return {
		prepare: vi.fn().mockReturnValue(stmt),
		_stmt: stmt,
	};
}

function entrypointWithDb(db: D1Database) {
	const env = { DB: db } as unknown as Bindings;
	return new AuthSvcEntrypoint(mockExecutionContext(), env);
}

describe("AuthSvcEntrypoint training RPCs", () => {
	describe("getMemberRole", () => {
		it("returns null when no membership row", async () => {
			const db = mockD1First<{ role: string } | null>(null);
			const ep = entrypointWithDb(db as unknown as D1Database);
			await expect(ep.getMemberRole("u1", "o1")).resolves.toBeNull();
			expect(db.prepare).toHaveBeenCalledWith(
				expect.stringContaining("members"),
			);
		});

		it("returns normalized owner/admin/member", async () => {
			for (const [raw, expected] of [
				["OWNER", "owner"],
				["admin", "admin"],
				["Member", "member"],
			] as const) {
				const db = mockD1First({ role: raw });
				const ep = entrypointWithDb(db as unknown as D1Database);
				await expect(ep.getMemberRole("u", "o")).resolves.toBe(expected);
			}
		});

		it("maps unknown role strings to member", async () => {
			const db = mockD1First({ role: " custom " });
			const ep = entrypointWithDb(db as unknown as D1Database);
			await expect(ep.getMemberRole("u", "o")).resolves.toBe("member");
		});
	});

	describe("listActiveMembers", () => {
		it("returns empty page when no rows", async () => {
			const db = mockD1All([]);
			const ep = entrypointWithDb(db as unknown as D1Database);
			const out = await ep.listActiveMembers();
			expect(out.items).toEqual([]);
			expect(out.nextCursor).toBeNull();
		});

		it("filters by organizationId when provided", async () => {
			const rows = [
				{
					userId: "u1",
					organizationId: "o1",
					email: "a@x.com",
					name: "A",
				},
			];
			const db = mockD1All(rows);
			const ep = entrypointWithDb(db as unknown as D1Database);
			const out = await ep.listActiveMembers("o1");
			expect(out.items).toHaveLength(1);
			expect(db._stmt.bind).toHaveBeenCalled();
			const bindArgs = db._stmt.bind.mock.calls[0] as unknown[];
			expect(bindArgs).toContain("o1");
		});

		it("sets nextCursor when more than limit rows", async () => {
			const many = Array.from({ length: 501 }, (_, i) => ({
				userId: `u${i}`,
				organizationId: "o1",
				email: `u${i}@x.com`,
				name: "",
			}));
			const db = mockD1All(many);
			const ep = entrypointWithDb(db as unknown as D1Database);
			const out = await ep.listActiveMembers();
			expect(out.items).toHaveLength(500);
			expect(out.nextCursor).toBe("500");
		});

		it("uses cursor offset for pagination", async () => {
			const rows = [
				{
					userId: "u0",
					organizationId: "o1",
					email: "u0@x.com",
					name: "",
				},
			];
			const db = mockD1All(rows);
			const ep = entrypointWithDb(db as unknown as D1Database);
			await ep.listActiveMembers(undefined, "10");
			expect(db.prepare).toHaveBeenCalledWith(
				expect.stringContaining("OFFSET"),
			);
			const bindCalls = db._stmt.bind.mock.calls[0] as unknown[];
			expect(bindCalls).toContain(501);
			expect(bindCalls).toContain(10);
		});
	});
});
