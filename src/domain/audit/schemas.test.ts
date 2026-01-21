import { describe, expect, it } from "vitest";
import {
	auditEventTypeSchema,
	auditEntityTypeSchema,
	createAuditLogSchema,
	auditLogFiltersSchema,
	paginationSchema,
	exportRequestSchema,
	verifyChainSchema,
} from "./schemas";

describe("Audit Domain Schemas", () => {
	describe("auditEventTypeSchema", () => {
		it("validates valid event types", () => {
			const validTypes = [
				"CREATE",
				"UPDATE",
				"DELETE",
				"LOGIN",
				"LOGOUT",
				"PASSWORD_RESET",
				"EMAIL_VERIFIED",
				"ROLE_CHANGE",
				"PERMISSION_CHANGE",
				"EXPORT",
				"IMPORT",
				"SYSTEM",
			];

			for (const type of validTypes) {
				expect(() => auditEventTypeSchema.parse(type)).not.toThrow();
			}
		});

		it("rejects invalid event types", () => {
			expect(() => auditEventTypeSchema.parse("INVALID")).toThrow();
			expect(() => auditEventTypeSchema.parse("create")).toThrow(); // lowercase
			expect(() => auditEventTypeSchema.parse("")).toThrow();
		});
	});

	describe("auditEntityTypeSchema", () => {
		it("validates valid entity types", () => {
			expect(() => auditEntityTypeSchema.parse("user")).not.toThrow();
			expect(() => auditEntityTypeSchema.parse("organization")).not.toThrow();
			expect(() => auditEntityTypeSchema.parse("custom-entity")).not.toThrow();
		});

		it("rejects empty strings", () => {
			expect(() => auditEntityTypeSchema.parse("")).toThrow();
		});

		it("rejects strings longer than 50 characters", () => {
			const longString = "a".repeat(51);
			expect(() => auditEntityTypeSchema.parse(longString)).toThrow();
		});

		it("accepts strings up to 50 characters", () => {
			const maxLengthString = "a".repeat(50);
			expect(() => auditEntityTypeSchema.parse(maxLengthString)).not.toThrow();
		});
	});

	describe("createAuditLogSchema", () => {
		it("validates minimal valid input", () => {
			const input = {
				eventType: "CREATE",
				entityType: "user",
				sourceService: "auth-svc",
			};

			expect(() => createAuditLogSchema.parse(input)).not.toThrow();
		});

		it("validates full input with all fields", () => {
			const input = {
				eventType: "UPDATE",
				entityType: "user",
				entityId: "123e4567-e89b-12d3-a456-426614174000",
				actorUserId: "123e4567-e89b-12d3-a456-426614174001",
				actorOrganizationId: "123e4567-e89b-12d3-a456-426614174002",
				actorIp: "192.168.1.1",
				actorUserAgent: "Mozilla/5.0",
				previousState: { name: "Old" },
				newState: { name: "New" },
				changeSummary: { field: "name" },
				sourceService: "auth-svc",
				requestId: "req-123",
				metadata: { key: "value" },
			};

			expect(() => createAuditLogSchema.parse(input)).not.toThrow();
		});

		it("validates with null optional fields", () => {
			const input = {
				eventType: "DELETE",
				entityType: "user",
				entityId: null,
				actorUserId: null,
				actorOrganizationId: null,
				actorIp: null,
				actorUserAgent: null,
				previousState: null,
				newState: null,
				changeSummary: null,
				sourceService: "auth-svc",
				requestId: null,
				metadata: null,
			};

			expect(() => createAuditLogSchema.parse(input)).not.toThrow();
		});

		it("rejects missing required fields", () => {
			expect(() => createAuditLogSchema.parse({})).toThrow();
			expect(() =>
				createAuditLogSchema.parse({
					eventType: "CREATE",
					// missing entityType and sourceService
				}),
			).toThrow();
		});

		it("validates UUID format for actor fields", () => {
			const input = {
				eventType: "CREATE",
				entityType: "user",
				sourceService: "auth-svc",
				actorUserId: "invalid-uuid",
			};

			expect(() => createAuditLogSchema.parse(input)).toThrow();
		});

		it("validates sourceService length", () => {
			const input = {
				eventType: "CREATE",
				entityType: "user",
				sourceService: "a".repeat(51), // too long
			};

			expect(() => createAuditLogSchema.parse(input)).toThrow();
		});
	});

	describe("auditLogFiltersSchema", () => {
		it("validates empty filters", () => {
			expect(() => auditLogFiltersSchema.parse({})).not.toThrow();
		});

		it("validates filters with all fields", () => {
			const filters = {
				eventType: "CREATE",
				entityType: "user",
				entityId: "123e4567-e89b-12d3-a456-426614174000",
				actorUserId: "123e4567-e89b-12d3-a456-426614174001",
				actorOrganizationId: "123e4567-e89b-12d3-a456-426614174002",
				sourceService: "auth-svc",
				startDate: "2024-01-01T00:00:00Z",
				endDate: "2024-12-31T23:59:59Z",
				search: "test query",
			};

			expect(() => auditLogFiltersSchema.parse(filters)).not.toThrow();
		});

		it("validates partial filters", () => {
			const filters = {
				eventType: "CREATE",
				search: "test",
			};

			expect(() => auditLogFiltersSchema.parse(filters)).not.toThrow();
		});

		it("validates UUID format for actor fields", () => {
			const filters = {
				actorUserId: "invalid-uuid",
			};

			expect(() => auditLogFiltersSchema.parse(filters)).toThrow();
		});

		it("validates datetime format for date fields", () => {
			const filters = {
				startDate: "invalid-date",
			};

			expect(() => auditLogFiltersSchema.parse(filters)).toThrow();
		});
	});

	describe("paginationSchema", () => {
		it("validates default values", () => {
			const result = paginationSchema.parse({});
			expect(result.page).toBe(1);
			expect(result.limit).toBe(20);
		});

		it("validates custom page and limit", () => {
			const result = paginationSchema.parse({ page: 2, limit: 50 });
			expect(result.page).toBe(2);
			expect(result.limit).toBe(50);
		});

		it("coerces string numbers to integers", () => {
			const result = paginationSchema.parse({ page: "3", limit: "10" });
			expect(result.page).toBe(3);
			expect(result.limit).toBe(10);
		});

		it("rejects page less than 1", () => {
			expect(() => paginationSchema.parse({ page: 0 })).toThrow();
			expect(() => paginationSchema.parse({ page: -1 })).toThrow();
		});

		it("rejects limit less than 1", () => {
			expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
			expect(() => paginationSchema.parse({ limit: -1 })).toThrow();
		});

		it("rejects limit greater than 100", () => {
			expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
		});

		it("accepts limit of 100", () => {
			expect(() => paginationSchema.parse({ limit: 100 })).not.toThrow();
		});
	});

	describe("exportRequestSchema", () => {
		it("validates default format", () => {
			const result = exportRequestSchema.parse({});
			expect(result.format).toBe("json");
		});

		it("validates json format", () => {
			const result = exportRequestSchema.parse({ format: "json" });
			expect(result.format).toBe("json");
		});

		it("validates csv format", () => {
			const result = exportRequestSchema.parse({ format: "csv" });
			expect(result.format).toBe("csv");
		});

		it("rejects invalid format", () => {
			expect(() => exportRequestSchema.parse({ format: "xml" })).toThrow();
		});

		it("validates with filters", () => {
			const request = {
				format: "csv",
				filters: {
					eventType: "CREATE",
					startDate: "2024-01-01T00:00:00Z",
				},
			};

			expect(() => exportRequestSchema.parse(request)).not.toThrow();
		});
	});

	describe("verifyChainSchema", () => {
		it("validates minimal input", () => {
			const result = verifyChainSchema.parse({});
			expect(result.limit).toBe(1000);
		});

		it("validates with startId and endId", () => {
			const input = {
				startId: "123e4567-e89b-12d3-a456-426614174000",
				endId: "123e4567-e89b-12d3-a456-426614174001",
				limit: 500,
			};

			expect(() => verifyChainSchema.parse(input)).not.toThrow();
		});

		it("validates UUID format", () => {
			const input = {
				startId: "invalid-uuid",
			};

			expect(() => verifyChainSchema.parse(input)).toThrow();
		});

		it("validates limit range", () => {
			expect(() => verifyChainSchema.parse({ limit: 0 })).toThrow();
			expect(() => verifyChainSchema.parse({ limit: 10001 })).toThrow();
			expect(() => verifyChainSchema.parse({ limit: 1 })).not.toThrow();
			expect(() => verifyChainSchema.parse({ limit: 10000 })).not.toThrow();
		});

		it("coerces string limit to number", () => {
			const result = verifyChainSchema.parse({ limit: "500" });
			expect(result.limit).toBe(500);
		});
	});
});
