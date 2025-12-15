import app from "./index";
import type { Bindings } from "./types/bindings";

// Export without Sentry wrapper for tests
export default {
	async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
		return app.fetch(request, env, ctx);
	},
};
