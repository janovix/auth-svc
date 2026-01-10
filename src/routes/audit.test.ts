import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const mockAuditService = {
	list: vi.fn(),
	getById: vi.fn(),
	verifyChainIntegrity: vi.fn(),
	export: vi.fn(),
};

const mockGetSession = vi.fn();
const AuditServiceMock = vi.fn(() => mockAuditService);
const getBetterAuthContextMock = vi.fn(() => ({
	auth: {
		api: {
			getSession: mockGetSession,
		},
	},
}));

vi.mock("../domain/audit", async () => {
	const actual = await vi.importActual<typeof import("../domain/audit")>(
		"../domain/audit",
	);
	return {
		...actual,
		AuditService: AuditServiceMock,
	};
});

vi.mock("../auth/instance", async () => {
	const actual = await vi.importActual<typeof import("../auth/instance")>(
		"../auth/instance",
	);
	return {
		...actual,
		getBetterAuthContext: getBetterAuthContextMock,
	};
});

let auditRoutes: typeof import("./audit")["auditRoutes"];

const createEnv = () => ({
	env: {
		DB: {} as unknown as D1Database,
	},
});

const adminSession = {
	user: { id: "admin-1", role: "admin" },
	session: {},
};

describe("auditRoutes", () => {
	beforeAll(async () => {
		({ auditRoutes } = await import("./audit"));
	});

	beforeEach(() => {
		mockGetSession.mockReset();
		[
			mockAuditService.list,
			mockAuditService.getById,
			mockAuditService.verifyChainIntegrity,
			mockAuditService.export,
		].forEach((fn) => fn.mockReset());
		AuditServiceMock.mockClear();
		getBetterAuthContextMock.mockClear();
	});

	it("returns 401 when session is missing", async () => {
		mockGetSession.mockResolvedValueOnce(null);

		const res = await auditRoutes.request("/");
		expect(res.status).toBe(401);
	});

	it("returns 403 when user is not admin", async () => {
		mockGetSession.mockResolvedValueOnce({
			user: { id: "user-1", role: "member" },
			session: {},
		});

		const res = await auditRoutes.request("/");

		expect(res.status).toBe(403);
		expect(mockAuditService.list).not.toHaveBeenCalled();
	});

	it("lists audit logs for admins with parsed filters", async () => {
		mockGetSession.mockResolvedValueOnce(adminSession);
		mockAuditService.list.mockResolvedValueOnce({
			data: [],
			pagination: { page: 2, limit: 5, total: 0, totalPages: 0 },
		});

		const res = await auditRoutes.request(
			"/?eventType=CREATE&limit=5&page=2&startDate=2024-01-01",
			{ method: "GET" },
			createEnv().env,
		);

		expect(res.status).toBe(200);
		expect(mockAuditService.list).toHaveBeenCalledWith(
			{
				eventType: "CREATE",
				entityType: undefined,
				entityId: undefined,
				actorUserId: undefined,
				actorOrganizationId: undefined,
				sourceService: undefined,
				startDate: new Date("2024-01-01"),
				endDate: undefined,
				search: undefined,
				page: 2,
				limit: 5,
			},
			{ page: 2, limit: 5 },
		);
	});

	it("returns 404 when audit log is missing", async () => {
		mockGetSession.mockResolvedValueOnce(adminSession);
		mockAuditService.getById.mockResolvedValueOnce(null);

		const res = await auditRoutes.request(
			"/missing-id",
			{ method: "GET" },
			createEnv().env,
		);

		expect(res.status).toBe(404);
	});

	it("returns audit log details when found", async () => {
		mockGetSession.mockResolvedValueOnce(adminSession);
		mockAuditService.getById.mockResolvedValueOnce({ id: "log-1" });

		const res = await auditRoutes.request(
			"/log-1",
			{ method: "GET" },
			createEnv().env,
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.id).toBe("log-1");
	});

	it("validates verify query params", async () => {
		mockGetSession.mockResolvedValueOnce(adminSession);

		const res = await auditRoutes.request(
			"/verify?limit=invalid",
			{ method: "GET" },
			createEnv().env,
		);

		expect(res.status).toBe(400);
	});

	it("verifies chain integrity for admins", async () => {
		mockGetSession.mockResolvedValueOnce(adminSession);
		mockAuditService.verifyChainIntegrity.mockResolvedValueOnce([]);

		const res = await auditRoutes.request(
			"/verify?limit=50",
			{ method: "GET" },
			createEnv().env,
		);

		expect(res.status).toBe(200);
		expect(mockAuditService.verifyChainIntegrity).toHaveBeenCalledWith(
			undefined,
			undefined,
			50,
		);
	});

	it("validates export payload", async () => {
		mockGetSession.mockResolvedValueOnce(adminSession);

		const res = await auditRoutes.request(
			"/export",
			{
				method: "POST",
				body: JSON.stringify({ format: "invalid" }),
				headers: { "Content-Type": "application/json" },
			},
			createEnv().env,
		);

		expect(res.status).toBe(400);
	});

	it("returns exported file response", async () => {
		mockGetSession.mockResolvedValueOnce(adminSession);
		mockAuditService.export.mockResolvedValueOnce({
			data: "csv-data",
			contentType: "text/csv",
			filename: "audit.csv",
		});

		const res = await auditRoutes.request(
			"/export",
			{
				method: "POST",
				body: JSON.stringify({ format: "csv" }),
				headers: { "Content-Type": "application/json" },
			},
			createEnv().env,
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("text/csv");
		expect(res.headers.get("Content-Disposition")).toContain("audit.csv");
	});
});

