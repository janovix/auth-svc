/**
 * Audit service unit tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditService } from "./service";

// Mock D1Database
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
		_mockFirst: mockFirst,
		_mockRun: mockRun,
		_mockAll: mockAll,
		_mockBind: mockBind,
	};
};

describe("AuditService", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let service: AuditService;

	beforeEach(() => {
		mockDb = createMockDb();
		service = new AuditService(mockDb as unknown as D1Database);
	});

	describe("createLog", () => {
		it("should create audit log with signature", async () => {
			// Mock no previous entry (genesis)
			mockDb._mockFirst.mockResolvedValueOnce(null);
			// Mock the created entry
			mockDb._mockFirst.mockResolvedValueOnce({
				id: "log-123",
				event_type: "CREATE",
				entity_type: "user",
				entity_id: "user-456",
				actor_user_id: "actor-789",
				actor_organization_id: null,
				actor_ip: "127.0.0.1",
				actor_user_agent: "Test Agent",
				previous_state: null,
				new_state: '{"name":"Test"}',
				change_summary: '{"name":{"old":null,"new":"Test"}}',
				source_service: "auth-svc",
				request_id: "req-abc",
				metadata: null,
				signature: "computed-signature",
				previous_signature: null,
				created_at: "2024-01-01T00:00:00.000Z",
			});
			mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });

			const result = await service.createLog({
				eventType: "CREATE",
				entityType: "user",
				entityId: "user-456",
				actorUserId: "actor-789",
				actorIp: "127.0.0.1",
				actorUserAgent: "Test Agent",
				newState: { name: "Test" },
				sourceService: "auth-svc",
				requestId: "req-abc",
			});

			expect(result.eventType).toBe("CREATE");
			expect(result.entityType).toBe("user");
			expect(result.entityId).toBe("user-456");
			expect(result.signature).toBeDefined();
			expect(result.previousSignature).toBeNull();
		});

		it("should link to previous signature", async () => {
			// Mock previous entry
			mockDb._mockFirst.mockResolvedValueOnce({
				id: "prev-log",
				signature: "previous-signature-hash",
			});
			// Mock the created entry
			mockDb._mockFirst.mockResolvedValueOnce({
				id: "log-123",
				event_type: "UPDATE",
				entity_type: "user",
				entity_id: "user-456",
				actor_user_id: null,
				actor_organization_id: null,
				actor_ip: null,
				actor_user_agent: null,
				previous_state: '{"name":"Old"}',
				new_state: '{"name":"New"}',
				change_summary: '{"name":{"old":"Old","new":"New"}}',
				source_service: "auth-svc",
				request_id: null,
				metadata: null,
				signature: "new-signature",
				previous_signature: "previous-signature-hash",
				created_at: "2024-01-01T00:00:00.000Z",
			});
			mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });

			const result = await service.createLog({
				eventType: "UPDATE",
				entityType: "user",
				entityId: "user-456",
				previousState: { name: "Old" },
				newState: { name: "New" },
				sourceService: "auth-svc",
			});

			expect(result.previousSignature).toBe("previous-signature-hash");
		});
	});

	describe("list", () => {
		it("should return paginated results", async () => {
			mockDb._mockFirst.mockResolvedValue({ count: 100 });
			mockDb._mockAll.mockResolvedValue({
				results: [
					{
						id: "log-1",
						event_type: "CREATE",
						entity_type: "user",
						entity_id: "user-1",
						actor_user_id: null,
						actor_organization_id: null,
						actor_ip: null,
						actor_user_agent: null,
						previous_state: null,
						new_state: null,
						change_summary: null,
						source_service: "auth-svc",
						request_id: null,
						metadata: null,
						signature: "sig-1",
						previous_signature: null,
						created_at: "2024-01-01T00:00:00.000Z",
					},
				],
			});

			const result = await service.list({}, { page: 1, limit: 20 });

			expect(result.data).toHaveLength(1);
			expect(result.pagination.total).toBe(100);
			expect(result.pagination.totalPages).toBe(5);
		});

		it("should apply filters", async () => {
			mockDb._mockFirst.mockResolvedValue({ count: 5 });
			mockDb._mockAll.mockResolvedValue({ results: [] });

			await service.list({
				eventType: "CREATE",
				entityType: "user",
				sourceService: "auth-svc",
			});

			// Verify prepare was called with filter conditions
			expect(mockDb.prepare).toHaveBeenCalled();
		});
	});

	describe("export", () => {
		it("should export as JSON", async () => {
			mockDb._mockAll.mockResolvedValue({
				results: [
					{
						id: "log-1",
						event_type: "CREATE",
						entity_type: "user",
						entity_id: "user-1",
						actor_user_id: null,
						actor_organization_id: null,
						actor_ip: null,
						actor_user_agent: null,
						previous_state: null,
						new_state: null,
						change_summary: null,
						source_service: "auth-svc",
						request_id: null,
						metadata: null,
						signature: "sig-1",
						previous_signature: null,
						created_at: "2024-01-01T00:00:00.000Z",
					},
				],
			});

			const result = await service.export("json");

			expect(result.contentType).toBe("application/json");
			expect(result.filename).toContain("audit-logs-");
			expect(result.filename).toContain(".json");

			const parsed = JSON.parse(result.data);
			expect(parsed).toHaveLength(1);
		});

		it("should export as CSV", async () => {
			mockDb._mockAll.mockResolvedValue({
				results: [
					{
						id: "log-1",
						event_type: "CREATE",
						entity_type: "user",
						entity_id: "user-1",
						actor_user_id: null,
						actor_organization_id: null,
						actor_ip: null,
						actor_user_agent: null,
						previous_state: null,
						new_state: null,
						change_summary: null,
						source_service: "auth-svc",
						request_id: null,
						metadata: null,
						signature: "sig-1",
						previous_signature: null,
						created_at: "2024-01-01T00:00:00.000Z",
					},
				],
			});

			const result = await service.export("csv");

			expect(result.contentType).toBe("text/csv");
			expect(result.filename).toContain(".csv");
			expect(result.data).toContain("id,event_type,entity_type");
		});
	});
});
