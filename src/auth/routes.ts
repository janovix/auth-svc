import { Hono } from "hono";
import type { Context } from "hono";
import * as Sentry from "@sentry/cloudflare";

import { getBetterAuthContext, invalidateBetterAuthCache } from "./instance";
import type { Bindings } from "../types/bindings";
import { verifyTurnstileToken, getClientIp } from "../utils/turnstile";
import { originMatchesAnyPattern } from "../http/origins";
import { getTrustedOriginPatterns } from "../middleware/cors";

export const INTERNAL_AUTH_HEADER = "x-auth-internal-token";

/**
 * Track OTP send requests to detect rate limiting.
 * Key: requestId, Value: { email, timestamp, sent: boolean }
 * We use a simple approach: set a flag before request, callback sets sent=true
 */
let otpSendTracker: { email: string; sent: boolean } | null = null;

/**
 * Called by sendVerificationOTP callback to mark that OTP was actually sent
 */
export function markOtpSent(email: string) {
	if (otpSendTracker && otpSendTracker.email === email) {
		otpSendTracker.sent = true;
	}
}

/**
 * Start tracking an OTP send request
 */
function startOtpTracking(email: string) {
	otpSendTracker = { email, sent: false };
}

/**
 * Check if OTP was actually sent and clean up
 */
function checkOtpSent(): boolean {
	const wasSent = otpSendTracker?.sent ?? false;
	otpSendTracker = null;
	return wasSent;
}

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
	app.on(["POST", "GET"], "/api/auth/*", async (c) => {
		const pathname = c.req.path;

		// Get execution context from Hono context (Cloudflare Workers)
		// Hono exposes executionCtx in Cloudflare Workers environment
		const executionContext = (
			c as unknown as { executionCtx?: ExecutionContext }
		).executionCtx;

		const { auth, accessPolicy, cleanup } = await getBetterAuthContext(
			c.env,
			executionContext,
			pathname, // Pass pathname to enable conditional Stripe loading
		);

		// NOTE: We intentionally do NOT cleanup the context on a timer here.
		// The old approach (setTimeout(cleanup, 100)) was cleaning up before
		// the sendVerificationOTP callback ran, causing background tasks to fail.
		// Instead, we rely on:
		// 1. The MAX_CONTEXT_AGE_MS (30s) staleness detection to clean up eventually
		// 2. Cleanup after the entire handler chain completes (see below)

		// Note: purgePlaintextJwks() was moved out of the hot path for performance.
		// It now only runs during JWKS error recovery (see clearJwksAndResetAuth).

		// Track OTP send requests to detect rate limiting
		let isOtpRequest = false;
		let otpEmail: string | null = null;
		if (
			pathname === "/api/auth/email-otp/send-verification-otp" &&
			c.req.method === "POST"
		) {
			isOtpRequest = true;
			// Try to get email from a CLONED request body for tracking
			// We must clone to avoid consuming the body before Better Auth reads it
			try {
				const clonedRequest = c.req.raw.clone();
				const body = (await clonedRequest.json()) as { email?: string };
				if (body.email) {
					otpEmail = body.email;
					startOtpTracking(otpEmail);
				}
			} catch {
				// Silently ignore body parsing failures
			}
		}

		// Validate Turnstile for endpoints that send emails (expensive operations)
		// We handle this ourselves instead of using Better Auth's captcha plugin
		// because our implementation has proper timeout handling to prevent hanging
		const turnstileProtectedEndpoints = [
			"/api/auth/sign-up/email",
			"/api/auth/email-otp/send-verification-otp",
		];
		if (
			turnstileProtectedEndpoints.includes(pathname) &&
			c.req.method === "POST"
		) {
			const turnstileResult = await validateTurnstileForRequest(c);
			if (!turnstileResult.valid) {
				// CRITICAL: Cleanup execution context before returning
				c.executionCtx?.waitUntil?.(
					new Promise<void>((resolve) => {
						setTimeout(() => {
							cleanup();
							resolve();
						}, 100); // Quick cleanup for validation failures
					}),
				);
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
			// Public routes that can be accessed without origin header or internal token:
			// - /api/auth/jwks: JWKS must be publicly reachable for JWT verification
			// - /api/auth/verify-email: Users click verification links in emails (direct browser navigation)
			// - /api/auth/callback/*: OAuth provider callbacks (Google, etc.) come from external servers
			// - /api/auth/subscription/*: All Stripe subscription routes (redirects, callbacks, etc.)
			const isPublicRoute =
				pathname === "/api/auth/jwks" ||
				pathname === "/api/auth/verify-email" ||
				pathname.startsWith("/api/auth/callback/") ||
				pathname.startsWith("/api/auth/error") ||
				pathname.startsWith("/api/auth/subscription/");

			if (isPublicRoute) {
				const response = await handleAuthRequest(c, auth);

				// CRITICAL: Schedule cleanup for public routes too!
				// Without this, execution context leaks and causes hanging
				c.executionCtx?.waitUntil?.(
					new Promise<void>((resolve) => {
						setTimeout(() => {
							cleanup();
							resolve();
						}, 5000);
					}),
				);

				return response;
			}

			// For browser requests, Better Auth will handle origin checking via trustedOrigins
			// Only require internal token for non-browser API calls (no origin header)
			const hasOrigin = !!c.req.header("origin");
			if (!hasOrigin) {
				const providedToken = c.req.header(INTERNAL_AUTH_HEADER);
				if (!providedToken || providedToken !== accessPolicy.token) {
					// CRITICAL: Cleanup execution context before returning
					c.executionCtx?.waitUntil?.(
						new Promise<void>((resolve) => {
							setTimeout(() => {
								cleanup();
								resolve();
							}, 100); // Quick cleanup for auth failures
						}),
					);
					return c.json(
						{
							message: "Forbidden: auth-core Better Auth surface is private.",
						},
						403,
					);
				}
			}
		}

		const response = await handleAuthRequest(c, auth);

		// Check if OTP was rate-limited (request succeeded but callback wasn't called)
		if (isOtpRequest && otpEmail && response.status === 200) {
			const wasSent = checkOtpSent();
			if (!wasSent) {
				// Modify response to indicate rate limiting
				try {
					const originalBody = (await response.clone().json()) as Record<
						string,
						unknown
					>;
					// Schedule cleanup after a delay to allow background tasks to complete
					c.executionCtx?.waitUntil?.(
						new Promise<void>((resolve) => {
							setTimeout(() => {
								cleanup();
								resolve();
							}, 5000); // 5 seconds should be enough for email to be sent
						}),
					);
					return new Response(
						JSON.stringify({
							...originalBody,
							rateLimited: true,
							message:
								"An OTP was already sent recently. Please check your email or wait before requesting a new code.",
						}),
						{
							status: 200,
							headers: response.headers,
						},
					);
				} catch {
					// If we can't parse, just return original
				}
			}
		}

		// Schedule cleanup after a delay to allow background tasks (like email sending) to complete
		// This must happen AFTER the handler has run so background tasks can use waitUntil
		c.executionCtx?.waitUntil?.(
			new Promise<void>((resolve) => {
				setTimeout(() => {
					cleanup();
					resolve();
				}, 5000); // 5 seconds should be enough for background tasks
			}),
		);

		return response;
	});
}

/**
 * Validates Turnstile token for email-sending requests.
 *
 * If TURNSTILE_SECRET_KEY is not configured, validation is skipped (development mode).
 * This allows local development without Turnstile while enforcing it in production.
 *
 * Uses our custom verifyTurnstileToken utility which has a 5-second timeout
 * to prevent request hanging in Cloudflare Workers.
 *
 * NOTE: Token is read from x-captcha-response header ONLY to avoid body stream issues.
 * The Better Auth client should send the token in this header.
 *
 * @param c - Hono context
 */
async function validateTurnstileForRequest(
	c: Context<{ Bindings: Bindings }>,
): Promise<{ valid: boolean; message: string }> {
	const turnstileSecret = c.env.TURNSTILE_SECRET_KEY;

	// Skip validation if Turnstile is not configured (development mode)
	if (!turnstileSecret) {
		return { valid: true, message: "Turnstile not configured" };
	}

	// Get Turnstile token from x-captcha-response header (Better Auth client convention)
	// We only check header to avoid consuming/cloning the request body
	const turnstileToken = c.req.header("x-captcha-response");

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
		return {
			valid: false,
			message: "Bot verification failed. Please try again.",
		};
	}

	return { valid: true, message: "Turnstile verified" };
}

/**
 * Timeout in milliseconds for Better Auth handler.
 * This prevents indefinite hangs from external service calls (Stripe, email, etc.)
 * Cloudflare Workers have a 30s limit, so we use 25s to leave room for cleanup.
 */
const BETTER_AUTH_HANDLER_TIMEOUT_MS = 25_000;

async function handleAuthRequest(
	c: Context<{ Bindings: Bindings }>,
	auth: { handler: (request: Request) => Promise<Response> },
) {
	const pathname = c.req.path;
	const startTime = Date.now();

	// Pass the original request directly to Better Auth
	// We no longer pre-process the body to avoid any stream issues
	const handlerPromise = auth.handler(c.req.raw).catch((error) => {
		// Better Auth uses APIError with statusCode for redirects (302)
		// Convert these "errors" to proper redirect responses
		if (isBetterAuthRedirectError(error)) {
			const headers = new Headers();
			const errorHeaders = error.headers;
			if (errorHeaders && typeof errorHeaders.forEach === "function") {
				errorHeaders.forEach((value: string, key: string) => {
					headers.set(key, value);
				});
			}
			return new Response(null, {
				status: error.statusCode,
				headers,
			});
		}

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

	// Add timeout protection to prevent indefinite hangs
	const timeoutPromise = new Promise<Response>((_, reject) => {
		setTimeout(() => {
			const elapsed = Date.now() - startTime;
			const error = new Error(`Request timeout after ${elapsed}ms`);
			Sentry.captureException(error, {
				tags: { context: "auth-handler-timeout", pathname },
				extra: { elapsed, pathname },
			});
			reject(error);
		}, BETTER_AUTH_HANDLER_TIMEOUT_MS);
	});

	try {
		const response = await Promise.race([handlerPromise, timeoutPromise]);
		const shouldAttemptRecovery =
			await responseIndicatesJwksDecryptError(response);
		if (!shouldAttemptRecovery) {
			return addCorsHeadersIfNeeded(c, response);
		}

		// Clear JWKS and invalidate cache for next request
		// Don't retry immediately as body may have been consumed
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
		const isTimeout = errorMessage.includes("timeout");

		Sentry.captureException(error, {
			tags: {
				context: isTimeout ? "auth-handler-timeout" : "auth-handler-error",
				pathname,
			},
			extra: { pathname, errorMessage, isTimeout },
		});

		// Check if it's a JWKS decrypt error
		if (isJwksDecryptError(error)) {
			Sentry.captureMessage("JWKS decrypt error detected in catch", {
				level: "warning",
				tags: { context: "jwks-decrypt-error-catch", pathname },
			});
			await clearJwksAndResetAuth(c, error);
		}

		// Return appropriate error code for timeout vs other errors
		const errorCode = isTimeout ? 5002 : 5000;
		const userMessage = isTimeout
			? "Request timed out. Please try again."
			: errorMessage || "Internal Server Error";

		return c.json(
			{
				success: false,
				errors: [
					{
						code: errorCode,
						message: userMessage,
					},
				],
			},
			isTimeout ? 504 : 500,
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
		invalidateBetterAuthCache(c.env);
	} catch {
		if (originalError) throw originalError;
		throw new Error("Failed to clear JWKS after decrypt error");
	}
}
