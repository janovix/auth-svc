import { describe, expect, it, vi } from "vitest";

import {
	runWithExecutionContext,
	getExecutionContext,
	executeInBackground,
} from "./execution-context";

// Sentry is imported in execution-context.ts – mock it to keep tests clean
vi.mock("@sentry/cloudflare", () => ({
	captureException: vi.fn(),
}));

function makeMockCtx() {
	return {
		waitUntil: vi.fn(),
		passThroughOnException: vi.fn(),
	} as unknown as ExecutionContext;
}

describe("runWithExecutionContext / getExecutionContext", () => {
	it("makes the context available inside the callback", async () => {
		const ctx = makeMockCtx();
		let captured: ExecutionContext | undefined;

		await runWithExecutionContext(ctx, async () => {
			captured = getExecutionContext();
		});

		expect(captured).toBe(ctx);
	});

	it("returns undefined outside a scoped callback", () => {
		expect(getExecutionContext()).toBeUndefined();
	});

	it("isolates contexts between nested calls", async () => {
		const outer = makeMockCtx();
		const inner = makeMockCtx();
		const captured: (ExecutionContext | undefined)[] = [];

		await runWithExecutionContext(outer, async () => {
			captured.push(getExecutionContext()); // should be outer

			await runWithExecutionContext(inner, async () => {
				captured.push(getExecutionContext()); // should be inner
			});

			captured.push(getExecutionContext()); // should be outer again
		});

		expect(captured).toEqual([outer, inner, outer]);
	});

	it("runs fn and returns its result even when ctx is undefined", async () => {
		const result = await runWithExecutionContext(undefined, async () => 42);
		expect(result).toBe(42);
	});
});

describe("executeInBackground", () => {
	it("calls waitUntil when context is available", async () => {
		const ctx = makeMockCtx();

		await runWithExecutionContext(ctx, async () => {
			executeInBackground(Promise.resolve("ok"), "test");
		});

		expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
	});

	it("logs a warning and runs fire-and-forget when no context is set", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		executeInBackground(Promise.resolve("ok"), "no-ctx op");

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("No ExecutionContext"),
		);

		warnSpy.mockRestore();
	});

	it("catches errors from the promise and logs them", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		// Execute without a context so the promise runs detached
		executeInBackground(Promise.reject(new Error("boom")), "failing op");

		// Allow microtask queue to drain
		await new Promise((r) => setTimeout(r, 10));

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("[Background] failing op failed:"),
			expect.any(Error),
		);

		errorSpy.mockRestore();
	});

	it("uses the correct per-request context via ALS isolation", async () => {
		const ctx1 = makeMockCtx();
		const ctx2 = makeMockCtx();

		await Promise.all([
			runWithExecutionContext(ctx1, async () => {
				executeInBackground(Promise.resolve(), "req1");
			}),
			runWithExecutionContext(ctx2, async () => {
				executeInBackground(Promise.resolve(), "req2");
			}),
		]);

		expect(ctx1.waitUntil).toHaveBeenCalledTimes(1);
		expect(ctx2.waitUntil).toHaveBeenCalledTimes(1);
	});
});
