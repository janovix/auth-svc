import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
	setCurrentExecutionContext,
	getCurrentExecutionContext,
	executeInBackground,
	captureBackgroundExecutor,
} from "./execution-context";

describe("execution-context", () => {
	let cleanupFns: (() => void)[] = [];

	beforeEach(() => {
		cleanupFns = [];
	});

	afterEach(() => {
		// Clean up all contexts after each test
		cleanupFns.forEach((fn) => fn());
		cleanupFns = [];
	});

	describe("setCurrentExecutionContext / getCurrentExecutionContext", () => {
		it("stores and retrieves execution context", () => {
			const mockContext = {
				waitUntil: vi.fn(),
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			const cleanup = setCurrentExecutionContext(mockContext);
			cleanupFns.push(cleanup);

			expect(getCurrentExecutionContext()).toBe(mockContext);
		});

		it("returns undefined when no context is set", () => {
			expect(getCurrentExecutionContext()).toBeUndefined();
		});

		it("allows clearing the context using cleanup function", () => {
			const mockContext = {
				waitUntil: vi.fn(),
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			const cleanup = setCurrentExecutionContext(mockContext);
			expect(getCurrentExecutionContext()).toBe(mockContext);

			cleanup();
			expect(getCurrentExecutionContext()).toBeUndefined();
		});

		it("returns no-op cleanup for undefined context", () => {
			const cleanup = setCurrentExecutionContext(undefined);
			expect(typeof cleanup).toBe("function");
			// Should not throw
			cleanup();
		});

		it("handles multiple concurrent contexts (stack behavior)", () => {
			const mockContext1 = {
				waitUntil: vi.fn(),
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;
			const mockContext2 = {
				waitUntil: vi.fn(),
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			const cleanup1 = setCurrentExecutionContext(mockContext1);
			cleanupFns.push(cleanup1);

			const cleanup2 = setCurrentExecutionContext(mockContext2);
			cleanupFns.push(cleanup2);

			// Most recent context should be returned
			expect(getCurrentExecutionContext()).toBe(mockContext2);

			// After cleaning up context2, context1 should be returned
			cleanup2();
			expect(getCurrentExecutionContext()).toBe(mockContext1);

			// After cleaning up context1, undefined should be returned
			cleanup1();
			expect(getCurrentExecutionContext()).toBeUndefined();
		});
	});

	describe("executeInBackground", () => {
		it("uses waitUntil when execution context is available", () => {
			const waitUntilMock = vi.fn();
			const mockContext = {
				waitUntil: waitUntilMock,
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			const cleanup = setCurrentExecutionContext(mockContext);
			cleanupFns.push(cleanup);

			const promise = Promise.resolve("done");
			executeInBackground(promise, "test operation");

			// waitUntil should be called (with wrapped promise that has timeout)
			expect(waitUntilMock).toHaveBeenCalledTimes(1);
		});

		it("falls back to fire-and-forget when no context is available", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			// This should not throw
			const promise = Promise.resolve("done");
			executeInBackground(promise, "test operation");

			// Wait for promise to settle
			await promise;

			// No error should have been logged for successful promise
			expect(consoleErrorSpy).not.toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it("logs error when promise rejects and no context is available", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const error = new Error("test error");
			const promise = Promise.reject(error);
			executeInBackground(promise, "failing operation");

			// Wait for promise to settle and error handler to run
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("[Background] failing operation failed:"),
				expect.any(Error),
			);

			consoleErrorSpy.mockRestore();
		});

		it("handles waitUntil throwing (e.g., after response sent)", () => {
			const consoleWarnSpy = vi
				.spyOn(console, "warn")
				.mockImplementation(() => {});
			const mockContext = {
				waitUntil: vi.fn().mockImplementation(() => {
					throw new Error("Cannot call waitUntil after response");
				}),
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			const cleanup = setCurrentExecutionContext(mockContext);
			cleanupFns.push(cleanup);

			// Should not throw
			const promise = Promise.resolve("done");
			executeInBackground(promise, "test operation");

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining("[Background] waitUntil failed"),
				expect.any(Error),
			);

			consoleWarnSpy.mockRestore();
		});
	});

	describe("captureBackgroundExecutor", () => {
		it("captures context at creation time, not execution time", async () => {
			const waitUntilMock1 = vi.fn();
			const mockContext1 = {
				waitUntil: waitUntilMock1,
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			const cleanup1 = setCurrentExecutionContext(mockContext1);
			cleanupFns.push(cleanup1);

			// Capture executor while context1 is active
			const executor = captureBackgroundExecutor();

			// Switch to a different context
			const waitUntilMock2 = vi.fn();
			const mockContext2 = {
				waitUntil: waitUntilMock2,
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			const cleanup2 = setCurrentExecutionContext(mockContext2);
			cleanupFns.push(cleanup2);

			// Execute using the captured executor - should use context1
			const promise = Promise.resolve("done");
			executor(promise, "test operation");

			// Should use the captured context (context1), not current (context2)
			expect(waitUntilMock1).toHaveBeenCalledTimes(1);
			expect(waitUntilMock2).not.toHaveBeenCalled();
		});

		it("handles captured context being cleaned up", async () => {
			const consoleWarnSpy = vi
				.spyOn(console, "warn")
				.mockImplementation(() => {});
			const waitUntilMock = vi.fn().mockImplementation(() => {
				throw new Error("Context no longer valid");
			});
			const mockContext = {
				waitUntil: waitUntilMock,
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			const cleanup = setCurrentExecutionContext(mockContext);

			// Capture executor
			const executor = captureBackgroundExecutor();

			// Clean up context (simulates request completing)
			cleanup();

			// Execute should handle the error gracefully
			const promise = Promise.resolve("done");
			executor(promise, "test operation");

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining("[Background] waitUntil failed"),
				expect.any(Error),
			);

			consoleWarnSpy.mockRestore();
		});

		it("works without any context set", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			// No context set
			const executor = captureBackgroundExecutor();

			// Should not throw
			const promise = Promise.resolve("done");
			executor(promise, "test operation");

			// Wait for promise to settle
			await promise;

			// No error should have been logged for successful promise
			expect(consoleErrorSpy).not.toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});
	});
});
