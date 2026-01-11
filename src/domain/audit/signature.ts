/**
 * Audit signature utilities for integrity verification
 *
 * The signature chain works like a blockchain:
 * - Each entry's signature includes all its data plus the previous entry's signature
 * - This creates an immutable chain where any modification breaks the chain
 * - Verification can detect tampering by recomputing signatures
 */

import type { CreateAuditLogInput } from "./types";

/**
 * Genesis signature for the first entry in the chain
 */
export const GENESIS_SIGNATURE = "GENESIS";

/**
 * Payload structure for signature computation
 * Order matters - must be consistent for verification
 */
interface SignaturePayload {
	id: string;
	eventType: string;
	entityType: string;
	entityId: string | null;
	actorUserId: string | null;
	actorOrganizationId: string | null;
	previousState: string | null;
	newState: string | null;
	sourceService: string;
	createdAt: string;
	previousSignature: string;
}

/**
 * Compute SHA-256 signature for an audit log entry
 *
 * @param payload - The data to sign
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeSignature(
	payload: SignaturePayload,
): Promise<string> {
	// Create deterministic JSON string (sorted keys)
	const jsonString = JSON.stringify(payload, Object.keys(payload).sort());

	// Compute SHA-256 hash
	const encoder = new TextEncoder();
	const data = encoder.encode(jsonString);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);

	// Convert to hex string
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create signature payload from audit log input
 */
export function createSignaturePayload(
	id: string,
	input: CreateAuditLogInput,
	createdAt: string,
	previousSignature: string | null,
): SignaturePayload {
	return {
		id,
		eventType: input.eventType,
		entityType: input.entityType,
		entityId: input.entityId ?? null,
		actorUserId: input.actorUserId ?? null,
		actorOrganizationId: input.actorOrganizationId ?? null,
		previousState: input.previousState
			? JSON.stringify(input.previousState)
			: null,
		newState: input.newState ? JSON.stringify(input.newState) : null,
		sourceService: input.sourceService,
		createdAt,
		previousSignature: previousSignature ?? GENESIS_SIGNATURE,
	};
}

/**
 * Verify a single audit log entry's signature
 *
 * @param entry - The audit log entry to verify
 * @param expectedPreviousSignature - The signature of the previous entry
 * @returns true if signature is valid
 */
export async function verifyEntrySignature(
	entry: {
		id: string;
		eventType: string;
		entityType: string;
		entityId: string | null;
		actorUserId: string | null;
		actorOrganizationId: string | null;
		previousState: Record<string, unknown> | null;
		newState: Record<string, unknown> | null;
		sourceService: string;
		createdAt: Date;
		signature: string;
		previousSignature: string | null;
	},
	expectedPreviousSignature: string | null,
): Promise<{ valid: boolean; expectedSignature?: string }> {
	// Check previous signature matches expected
	const actualPrevSig = entry.previousSignature ?? GENESIS_SIGNATURE;
	const expectedPrevSig = expectedPreviousSignature ?? GENESIS_SIGNATURE;

	if (actualPrevSig !== expectedPrevSig) {
		return { valid: false };
	}

	// Recompute signature
	const payload: SignaturePayload = {
		id: entry.id,
		eventType: entry.eventType,
		entityType: entry.entityType,
		entityId: entry.entityId,
		actorUserId: entry.actorUserId,
		actorOrganizationId: entry.actorOrganizationId,
		previousState: entry.previousState
			? JSON.stringify(entry.previousState)
			: null,
		newState: entry.newState ? JSON.stringify(entry.newState) : null,
		sourceService: entry.sourceService,
		createdAt: entry.createdAt.toISOString(),
		previousSignature: actualPrevSig,
	};

	const expectedSignature = await computeSignature(payload);

	return {
		valid: entry.signature === expectedSignature,
		expectedSignature,
	};
}

/**
 * Generate a change summary from two states
 *
 * @param previousState - State before change
 * @param newState - State after change
 * @returns Object with changed fields
 */
export function generateChangeSummary(
	previousState: Record<string, unknown> | null,
	newState: Record<string, unknown> | null,
): Record<string, { old: unknown; new: unknown }> {
	const changes: Record<string, { old: unknown; new: unknown }> = {};

	if (!previousState && !newState) {
		return changes;
	}

	if (!previousState) {
		// CREATE - all fields are new
		if (newState) {
			for (const [key, value] of Object.entries(newState)) {
				changes[key] = { old: null, new: value };
			}
		}
		return changes;
	}

	if (!newState) {
		// DELETE - all fields removed
		for (const [key, value] of Object.entries(previousState)) {
			changes[key] = { old: value, new: null };
		}
		return changes;
	}

	// UPDATE - compare fields
	const allKeys = new Set([
		...Object.keys(previousState),
		...Object.keys(newState),
	]);

	for (const key of allKeys) {
		const oldValue = previousState[key];
		const newValue = newState[key];

		// Deep comparison using JSON stringify
		if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
			changes[key] = { old: oldValue, new: newValue };
		}
	}

	return changes;
}
