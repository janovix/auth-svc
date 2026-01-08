/**
 * Production entry point.
 * Wraps the Hono app with Sentry for error tracking and monitoring.
 */
import * as Sentry from "@sentry/cloudflare";
import { app } from "./app";
import type { Bindings } from "./types/bindings";

// Export the Hono app wrapped with Sentry for production
export default Sentry.withSentry((env: Bindings) => {
	const { id: versionId } = env.CF_VERSION_METADATA;
	return {
		dsn: "https://b53d06607ecd38f1ba3197c48f0261ea@o4510105954680832.ingest.us.sentry.io/4510676722515968",
		release: versionId,
		environment: env.ENVIRONMENT,
		// Adds request headers and IP for users, for more info visit:
		// https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/options/#sendDefaultPii
		sendDefaultPii: true,
	};
}, app);
