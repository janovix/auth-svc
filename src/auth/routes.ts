import { Hono } from "hono";
import type { Context } from "hono";
import * as Sentry from "@sentry/cloudflare";

import { getBetterAuthContext, invalidateBetterAuthCache } from "./instance";
import type { Bindings } from "../types/bindings";
import { originMatchesAnyPattern } from "../http/origins";
import { getTrustedOriginPatterns } from "../middleware/cors";
import { JWKS_KV_CACHE_KEY } from "../routes/jwks";
import {
	rebuildPostRequest,
	verifyTurnstileForProtectedAuthPost,
} from "../middleware/turnstile-captcha";

export const INTERNAL_AUTH_HEADER = "x-auth-internal-token";

export function registerBetterAuthRoutes(app: Hono<{ Bindings: Bindings }>) {
	// Better Auth handles CORS and cookies internally based on its configuration
	// Just mount the handler as per Better Auth documentation: https://www.better-auth.com/docs/integrations/hono

	// Handle OPTIONS preflight requests explicitly - Better Auth may not handle them
	app.options("/api/auth/*", (c) => {
		const requestOrigin = c.req.header("origin");

		// Check if origin is trusted (Better Auth's trustedOrigins config)
		const patterns = getTrustedOriginPatterns(c.env);
		const isTrusted =
			requestOrigin && originMatchesAnyPattern(requestOrigin, patterns);

		// Return CORS headers for trusted origins
		if (isTrusted) {
			return new Response(null, {
				status: 204,
				headers: {
					"Access-Control-Allow-Origin": requestOrigin,
					"Access-Control-Allow-Credentials": "true",
					"Access-Control-Allow-Methods":
						"GET, POST, PUT, DELETE, PATCH, OPTIONS",
					"Access-Control-Allow-Headers":
						"Content-Type, Authorization, x-auth-internal-token, x-csrf-token, x-xsrf-token, x-requested-with, x-captcha-response",
					"Access-Control-Expose-Headers": "X-Retry-After",
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		// For untrusted origins or no origin, return 204 without CORS headers
		return new Response(null, { status: 204 });
	});

	// Handle actual requests (GET, POST, etc.)
	// The ALS scope for ExecutionContext is established by the global middleware
	// in app.ts (runWithExecutionContext), so all routes — including these —
	// can call getExecutionContext() / executeInBackground() without extra wrapping.
	app.on(["POST", "GET"], "/api/auth/*", async (c) => {
		const pathname = c.req.path;

		const { auth, accessPolicy } = await getBetterAuthContext(
			c.env,
			pathname, // Pass pathname to enable conditional Stripe loading
		);

		// Handle internal access policy if enabled.
		// Better Auth's trustedOrigins config handles browser access; we only
		// block non-browser API calls that lack the internal token.
		if (accessPolicy.enforceInternal) {
			// Public routes accessible without an origin header or internal token:
			// - /api/auth/jwks:           JWKS must be publicly reachable for JWT verification
			// - /api/auth/verify-email:   Users click verification links in emails
			// - /api/auth/callback/*:     OAuth provider callbacks (e.g. Google)
			// - /api/auth/subscription/*: Stripe subscription routes / webhooks
			const isPublicRoute =
				pathname === "/api/auth/jwks" ||
				pathname === "/api/auth/verify-email" ||
				pathname.startsWith("/api/auth/callback/") ||
				pathname.startsWith("/api/auth/error") ||
				pathname.startsWith("/api/auth/subscription/");

			if (!isPublicRoute) {
				// For browser requests Better Auth validates via trustedOrigins.
				// Only enforce the internal token for non-browser callers (no origin header).
				const hasOrigin = !!c.req.header("origin");
				if (!hasOrigin) {
					const providedToken = c.req.header(INTERNAL_AUTH_HEADER);
					if (!providedToken || providedToken !== accessPolicy.token) {
						return c.json(
							{
								message: "Forbidden: auth-core Better Auth surface is private.",
							},
							403,
						);
					}
				}
			}
		}

		return handleAuthRequest(c, auth);
	});
}

// Safety-net timeout for auth.handler(). On the Workers paid plan I/O waits have
// no wall-clock limit, so a stuck D1 query can hang forever without this.
// KV operations have their own 3s internal timeout (kv-storage.ts), so the
// worst-case scenario is a slow D1 query. 10s gives D1 sufficient headroom
// while keeping the user-visible hang short. The frontend middleware uses an
// 8s fetchWithTimeout anyway, so anything over 8s only affects direct API callers.
const AUTH_HANDLER_TIMEOUT_MS = 10_000;

async function handleAuthRequest(
	c: Context<{ Bindings: Bindings }>,
	auth: { handler: (request: Request) => Promise<Response> },
) {
	const pathname = c.req.path;
	const startTime = Date.now();

	try {
		// Pass the original request directly to Better Auth.
		// Better Auth uses APIError with a statusCode for redirects (302); catch
		// those and convert them to proper Response objects.
		//
		// Wrapped in Promise.race so that any D1/KV hang (infrastructure issue,
		// residual lock contention, etc.) resolves with a 504 instead of blocking
		// the Worker indefinitely.
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

		const timeoutPromise = new Promise<Response>((resolve) => {
			timeoutHandle = setTimeout(() => {
				Sentry.captureMessage("Auth handler timeout", {
					level: "error",
					tags: { context: "auth-handler-timeout", pathname },
					extra: { pathname, elapsed_ms: Date.now() - startTime },
				});
				resolve(
					new Response(
						JSON.stringify({
							success: false,
							errors: [
								{
									code: 5003,
									message: "Request timed out. Please try again.",
								},
							],
						}),
						{
							status: 504,
							headers: { "Content-Type": "application/json" },
						},
					),
				);
			}, AUTH_HANDLER_TIMEOUT_MS);
		});

		let requestForAuth = c.req.raw;
		if (c.req.method === "POST") {
			const bodyText = await c.req.raw.text();
			const turnstile = await verifyTurnstileForProtectedAuthPost(
				c.req.url,
				c.req.raw.headers,
				bodyText,
				c.env.TURNSTILE_SECRET_KEY,
			);
			if (!turnstile.ok) {
				return addCorsHeadersIfNeeded(c, turnstile.response);
			}
			requestForAuth = rebuildPostRequest(c.req.raw, bodyText);
		}

		const handlerPromise = auth.handler(requestForAuth).catch((error) => {
			if (isBetterAuthRedirectError(error)) {
				const headers = new Headers();
				const errorHeaders = error.headers;
				if (errorHeaders && typeof errorHeaders.forEach === "function") {
					errorHeaders.forEach((value: string, key: string) => {
						headers.set(key, value);
					});
				}
				return new Response(null, { status: error.statusCode, headers });
			}

			Sentry.captureException(error, {
				tags: { context: "better-auth-handler", pathname },
				extra: { pathname },
			});
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return new Response(
				JSON.stringify({
					success: false,
					errors: [
						{ code: 5000, message: errorMessage || "Internal Server Error" },
					],
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		});

		const response = await Promise.race([
			handlerPromise.then((r) => {
				clearTimeout(timeoutHandle);
				return r;
			}),
			timeoutPromise,
		]);

		const shouldAttemptRecovery =
			await responseIndicatesJwksDecryptError(response);
		if (!shouldAttemptRecovery) {
			return addCorsHeadersIfNeeded(c, response);
		}

		// JWKS decrypt error detected — clear stale keys so the next request
		// regenerates them. Don't retry immediately as the body may be consumed.
		Sentry.captureMessage("JWKS decrypt error detected, cleared JWKS", {
			level: "warning",
			tags: { context: "jwks-decrypt-error", pathname },
		});
		await clearJwksAndResetAuth(c);
		return c.json(
			{
				success: false,
				errors: [
					{
						code: 5001,
						message: "Authentication service error. Please try again.",
					},
				],
			},
			500,
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		Sentry.captureException(error, {
			tags: { context: "auth-handler-error", pathname },
			extra: { pathname, errorMessage },
		});

		if (isJwksDecryptError(error)) {
			Sentry.captureMessage("JWKS decrypt error detected in catch", {
				level: "warning",
				tags: { context: "jwks-decrypt-error-catch", pathname },
			});
			await clearJwksAndResetAuth(c, error);
		}

		return c.json(
			{
				success: false,
				errors: [
					{ code: 5000, message: errorMessage || "Internal Server Error" },
				],
			},
			500,
		);
	}
}

function addCorsHeadersIfNeeded(
	c: Context<{ Bindings: Bindings }>,
	response: Response,
): Response {
	const requestOrigin = c.req.header("origin");
	if (!requestOrigin) {
		// No origin header means same-origin request - no CORS headers needed
		return response;
	}

	// Check if origin is trusted (Better Auth's trustedOrigins config)
	const patterns = getTrustedOriginPatterns(c.env);
	const isTrusted = originMatchesAnyPattern(requestOrigin, patterns);

	if (!isTrusted) {
		// Untrusted origin - don't add CORS headers
		return response;
	}

	// Clone response and add CORS headers for trusted origins
	// CRITICAL: Preserve all Set-Cookie headers explicitly
	// The Headers API may drop multiple Set-Cookie values when cloning
	const headers = new Headers();

	// Copy all headers from the original response
	response.headers.forEach((value, key) => {
		// Skip Set-Cookie - we'll handle it separately
		if (key.toLowerCase() !== "set-cookie") {
			headers.set(key, value);
		}
	});

	// Explicitly preserve all Set-Cookie headers
	// getSetCookie() returns all Set-Cookie values as an array
	const setCookies = response.headers.getSetCookie?.();
	if (setCookies && setCookies.length > 0) {
		for (const cookie of setCookies) {
			headers.append("Set-Cookie", cookie);
		}
	}

	// Add CORS headers
	headers.set("Access-Control-Allow-Origin", requestOrigin);
	headers.set("Access-Control-Allow-Credentials", "true");
	headers.set("Access-Control-Expose-Headers", "X-Retry-After");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * Checks if an error is a Better Auth redirect "error" (APIError with statusCode 3xx).
 * Better Auth throws APIError for redirects instead of returning Response objects.
 * Exported for unit testing.
 */
export function isBetterAuthRedirectError(
	error: unknown,
): error is { statusCode: number; headers: Headers } {
	if (!error || typeof error !== "object") return false;
	const e = error as { statusCode?: number; headers?: unknown; name?: string };
	return (
		e.name === "APIError" &&
		typeof e.statusCode === "number" &&
		e.statusCode >= 300 &&
		e.statusCode < 400 &&
		e.headers !== undefined
	);
}

/**
 * Checks if an error is a JWKS decrypt error from Better Auth.
 * Exported for unit testing.
 */
export function isJwksDecryptError(error: unknown) {
	if (!error) return false;
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("Failed to decrypt private key") ||
		(message.includes("BetterAuthError") &&
			message.toLowerCase().includes("decrypt private key"))
	);
}

async function purgePlaintextJwks(c: Context<{ Bindings: Bindings }>) {
	try {
		// Plaintext JWK JSON produced by seeds typically starts with `{` and includes `"kty"`.
		// Encrypted values generated by Better Auth do not look like a JWK object.
		await c.env.DB.prepare(
			`DELETE FROM jwks WHERE TRIM(privateKey) LIKE '{%' AND privateKey LIKE '%"kty"%'`,
		).run();
	} catch {
		// Ignore missing table / database errors; Better Auth will surface those separately.
	}
}

async function responseIndicatesJwksDecryptError(response: Response) {
	if (response.status < 500) return false;
	try {
		const text = await response.clone().text();
		return text.includes("Failed to decrypt private key");
	} catch {
		return false;
	}
}

async function clearJwksAndResetAuth(
	c: Context<{ Bindings: Bindings }>,
	originalError?: unknown,
) {
	// Recovery path:
	// - This error is almost always caused by a stale/seeded JWKS row whose privateKey cannot be
	//   decrypted with the current Better Auth secret (or isn't encrypted at all).
	// - First try to purge plaintext JWKS entries, then clear remaining invalid entries.
	// - Clearing the JWKS table allows Better Auth to regenerate keys on retry.
	try {
		// First attempt targeted cleanup of plaintext keys
		await purgePlaintextJwks(c);
		// Then clear all remaining JWKS if needed
		await c.env.DB.prepare("DELETE FROM jwks").run();
		// Invalidate the KV cache used by the dedicated JWKS handler (src/routes/jwks.ts)
		// so the next request re-reads from D1 and repopulates the cache with fresh keys.
		await c.env.KV.delete(JWKS_KV_CACHE_KEY);
		invalidateBetterAuthCache(c.env);
	} catch {
		if (originalError) throw originalError;
		throw new Error("Failed to clear JWKS after decrypt error");
	}
}
