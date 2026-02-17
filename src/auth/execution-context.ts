/**
 * Request-scoped execution context storage for Cloudflare Workers.
 *
 * This module provides a way to store and retrieve the current request's
 * execution context, allowing async callbacks (like email sending) to
 * access waitUntil() without capturing stale references.
 *
 * IMPORTANT: Cloudflare Workers can process multiple requests concurrently
 * within the same isolate. Using a simple global variable causes race conditions
 * where request B overwrites request A's context while A is still processing.
 *
 * Solution: Use a stack-based approach with timestamps to detect stale contexts.
 * Each request pushes its context on entry and pops on exit. Background tasks
 * capture a reference to the context at creation time rather than reading from
 * a global variable at execution time.
 */
import * as Sentry from "@sentry/cloudflare";

/**
 * Context entry with metadata for debugging and staleness detection.
 */
interface ContextEntry {
	ctx: ExecutionContext;
	timestamp: number;
	requestId: string;
	backgroundPromises: Promise<unknown>[];
}

/**
 * Stack of execution contexts. Most recent is at the end.
 * Using a stack handles nested/concurrent requests better than a single variable.
 */
const contextStack: ContextEntry[] = [];

/**
 * Maximum age (ms) for a context to be considered valid.
 * Cloudflare Workers have a 30s CPU time limit, so contexts older than this
 * are likely from completed requests.
 */
const MAX_CONTEXT_AGE_MS = 30_000;

/**
 * Generate a simple request ID for debugging.
 */
function generateRequestId(): string {
	return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sets the current request's execution context.
 * Should be called at the start of each request handler.
 *
 * @returns A cleanup function to call when the request completes
 */
export function setCurrentExecutionContext(
	ctx: ExecutionContext | undefined,
): () => void {
	if (!ctx) {
		console.warn(
			`[ExecutionContext] setCurrentExecutionContext called with undefined context! Background tasks will not work.`,
		);
		return () => {}; // No-op cleanup for undefined context
	}

	const requestId = generateRequestId();
	const entry: ContextEntry = {
		ctx,
		timestamp: Date.now(),
		requestId,
		backgroundPromises: [],
	};

	contextStack.push(entry);
	// Debug logging intentionally removed for production performance

	// Cleanup function to remove this specific context
	return () => {
		const index = contextStack.findIndex((e) => e.requestId === requestId);
		if (index !== -1) {
			contextStack.splice(index, 1);
		}
	};
}

/**
 * Gets the current request's execution context for use in callbacks.
 * Returns undefined if no valid context is available.
 *
 * This function cleans up stale contexts and returns the most recent valid one.
 */
export function getCurrentExecutionContext(): ExecutionContext | undefined {
	const now = Date.now();

	// Clean up stale contexts (from requests that may have completed without cleanup)
	while (
		contextStack.length > 0 &&
		now - contextStack[0].timestamp > MAX_CONTEXT_AGE_MS
	) {
		const stale = contextStack.shift();
		console.warn(
			`[ExecutionContext] Cleaned up stale context ${stale?.requestId} (age: ${now - (stale?.timestamp ?? 0)}ms)`,
		);
	}

	// Return the most recent context (last in stack)
	if (contextStack.length > 0) {
		return contextStack[contextStack.length - 1].ctx;
	}

	return undefined;
}

/**
 * Gets the current request's ID for use in tracking and correlation.
 * Returns undefined if no valid context is available.
 */
export function getCurrentRequestId(): string | undefined {
	const now = Date.now();

	// Skip stale contexts without modifying the stack
	for (let i = contextStack.length - 1; i >= 0; i--) {
		const entry = contextStack[i];
		if (now - entry.timestamp <= MAX_CONTEXT_AGE_MS) {
			return entry.requestId;
		}
	}

	return undefined;
}

/**
 * Tracks a background promise for a request so cleanup can await it.
 * Used by executeInBackground to track promises that will be waited on.
 */
export function trackBackgroundPromise(promise: Promise<unknown>): void {
	const requestId = getCurrentRequestId();
	if (!requestId) {
		return;
	}

	const entry = contextStack.find((e) => e.requestId === requestId);
	if (entry) {
		entry.backgroundPromises.push(promise);
	}
}

/**
 * Waits for all background promises in the current request to settle,
 * with a maximum timeout as fallback.
 * Returns a promise that resolves when all tasks are done or timeout occurs.
 */
export function waitForBackgroundPromises(maxWaitMs = 12000): Promise<void> {
	const requestId = getCurrentRequestId();
	if (!requestId) {
		return Promise.resolve();
	}

	const entry = contextStack.find((e) => e.requestId === requestId);
	if (!entry || entry.backgroundPromises.length === 0) {
		return Promise.resolve();
	}

	// Race between all promises settling and timeout
	return Promise.race([
		Promise.allSettled(entry.backgroundPromises).then(() => {}),
		new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
	]);
}

/**
 * Captures the current execution context for use in a callback.
 * Returns a function that can be called later to execute work in the background.
 *
 * This is safer than reading the global context at callback execution time
 * because it captures the context at the time the callback is created.
 *
 * @returns A function that takes a promise and runs it with waitUntil
 */
export function captureBackgroundExecutor(): (
	promise: Promise<unknown>,
	errorContext: string,
) => void {
	// Capture the context NOW, at creation time
	const capturedCtx = getCurrentExecutionContext();

	return (promise: Promise<unknown>, errorContext: string) => {
		// Wrap promise with error handling and timeout
		const safePromise = Promise.race([
			promise,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error(`Background task timeout: ${errorContext}`)),
					25_000,
				),
			),
		]).catch((error) => {
			console.error(`[Background] ${errorContext} failed:`, error);
			Sentry.captureException(error, {
				tags: { context: "background-task-failed" },
				extra: { errorContext },
			});
		});

		if (capturedCtx && typeof capturedCtx.waitUntil === "function") {
			try {
				capturedCtx.waitUntil(safePromise);
			} catch (err) {
				// waitUntil can throw if called after response is sent
				console.warn(
					`[Background] waitUntil failed for ${errorContext}, running detached:`,
					err,
				);
			}
		}
		// If no context or waitUntil failed, the promise runs detached
		// (it's already been started and has error handling)
	};
}

/**
 * Executes a promise in the background using waitUntil if available.
 * Falls back to fire-and-forget with error logging if no context is available.
 *
 * NOTE: This reads the current context at execution time, which may not be
 * the correct context if called from an async callback. For callbacks,
 * prefer using captureBackgroundExecutor() at callback creation time.
 *
 * @param promise - The promise to execute in the background
 * @param errorContext - A string describing the operation for error logging
 */
export function executeInBackground(
	promise: Promise<unknown>,
	errorContext: string,
): void {
	const ctx = getCurrentExecutionContext();

	// Wrap promise with error handling and timeout to prevent hanging
	const safePromise = Promise.race([
		promise,
		new Promise((_, reject) =>
			setTimeout(
				() => reject(new Error(`Background task timeout: ${errorContext}`)),
				25_000,
			),
		),
	]).catch((error) => {
		console.error(`[Background] ${errorContext} failed:`, error);
		Sentry.captureException(error, {
			tags: { context: "background-task-failed" },
			extra: { errorContext },
		});
	});

	// Track this promise for later cleanup
	trackBackgroundPromise(safePromise);

	if (ctx && typeof ctx.waitUntil === "function") {
		try {
			ctx.waitUntil(safePromise);
		} catch (err) {
			// waitUntil can throw if called after response is sent
			console.warn(
				`[Background] waitUntil failed for ${errorContext}, running detached:`,
				err,
			);
		}
	} else {
		console.warn(
			`[Background] NO EXECUTION CONTEXT for ${errorContext} - email will not be sent!`,
		);
	}
	// If no context or waitUntil failed, the promise runs detached
	// (it's already been started and has error handling)
}
