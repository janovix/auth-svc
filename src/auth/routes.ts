import { Hono } from "hono";
import type { Context } from "hono";

import { getBetterAuthContext, invalidateBetterAuthCache } from "./instance";
import type { Bindings } from "../types/bindings";
import { verifyTurnstileToken, getClientIp } from "../utils/turnstile";

export const INTERNAL_AUTH_HEADER = "x-auth-internal-token";

export function registerBetterAuthRoutes(app: Hono<{ Bindings: Bindings }>) {
	// Better Auth handles CORS and cookies internally based on its configuration
	// Just mount the handler as per Better Auth documentation: https://www.better-auth.com/docs/integrations/hono

	// Handle OPTIONS preflight requests explicitly - Better Auth may not handle them
	app.options("/api/auth/*", async (c) => {
		const requestOrigin = c.req.header("origin");

		// Check if origin is trusted (Better Auth's trustedOrigins config)
		const { originMatchesAnyPattern } = await import("../http/origins");
		const { getTrustedOriginPatterns } = await import("../middleware/cors");
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
						"Content-Type, Authorization, x-auth-internal-token, x-csrf-token, x-xsrf-token, x-requested-with",
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		// For untrusted origins or no origin, return 204 without CORS headers
		return new Response(null, { status: 204 });
	});

	// Handle actual requests (GET, POST, etc.)
	app.on(["POST", "GET"], "/api/auth/*", async (c) => {
		// Get execution context from Hono context (Cloudflare Workers)
		// Hono exposes executionCtx in Cloudflare Workers environment
		const executionContext = (
			c as unknown as { executionCtx?: ExecutionContext }
		).executionCtx;

		const { auth, accessPolicy } = getBetterAuthContext(
			c.env,
			executionContext,
		);

		// Defensive cleanup: Better Auth stores *encrypted* private keys in `jwks.privateKey`.
		// Some environments were seeded with plaintext JWK JSON, which triggers decrypt failures.
		await purgePlaintextJwks(c);

		// Validate Turnstile for forgot-password requests
		const pathname = c.req.path;
		if (pathname === "/api/auth/forgot-password" && c.req.method === "POST") {
			const turnstileResult = await validateTurnstileForRequest(c);
			if (!turnstileResult.valid) {
				return c.json(
					{
						success: false,
						message: turnstileResult.message,
						errors: [{ code: 4003, message: turnstileResult.message }],
					},
					400,
				);
			}
		}

		// Handle internal access policy if enabled
		// Better Auth's trustedOrigins config handles browser access, so we only block non-browser API calls
		if (accessPolicy.enforceInternal) {
			const isPublicJwks = pathname === "/api/auth/jwks";

			// JWKS must be publicly reachable
			if (isPublicJwks) {
				return handleAuthRequest(c, auth);
			}

			// For browser requests, Better Auth will handle origin checking via trustedOrigins
			// Only require internal token for non-browser API calls (no origin header)
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

		return handleAuthRequest(c, auth);
	});
}

/**
 * Validates Turnstile token for password reset requests.
 *
 * If TURNSTILE_SECRET_KEY is not configured, validation is skipped (development mode).
 * This allows local development without Turnstile while enforcing it in production.
 */
async function validateTurnstileForRequest(
	c: Context<{ Bindings: Bindings }>,
): Promise<{ valid: boolean; message: string }> {
	const turnstileSecret = c.env.TURNSTILE_SECRET_KEY;

	// Skip validation if Turnstile is not configured (development mode)
	if (!turnstileSecret) {
		console.warn(
			"[Turnstile] TURNSTILE_SECRET_KEY not configured, skipping validation",
		);
		return { valid: true, message: "Turnstile not configured" };
	}

	// Parse the request body to get the turnstile token
	let body: { turnstileToken?: string; email?: string };
	try {
		body = await c.req.json();
	} catch {
		return { valid: false, message: "Invalid request body" };
	}

	const { turnstileToken } = body;

	if (!turnstileToken) {
		return { valid: false, message: "Turnstile token is required" };
	}

	const clientIp = getClientIp(c.req.raw);

	const result = await verifyTurnstileToken({
		secretKey: turnstileSecret,
		token: turnstileToken,
		remoteIp: clientIp,
	});

	if (!result.success) {
		console.warn("[Turnstile] Verification failed:", result["error-codes"]);
		return {
			valid: false,
			message: "Bot verification failed. Please try again.",
		};
	}

	return { valid: true, message: "Turnstile verified" };
}

async function handleAuthRequest(
	c: Context<{ Bindings: Bindings }>,
	auth: { handler: (request: Request) => Promise<Response> },
) {
	// Wrap Better Auth handler to ensure all errors are caught and converted to responses
	const handlerPromise = auth.handler(c.req.raw).catch((error) => {
		// If Better Auth throws an error, convert it to a proper error response
		// Better Auth should return responses, but if it throws, handle it gracefully
		const errorMessage = error instanceof Error ? error.message : String(error);
		return new Response(
			JSON.stringify({
				success: false,
				errors: [
					{
						code: 5000,
						message: errorMessage || "Internal Server Error",
					},
				],
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	});

	try {
		const response = await handlerPromise;
		const shouldAttemptRecovery =
			await responseIndicatesJwksDecryptError(response);
		if (!shouldAttemptRecovery) {
			return addCorsHeadersIfNeeded(c, response);
		}

		// Retry after clearing JWKS on decrypt error
		await clearJwksAndResetAuth(c);
		const executionContext = (
			c as unknown as { executionCtx?: ExecutionContext }
		).executionCtx;
		const { auth: refreshed } = getBetterAuthContext(c.env, executionContext);
		const retryPromise = refreshed.handler(c.req.raw).catch((error) => {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return new Response(
				JSON.stringify({
					success: false,
					errors: [
						{
							code: 5000,
							message: errorMessage || "Internal Server Error",
						},
					],
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		});
		return addCorsHeadersIfNeeded(c, await retryPromise);
	} catch (error) {
		// Catch any errors from response processing
		if (!isJwksDecryptError(error)) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return c.json(
				{
					success: false,
					errors: [
						{
							code: 5000,
							message: errorMessage || "Internal Server Error",
						},
					],
				},
				500,
			);
		}

		// Retry after clearing JWKS on decrypt error
		await clearJwksAndResetAuth(c, error);
		const executionContext = (
			c as unknown as { executionCtx?: ExecutionContext }
		).executionCtx;
		const { auth: refreshed } = getBetterAuthContext(c.env, executionContext);
		const retryPromise = refreshed.handler(c.req.raw).catch((error) => {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return new Response(
				JSON.stringify({
					success: false,
					errors: [
						{
							code: 5000,
							message: errorMessage || "Internal Server Error",
						},
					],
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		});
		return addCorsHeadersIfNeeded(c, await retryPromise);
	}
}

async function addCorsHeadersIfNeeded(
	c: Context<{ Bindings: Bindings }>,
	response: Response,
): Promise<Response> {
	const requestOrigin = c.req.header("origin");
	if (!requestOrigin) {
		// No origin header means same-origin request - no CORS headers needed
		return response;
	}

	// Check if origin is trusted (Better Auth's trustedOrigins config)
	const { originMatchesAnyPattern } = await import("../http/origins");
	const { getTrustedOriginPatterns } = await import("../middleware/cors");
	const patterns = getTrustedOriginPatterns(c.env);
	const isTrusted = originMatchesAnyPattern(requestOrigin, patterns);

	if (!isTrusted) {
		// Untrusted origin - don't add CORS headers
		return response;
	}

	// Clone response and add CORS headers for trusted origins
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", requestOrigin);
	headers.set("Access-Control-Allow-Credentials", "true");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function isJwksDecryptError(error: unknown) {
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
	// - Clearing the JWKS table allows Better Auth to regenerate keys on retry.
	try {
		await c.env.DB.prepare("DELETE FROM jwks").run();
		invalidateBetterAuthCache(c.env);
	} catch {
		if (originalError) throw originalError;
		throw new Error("Failed to clear JWKS after decrypt error");
	}
}
