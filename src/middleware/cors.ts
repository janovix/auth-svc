import { cors } from "hono/cors";

import { buildResolvedAuthConfig } from "../auth/config";
import { originMatchesAnyPattern } from "../http/origins";
import type { Bindings } from "../types/bindings";

export function getTrustedOriginPatterns(env: Bindings) {
	const resolved = buildResolvedAuthConfig(env);
	const trustedOrigins = resolved.options.trustedOrigins;
	return Array.isArray(trustedOrigins) ? trustedOrigins : [];
}

export function createCorsMiddleware() {
	return cors({
		origin: (requestOrigin, c) => {
			if (!requestOrigin) return undefined;
			const patterns = getTrustedOriginPatterns(c.env as Bindings);
			const matches = originMatchesAnyPattern(requestOrigin, patterns);

			return matches ? requestOrigin : undefined;
		},
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"x-auth-internal-token",
			"x-csrf-token",
			"x-xsrf-token",
			"x-requested-with",
			"x-environment",
			"x-e2e-turnstile-bypass",
		],
		allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
		exposeHeaders: ["X-Retry-After"],
		credentials: true,
	});
}
