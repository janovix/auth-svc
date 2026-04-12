import { describe, it, expect, vi } from "vitest";
import {
	createStripeBillingGuard,
	createWebhookBillingGuard,
} from "./stripe-billing-guard";
import type { Bindings, FlagsSvcRpc } from "../types/bindings";

const makeFlagsRpc = (enabled: boolean): FlagsSvcRpc => ({
	fetch: vi.fn(),
	evaluateFlag: vi.fn(),
	evaluateFlags: vi.fn(),
	evaluateAllFlags: vi.fn(),
	isFlagEnabled: vi.fn().mockResolvedValue(enabled),
});

const makeEnv = (billingEnabled: boolean) =>
	({ FLAGS_SERVICE: makeFlagsRpc(billingEnabled) }) as unknown as Bindings;

describe("createStripeBillingGuard", () => {
	it("calls next when Stripe billing is enabled", async () => {
		const next = vi.fn().mockResolvedValue(undefined);
		const json = vi.fn();
		const guard = createStripeBillingGuard();
		await guard(
			{ env: makeEnv(true), json } as unknown as Parameters<typeof guard>[0],
			next,
		);
		expect(next).toHaveBeenCalled();
		expect(json).not.toHaveBeenCalled();
	});

	it("returns 403 with BILLING_DISABLED when billing is disabled", async () => {
		const next = vi.fn();
		const json = vi.fn().mockReturnValue(new Response());
		const guard = createStripeBillingGuard();
		await guard(
			{ env: makeEnv(false), json } as unknown as Parameters<typeof guard>[0],
			next,
		);
		expect(next).not.toHaveBeenCalled();
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				success: false,
				code: "BILLING_DISABLED",
			}),
			403,
		);
	});
});

describe("createWebhookBillingGuard", () => {
	it("calls next when Stripe billing is enabled", async () => {
		const next = vi.fn().mockResolvedValue(undefined);
		const json = vi.fn();
		const guard = createWebhookBillingGuard();
		await guard(
			{ env: makeEnv(true), json } as unknown as Parameters<typeof guard>[0],
			next,
		);
		expect(next).toHaveBeenCalled();
		expect(json).not.toHaveBeenCalled();
	});

	it("returns 200 { received, ignored } when billing is disabled", async () => {
		const next = vi.fn();
		const json = vi.fn().mockReturnValue(new Response());
		const guard = createWebhookBillingGuard();
		await guard(
			{ env: makeEnv(false), json } as unknown as Parameters<typeof guard>[0],
			next,
		);
		expect(next).not.toHaveBeenCalled();
		expect(json).toHaveBeenCalledWith({
			received: true,
			ignored: true,
		});
	});
});
