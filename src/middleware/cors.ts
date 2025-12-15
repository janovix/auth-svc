import { cors } from "hono/cors";

import { buildResolvedAuthConfig } from "../auth/config";
import { originMatchesAnyPattern } from "../http/origins";
import type { Bindings } from "../types/bindings";

const trustedOriginCache = new Map<string, readonly string[]>();

function cacheKey(env: Bindings) {
	return [
		env.ENVIRONMENT ?? "",
		env.AUTH_COOKIE_DOMAIN ?? "",
		env.AUTH_TRUSTED_ORIGINS ?? "",
		// BETTER_AUTH_URL doesn't affect the origin list, but including it is a safe
		// hedge against future coupling (and keeps cache keys stable per deployment).
		env.BETTER_AUTH_URL ?? "",
	].join("|");
}

export function getTrustedOriginPatterns(env: Bindings) {
	const key = cacheKey(env);
	const cached = trustedOriginCache.get(key);
	if (cached) return cached;

	const resolved = buildResolvedAuthConfig(env);
	const trustedOrigins = resolved.options.trustedOrigins;
	const patterns = Array.isArray(trustedOrigins) ? trustedOrigins : [];
	trustedOriginCache.set(key, patterns);
	return patterns;
}

export function createCorsMiddleware() {
	return cors({
		origin: (requestOrigin, c) => {
			if (!requestOrigin) return undefined;
			const patterns = getTrustedOriginPatterns(c.env as Bindings);
			return originMatchesAnyPattern(requestOrigin, patterns)
				? requestOrigin
				: undefined;
		},
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"x-auth-internal-token",
			"x-csrf-token",
			"x-xsrf-token",
			"x-requested-with",
		],
		allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
		credentials: true,
	});
}
