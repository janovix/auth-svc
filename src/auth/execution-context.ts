/**
 * Request-scoped execution context storage for Cloudflare Workers.
 *
 * This module provides a way to store and retrieve the current request's
 * execution context, allowing async callbacks (like email sending) to
 * access waitUntil() without capturing stale references.
 *
 * In Cloudflare Workers, each request gets a fresh ExecutionContext.
 * Better Auth callbacks are defined at config time but execute at request time,
 * so they need a way to access the current request's context dynamically.
 */

let currentExecutionContext: ExecutionContext | undefined;

/**
 * Sets the current request's execution context.
 * Should be called at the start of each request handler.
 */
export function setCurrentExecutionContext(
	ctx: ExecutionContext | undefined,
): void {
	currentExecutionContext = ctx;
}

/**
 * Gets the current request's execution context for use in callbacks.
 * Returns undefined if no context is set (e.g., in tests or non-Worker environments).
 */
export function getCurrentExecutionContext(): ExecutionContext | undefined {
	return currentExecutionContext;
}

/**
 * Executes a promise in the background using waitUntil if available.
 * Falls back to fire-and-forget with error logging if no context is available.
 *
 * @param promise - The promise to execute in the background
 * @param errorContext - A string describing the operation for error logging
 */
export function executeInBackground(
	promise: Promise<unknown>,
	errorContext: string,
): void {
	const ctx = currentExecutionContext;

	if (ctx && typeof ctx.waitUntil === "function") {
		ctx.waitUntil(promise);
	} else {
		// Fire-and-forget with error handling
		promise.catch((error) => {
			console.error(`[Background] ${errorContext} failed:`, error);
		});
	}
}
