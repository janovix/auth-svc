/**
 * Audit signature unit tests
 */
import { describe, it, expect } from "vitest";
import {
	computeSignature,
	createSignaturePayload,
	verifyEntrySignature,
	generateChangeSummary,
	GENESIS_SIGNATURE,
} from "./signature";
import type { CreateAuditLogInput } from "./types";

describe("Audit Signature", () => {
	describe("computeSignature", () => {
		it("should compute consistent SHA-256 signature", async () => {
			const payload = {
				id: "test-id",
				eventType: "CREATE",
				entityType: "user",
				entityId: "user-123",
				actorUserId: "actor-456",
				actorOrganizationId: null,
				previousState: null,
				newState: '{"name":"Test"}',
				sourceService: "auth-svc",
				createdAt: "2024-01-01T00:00:00.000Z",
				previousSignature: GENESIS_SIGNATURE,
			};

			const sig1 = await computeSignature(payload);
			const sig2 = await computeSignature(payload);

			expect(sig1).toBe(sig2);
			expect(sig1).toHaveLength(64); // SHA-256 hex string
		});

		it("should produce different signatures for different data", async () => {
			const payload1 = {
				id: "test-id-1",
				eventType: "CREATE",
				entityType: "user",
				entityId: "user-123",
				actorUserId: null,
				actorOrganizationId: null,
				previousState: null,
				newState: null,
				sourceService: "auth-svc",
				createdAt: "2024-01-01T00:00:00.000Z",
				previousSignature: GENESIS_SIGNATURE,
			};

			const payload2 = {
				...payload1,
				id: "test-id-2",
			};

			const sig1 = await computeSignature(payload1);
			const sig2 = await computeSignature(payload2);

			expect(sig1).not.toBe(sig2);
		});
	});

	describe("createSignaturePayload", () => {
		it("should create payload with GENESIS for first entry", () => {
			const input: CreateAuditLogInput = {
				eventType: "CREATE",
				entityType: "user",
				entityId: "user-123",
				sourceService: "auth-svc",
				newState: { name: "Test" },
			};

			const payload = createSignaturePayload(
				"log-id",
				input,
				"2024-01-01T00:00:00.000Z",
				null,
			);

			expect(payload.previousSignature).toBe(GENESIS_SIGNATURE);
			expect(payload.id).toBe("log-id");
			expect(payload.newState).toBe('{"name":"Test"}');
		});

		it("should include previous signature when provided", () => {
			const input: CreateAuditLogInput = {
				eventType: "UPDATE",
				entityType: "user",
				entityId: "user-123",
				sourceService: "auth-svc",
			};

			const prevSig = "abc123def456";
			const payload = createSignaturePayload(
				"log-id",
				input,
				"2024-01-01T00:00:00.000Z",
				prevSig,
			);

			expect(payload.previousSignature).toBe(prevSig);
		});
	});

	describe("verifyEntrySignature", () => {
		it("should verify valid signature", async () => {
			const input: CreateAuditLogInput = {
				eventType: "CREATE",
				entityType: "user",
				entityId: "user-123",
				sourceService: "auth-svc",
				newState: { name: "Test" },
			};

			const createdAt = "2024-01-01T00:00:00.000Z";
			const payload = createSignaturePayload("log-id", input, createdAt, null);
			const signature = await computeSignature(payload);

			const entry = {
				id: "log-id",
				eventType: "CREATE",
				entityType: "user",
				entityId: "user-123",
				actorUserId: null,
				actorOrganizationId: null,
				previousState: null,
				newState: { name: "Test" },
				sourceService: "auth-svc",
				createdAt: new Date(createdAt),
				signature,
				previousSignature: null,
			};

			const result = await verifyEntrySignature(entry, null);
			expect(result.valid).toBe(true);
		});

		it("should detect tampered signature", async () => {
			const entry = {
				id: "log-id",
				eventType: "CREATE",
				entityType: "user",
				entityId: "user-123",
				actorUserId: null,
				actorOrganizationId: null,
				previousState: null,
				newState: { name: "Test" },
				sourceService: "auth-svc",
				createdAt: new Date("2024-01-01T00:00:00.000Z"),
				signature: "tampered-signature-value",
				previousSignature: null,
			};

			const result = await verifyEntrySignature(entry, null);
			expect(result.valid).toBe(false);
		});
	});

	describe("generateChangeSummary", () => {
		it("should generate summary for CREATE (no previous state)", () => {
			const newState = { name: "Test", email: "test@example.com" };
			const summary = generateChangeSummary(null, newState);

			expect(summary.name).toEqual({ old: null, new: "Test" });
			expect(summary.email).toEqual({ old: null, new: "test@example.com" });
		});

		it("should generate summary for DELETE (no new state)", () => {
			const previousState = { name: "Test", email: "test@example.com" };
			const summary = generateChangeSummary(previousState, null);

			expect(summary.name).toEqual({ old: "Test", new: null });
			expect(summary.email).toEqual({ old: "test@example.com", new: null });
		});

		it("should generate summary for UPDATE", () => {
			const previousState = { name: "Old Name", count: 5 };
			const newState = { name: "New Name", count: 5 };
			const summary = generateChangeSummary(previousState, newState);

			expect(summary.name).toEqual({ old: "Old Name", new: "New Name" });
			expect(summary.count).toBeUndefined(); // No change
		});

		it("should return empty object when both states are null", () => {
			const summary = generateChangeSummary(null, null);
			expect(summary).toEqual({});
		});
	});
});
