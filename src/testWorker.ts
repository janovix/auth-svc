/**
 * Test entry point.
 * Exports the raw Hono app without Sentry wrapper for use in tests.
 */
import { app } from "./app";
import type { Bindings } from "./types/bindings";

export default {
	async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
		return app.fetch(request, env, ctx);
	},
};
