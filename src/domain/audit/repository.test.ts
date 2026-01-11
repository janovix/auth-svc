import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuditLog } from "./types";
import { AuditRepository } from "./repository";

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

const sampleRow = {
	id: "log-1",
	event_type: "CREATE",
	entity_type: "user",
	entity_id: "user-1",
	actor_user_id: "actor-1",
	actor_organization_id: "org-1",
	actor_ip: "127.0.0.1",
	actor_user_agent: "agent",
	previous_state: '{"name":"old"}',
	new_state: '{"name":"new"}',
	change_summary: '{"name":{"old":"old","new":"new"}}',
	source_service: "auth-svc",
	request_id: "req-1",
	metadata: '{"traceId":"abc"}',
	signature: "sig-1",
	previous_signature: "sig-0",
	created_at: "2024-01-01T00:00:00.000Z",
};

const sampleLog: AuditLog = {
	id: "log-1",
	eventType: "CREATE",
	entityType: "user",
	entityId: "user-1",
	actorUserId: "actor-1",
	actorOrganizationId: "org-1",
	actorIp: "127.0.0.1",
	actorUserAgent: "agent",
	previousState: { name: "old" },
	newState: { name: "new" },
	changeSummary: { name: { old: "old", new: "new" } },
	sourceService: "auth-svc",
	requestId: "req-1",
	metadata: { traceId: "abc" },
	signature: "sig-1",
	previousSignature: "sig-0",
	createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

describe("AuditRepository", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let repository: AuditRepository;

	beforeEach(() => {
		mockDb = createMockDb();
		repository = new AuditRepository(mockDb as unknown as D1Database);
	});

	it("getLatestEntry maps audit row", async () => {
		mockDb._mockFirst.mockResolvedValueOnce(sampleRow);

		const result = await repository.getLatestEntry();

		expect(result?.id).toBe("log-1");
		expect(result?.previousState).toEqual({ name: "old" });
		expect(mockDb.prepare).toHaveBeenCalledWith(
			expect.stringContaining("ORDER BY created_at DESC LIMIT 1"),
		);
	});

	it("getById returns null when not found", async () => {
		mockDb._mockFirst.mockResolvedValueOnce(null);

		const result = await repository.getById("missing");

		expect(result).toBeNull();
		expect(mockDb.prepare).toHaveBeenCalledWith(
			expect.stringContaining("WHERE id = ?"),
		);
	});

	it("create inserts row and returns persisted entry", async () => {
		mockDb._mockRun.mockResolvedValueOnce({ meta: { changes: 1 } });
		mockDb._mockFirst.mockResolvedValueOnce(sampleRow);

		const result = await repository.create(
			"log-1",
			"CREATE",
			"user",
			"user-1",
			"actor-1",
			"org-1",
			"127.0.0.1",
			"agent",
			'{"name":"old"}',
			'{"name":"new"}',
			'{"name":{"old":"old","new":"new"}}',
			"auth-svc",
			"req-1",
			'{"traceId":"abc"}',
			"sig-1",
			"sig-0",
			"2024-01-01T00:00:00.000Z",
		);

		expect(mockDb._mockRun).toHaveBeenCalled();
		expect(result.id).toBe("log-1");
		expect(result.previousSignature).toBe("sig-0");
	});

	it("list builds filters and pagination", async () => {
		mockDb._mockFirst.mockResolvedValueOnce({ count: 1 });
		mockDb._mockAll.mockResolvedValueOnce({ results: [sampleRow] });

		const result = await repository.list(
			{ eventType: "CREATE", search: "user-1" },
			{ page: 2, limit: 5 },
		);

		expect(mockDb.prepare).toHaveBeenCalledWith(
			expect.stringContaining("COUNT(*) as count"),
		);
		expect(mockDb._mockAll).toHaveBeenCalled();
		expect(result.pagination).toEqual({
			page: 2,
			limit: 5,
			total: 1,
			totalPages: 1,
		});
		expect(result.data[0].metadata).toEqual({ traceId: "abc" });
	});

	it("getChainSegment applies start and end filters", async () => {
		const getByIdSpy = vi
			.spyOn(repository, "getById")
			.mockResolvedValueOnce({
				...sampleLog,
				createdAt: new Date("2024-01-01T00:00:00.000Z"),
			})
			.mockResolvedValueOnce({
				...sampleLog,
				createdAt: new Date("2024-01-02T00:00:00.000Z"),
			});

		mockDb._mockAll.mockResolvedValueOnce({ results: [sampleRow] });

		const results = await repository.getChainSegment("start-id", "end-id", 50);

		expect(getByIdSpy).toHaveBeenCalledTimes(2);
		expect(results).toHaveLength(1);
		expect(mockDb.prepare).toHaveBeenCalledWith(
			expect.stringContaining("ORDER BY created_at ASC"),
		);
		getByIdSpy.mockRestore();
	});

	it("getAllForExport applies filters", async () => {
		mockDb._mockAll.mockResolvedValueOnce({ results: [sampleRow] });

		const rows = await repository.getAllForExport({
			eventType: "CREATE",
			entityId: "user-1",
		});

		expect(rows[0].entityId).toBe("user-1");
		expect(mockDb.prepare).toHaveBeenCalledWith(
			expect.stringContaining("ORDER BY created_at DESC"),
		);
	});
});
