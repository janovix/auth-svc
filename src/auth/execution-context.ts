/**
 * Request-scoped execution context storage for Cloudflare Workers.
 *
 * Uses Node.js AsyncLocalStorage (enabled via the `nodejs_als` compatibility flag)
 * to associate an ExecutionContext with each request. This replaces the previous
 * global stack approach, which was prone to race conditions when concurrent
 * requests ran in the same Worker isolate.
 *
 * Usage:
 *   1. Call `runWithExecutionContext(ctx, fn)` at the top of each request handler.
 *   2. Anywhere in the async call tree, call `executeInBackground(promise, label)`
 *      to defer work via `waitUntil`. The ALS guarantees the correct context is used.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import * as Sentry from "@sentry/cloudflare";

const executionContextStorage = new AsyncLocalStorage<ExecutionContext>();

/**
 * Runs `fn` with the given ExecutionContext stored in AsyncLocalStorage.
 * All async operations inside `fn` (including callbacks triggered by Better Auth)
 * will be able to retrieve this context via `getExecutionContext()`.
 */
export function runWithExecutionContext<T>(
	ctx: ExecutionContext | undefined,
	fn: () => Promise<T>,
): Promise<T> {
	if (!ctx) {
		return fn();
	}
	return executionContextStorage.run(ctx, fn);
}

/**
 * Retrieves the ExecutionContext stored by `runWithExecutionContext` for the
 * current async scope. Returns `undefined` if called outside a scoped handler.
 */
export function getExecutionContext(): ExecutionContext | undefined {
	return executionContextStorage.getStore();
}

/**
 * Executes a promise in the background using `waitUntil` if an ExecutionContext
 * is available in the current async scope. Falls back to fire-and-forget with
 * error logging if no context is available.
 *
 * @param promise - The promise to execute in the background
 * @param errorContext - A descriptive label used in error logs / Sentry events
 */
export function executeInBackground(
	promise: Promise<unknown>,
	errorContext: string,
): void {
	const ctx = getExecutionContext();

	const safePromise = promise.catch((error) => {
		console.error(`[Background] ${errorContext} failed:`, error);
		Sentry.captureException(error, {
			tags: { context: "background-task-failed" },
			extra: { errorContext },
		});
	});

	if (ctx) {
		ctx.waitUntil(safePromise);
	} else {
		console.warn(
			`[Background] No ExecutionContext for "${errorContext}" – running detached`,
		);
	}
}
