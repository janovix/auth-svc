import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	isStripeBillingEnabled,
	STRIPE_BILLING_FLAG_KEY,
} from "./stripe-billing-flag";
import type { Bindings, FlagsSvcRpc } from "../types/bindings";

const makeFlagsRpc = (
	isFlagEnabled: FlagsSvcRpc["isFlagEnabled"],
): FlagsSvcRpc => ({
	fetch: vi.fn(),
	evaluateFlag: vi.fn(),
	evaluateFlags: vi.fn(),
	evaluateAllFlags: vi.fn(),
	isFlagEnabled,
});

describe("isStripeBillingEnabled", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("returns true when FLAGS_SERVICE is undefined (fail-open)", async () => {
		const env = {} as Bindings;
		await expect(isStripeBillingEnabled(env)).resolves.toBe(true);
	});

	it("returns true when isFlagEnabled resolves true", async () => {
		const isFlagEnabled = vi.fn().mockResolvedValue(true);
		const env = {
			FLAGS_SERVICE: makeFlagsRpc(isFlagEnabled),
			ENVIRONMENT: "preview",
		} as unknown as Bindings;

		await expect(isStripeBillingEnabled(env)).resolves.toBe(true);
		expect(isFlagEnabled).toHaveBeenCalledWith(STRIPE_BILLING_FLAG_KEY, {
			environment: "preview",
		});
	});

	it("returns false when isFlagEnabled resolves false", async () => {
		const isFlagEnabled = vi.fn().mockResolvedValue(false);
		const env = {
			FLAGS_SERVICE: makeFlagsRpc(isFlagEnabled),
			ENVIRONMENT: "qa",
		} as unknown as Bindings;

		await expect(isStripeBillingEnabled(env)).resolves.toBe(false);
		expect(isFlagEnabled).toHaveBeenCalledWith(STRIPE_BILLING_FLAG_KEY, {
			environment: "qa",
		});
	});

	it("returns true when isFlagEnabled throws (fail-open on RPC error)", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const err = new Error("rpc down");
		const isFlagEnabled = vi.fn().mockRejectedValue(err);
		const env = {
			FLAGS_SERVICE: makeFlagsRpc(isFlagEnabled),
		} as unknown as Bindings;

		await expect(isStripeBillingEnabled(env)).resolves.toBe(true);
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("uses production when ENVIRONMENT is not a string", async () => {
		const isFlagEnabled = vi.fn().mockResolvedValue(true);
		const env = {
			FLAGS_SERVICE: makeFlagsRpc(isFlagEnabled),
			ENVIRONMENT: undefined,
		} as unknown as Bindings;

		await isStripeBillingEnabled(env);
		expect(isFlagEnabled).toHaveBeenCalledWith(STRIPE_BILLING_FLAG_KEY, {
			environment: "production",
		});
	});
});
