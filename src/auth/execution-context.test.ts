import { describe, expect, it, vi, beforeEach } from "vitest";

import {
	setCurrentExecutionContext,
	getCurrentExecutionContext,
	executeInBackground,
} from "./execution-context";

describe("execution-context", () => {
	beforeEach(() => {
		// Reset execution context before each test
		setCurrentExecutionContext(undefined);
	});

	describe("setCurrentExecutionContext / getCurrentExecutionContext", () => {
		it("stores and retrieves execution context", () => {
			const mockContext = {
				waitUntil: vi.fn(),
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			setCurrentExecutionContext(mockContext);
			expect(getCurrentExecutionContext()).toBe(mockContext);
		});

		it("returns undefined when no context is set", () => {
			expect(getCurrentExecutionContext()).toBeUndefined();
		});

		it("allows clearing the context by setting undefined", () => {
			const mockContext = {
				waitUntil: vi.fn(),
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			setCurrentExecutionContext(mockContext);
			expect(getCurrentExecutionContext()).toBe(mockContext);

			setCurrentExecutionContext(undefined);
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

			setCurrentExecutionContext(mockContext);

			const promise = Promise.resolve("done");
			executeInBackground(promise, "test operation");

			expect(waitUntilMock).toHaveBeenCalledWith(promise);
		});

		it("falls back to fire-and-forget when no context is available", async () => {
			setCurrentExecutionContext(undefined);

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
			setCurrentExecutionContext(undefined);

			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const error = new Error("test error");
			const promise = Promise.reject(error);
			executeInBackground(promise, "failing operation");

			// Wait for promise to settle and error handler to run
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[Background] failing operation failed:",
				error,
			);

			consoleErrorSpy.mockRestore();
		});

		it("passes rejected promise to waitUntil when context is available", async () => {
			const waitUntilMock = vi.fn();
			const mockContext = {
				waitUntil: waitUntilMock,
				passThroughOnException: vi.fn(),
			} as unknown as ExecutionContext;

			setCurrentExecutionContext(mockContext);

			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const error = new Error("test error");
			// Create a promise that rejects but also catch it to prevent unhandled rejection
			const promise = Promise.reject(error);
			promise.catch(() => {}); // Prevent unhandled rejection in test environment

			executeInBackground(promise, "operation with context");

			// waitUntil should be called with the promise
			expect(waitUntilMock).toHaveBeenCalledWith(promise);

			// No error should be logged by executeInBackground (waitUntil handles it)
			expect(consoleErrorSpy).not.toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});
	});
});
