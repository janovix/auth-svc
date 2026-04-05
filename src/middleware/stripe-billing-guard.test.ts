import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	createStripeBillingGuard,
	createWebhookBillingGuard,
} from "./stripe-billing-guard";
import type { Bindings } from "../types/bindings";

vi.mock("../lib/stripe-billing-flag", () => ({
	isStripeBillingEnabled: vi.fn(),
}));

import { isStripeBillingEnabled } from "../lib/stripe-billing-flag";

const minimalEnv = {} as Bindings;

describe("createStripeBillingGuard", () => {
	beforeEach(() => {
		vi.mocked(isStripeBillingEnabled).mockReset();
	});

	it("calls next when Stripe billing is enabled", async () => {
		vi.mocked(isStripeBillingEnabled).mockResolvedValue(true);
		const next = vi.fn().mockResolvedValue(undefined);
		const json = vi.fn();
		const guard = createStripeBillingGuard();
		await guard(
			{ env: minimalEnv, json } as unknown as Parameters<typeof guard>[0],
			next,
		);
		expect(next).toHaveBeenCalled();
		expect(json).not.toHaveBeenCalled();
	});

	it("returns 403 with BILLING_DISABLED when billing is disabled", async () => {
		vi.mocked(isStripeBillingEnabled).mockResolvedValue(false);
		const next = vi.fn();
		const json = vi.fn().mockReturnValue(new Response());
		const guard = createStripeBillingGuard();
		await guard(
			{ env: minimalEnv, json } as unknown as Parameters<typeof guard>[0],
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
	beforeEach(() => {
		vi.mocked(isStripeBillingEnabled).mockReset();
	});

	it("calls next when Stripe billing is enabled", async () => {
		vi.mocked(isStripeBillingEnabled).mockResolvedValue(true);
		const next = vi.fn().mockResolvedValue(undefined);
		const json = vi.fn();
		const guard = createWebhookBillingGuard();
		await guard(
			{ env: minimalEnv, json } as unknown as Parameters<typeof guard>[0],
			next,
		);
		expect(next).toHaveBeenCalled();
		expect(json).not.toHaveBeenCalled();
	});

	it("returns 200 { received, ignored } when billing is disabled", async () => {
		vi.mocked(isStripeBillingEnabled).mockResolvedValue(false);
		const next = vi.fn();
		const json = vi.fn().mockReturnValue(new Response());
		const guard = createWebhookBillingGuard();
		await guard(
			{ env: minimalEnv, json } as unknown as Parameters<typeof guard>[0],
			next,
		);
		expect(next).not.toHaveBeenCalled();
		expect(json).toHaveBeenCalledWith({
			received: true,
			ignored: true,
		});
	});
});
