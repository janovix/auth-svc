/**
 * Production entry point.
 * Wraps the Hono app with Sentry for error tracking and monitoring.
 *
 * Sentry is enabled only when `SENTRY_DSN` environment variable is set.
 * Configure it via wrangler secrets: `wrangler secret put SENTRY_DSN`
 */
import * as Sentry from "@sentry/cloudflare";
import { app } from "./app";
import type { Bindings } from "./types/bindings";

// Export RPC entrypoint for service binding callers
export { AuthSvcEntrypoint } from "./entrypoint";

// Export the Hono app wrapped with Sentry for production
export default Sentry.withSentry((env: Bindings) => {
	const { id: versionId } = env.CF_VERSION_METADATA;
	return {
		// When DSN is undefined/empty, Sentry SDK is disabled (no events sent)
		dsn: env.SENTRY_DSN,
		release: versionId,
		environment: env.ENVIRONMENT,
		// Adds request headers and IP for users, for more info visit:
		// https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/options/#sendDefaultPii
		sendDefaultPii: true,
	};
}, app);
