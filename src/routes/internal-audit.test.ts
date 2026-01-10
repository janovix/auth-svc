import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const mockAuditService = {
	createLog: vi.fn(),
	verifyChainIntegrity: vi.fn(),
};

const AuditServiceMock = vi.fn(() => mockAuditService);

vi.mock("../domain/audit", async () => {
	const actual = await vi.importActual<typeof import("../domain/audit")>(
		"../domain/audit",
	);
	return {
		...actual,
		AuditService: AuditServiceMock,
	};
});

let internalAuditRoutes: typeof import("./internal-audit")["internalAuditRoutes"];

const createDbEnv = () => {
	const mockFirst = vi.fn();
	const mockBind = vi.fn().mockReturnValue({
		first: mockFirst,
	});
	const mockStatement = {
		bind: mockBind,
		first: mockFirst,
	};
	const mockPrepare = vi.fn().mockReturnValue(mockStatement);

	return {
		env: {
			DB: {
				prepare: mockPrepare,
			} as unknown as D1Database,
		},
		mockFirst,
		mockPrepare,
	};
};

describe("internalAuditRoutes", () => {
	beforeAll(async () => {
		({ internalAuditRoutes } = await import("./internal-audit"));
	});

	beforeEach(() => {
		AuditServiceMock.mockClear();
		mockAuditService.createLog.mockReset();
		mockAuditService.verifyChainIntegrity.mockReset();
	});

	it("validates audit log payload", async () => {
		const res = await internalAuditRoutes.request(
			"/log",
			{
				method: "POST",
				body: JSON.stringify({ eventType: "INVALID" }),
				headers: { "Content-Type": "application/json" },
			},
			createDbEnv().env,
		);

		expect(res.status).toBe(400);
	});

	it("creates audit log entries via service binding", async () => {
		mockAuditService.createLog.mockResolvedValueOnce({
			id: "log-1",
			signature: "sig-1",
		});

		const res = await internalAuditRoutes.request(
			"/log",
			{
				method: "POST",
				body: JSON.stringify({
					eventType: "CREATE",
					entityType: "user",
					sourceService: "auth-svc",
				}),
				headers: { "Content-Type": "application/json" },
			},
			createDbEnv().env,
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toEqual({ id: "log-1", signature: "sig-1" });
	});

	it("handles service errors when creating audit logs", async () => {
		mockAuditService.createLog.mockRejectedValueOnce(new Error("boom"));

		const res = await internalAuditRoutes.request(
			"/log",
			{
				method: "POST",
				body: JSON.stringify({
					eventType: "CREATE",
					entityType: "user",
					sourceService: "auth-svc",
				}),
				headers: { "Content-Type": "application/json" },
			},
			createDbEnv().env,
		);

		expect(res.status).toBe(500);
	});

	it("returns latest signature from database", async () => {
		const db = createDbEnv();
		db.mockFirst.mockResolvedValueOnce({ signature: "sig-123" });

		const res = await internalAuditRoutes.request(
			"/latest",
			{ method: "GET" },
			db.env,
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.latestSignature).toBe("sig-123");
	});

	it("verifies chain integrity via audit service", async () => {
		mockAuditService.verifyChainIntegrity.mockResolvedValueOnce([]);

		const res = await internalAuditRoutes.request(
			"/verify",
			{ method: "POST" },
			createDbEnv().env,
		);

		expect(res.status).toBe(200);
		expect(mockAuditService.verifyChainIntegrity).toHaveBeenCalledWith(
			undefined,
			undefined,
			100,
		);
	});
});

