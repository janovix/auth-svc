import { Hono } from "hono";
import type { Context } from "hono";

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
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		// For untrusted origins or no origin, return 204 without CORS headers
		return new Response(null, { status: 204 });
	});

	// Handle actual requests (GET, POST, etc.)
	app.on(["POST", "GET"], "/api/auth/*", async (c) => {
		const startTime = Date.now();
		const pathname = c.req.path;

		// Log request start for debugging hang issues
		console.log(`[Auth] Request started: ${c.req.method} ${pathname}`);

		// Get execution context from Hono context (Cloudflare Workers)
		// Hono exposes executionCtx in Cloudflare Workers environment
		const executionContext = (
			c as unknown as { executionCtx?: ExecutionContext }
		).executionCtx;

		const { auth, accessPolicy } = await getBetterAuthContext(
			c.env,
			executionContext,
		);
		console.log(
			`[Auth] Context built in ${Date.now() - startTime}ms for ${pathname}`,
		);

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
			try {
				const body = (await c.req.raw.clone().json()) as { email?: string };
				otpEmail = body.email || null;
				if (otpEmail) {
					startOtpTracking(otpEmail);
					console.log(
						`[OTP Tracking] Started tracking OTP request for ${otpEmail}`,
					);
				}
			} catch {
				// Ignore parse errors
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

		// === SUBSCRIPTION ENDPOINT LOGGING ===
		// Log all subscription-related requests for debugging
		if (pathname.startsWith("/api/auth/subscription/")) {
			console.log(
				`[Subscription] ========== ${c.req.method} ${pathname} ==========`,
			);
			console.log(`[Subscription] Headers:`, {
				origin: c.req.header("origin"),
				contentType: c.req.header("content-type"),
				authorization: c.req.header("authorization") ? "present" : "absent",
			});

			// Log request body for POST/PUT requests
			if (c.req.method === "POST" || c.req.method === "PUT") {
				try {
					const bodyClone = await c.req.raw.clone().json();
					console.log(
						`[Subscription] Request Body:`,
						JSON.stringify(bodyClone, null, 2),
					);
				} catch {
					console.log(`[Subscription] Request Body: (could not parse)`);
				}
			}

			// Log Stripe price IDs from database
			try {
				const { PricingRepository, PricingService } = await import(
					"../domain/pricing"
				);
				const pricingRepository = new PricingRepository(c.env.DB);
				const pricingService = new PricingService(pricingRepository);
				const priceMap = await pricingService.getAllSubscriptionPrices();
				console.log(`[Subscription] Database Stripe Price IDs:`, {
					business: priceMap.get("business") || "NOT FOUND",
					pro: priceMap.get("pro") || "NOT FOUND",
					ultra: priceMap.get("ultra") || "NOT FOUND",
				});
			} catch (err) {
				console.log(`[Subscription] Could not fetch prices from DB:`, err);
				// Fall back to showing env vars
				console.log(`[Subscription] Env Stripe Price IDs (fallback):`, {
					STRIPE_BUSINESS_PRICE_ID: c.env.STRIPE_BUSINESS_PRICE_ID || "NOT SET",
					STRIPE_PRO_PRICE_ID: c.env.STRIPE_PRO_PRICE_ID || "NOT SET",
				});
			}
			console.log(
				`[Subscription] ================================================`,
			);
		}

		// Handle internal access policy if enabled
		// Better Auth's trustedOrigins config handles browser access, so we only block non-browser API calls
		if (accessPolicy.enforceInternal) {
			// Public routes that can be accessed without origin header or internal token:
			// - /api/auth/jwks: JWKS must be publicly reachable for JWT verification
			// - /api/auth/verify-email: Users click verification links in emails (direct browser navigation)
			// - /api/auth/subscription/*: All Stripe subscription routes (redirects, callbacks, etc.)
			const isPublicRoute =
				pathname === "/api/auth/jwks" ||
				pathname === "/api/auth/verify-email" ||
				pathname.startsWith("/api/auth/subscription/");

			if (isPublicRoute) {
				const response = await handleAuthRequest(c, auth);
				// Log subscription endpoint responses
				if (pathname.startsWith("/api/auth/subscription/")) {
					console.log(`[Subscription] Response Status: ${response.status}`);
					if (response.status >= 400) {
						try {
							const errorBody = await response.clone().json();
							console.log(
								`[Subscription] Error Response:`,
								JSON.stringify(errorBody, null, 2),
							);
						} catch {
							console.log(
								`[Subscription] Error Response: (could not parse body)`,
							);
						}
					}
					console.log(`[Subscription] =====================================`);
				}
				return response;
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

		const preHandlerTime = Date.now();
		const response = await handleAuthRequest(c, auth);
		console.log(
			`[Auth] Handler completed in ${Date.now() - preHandlerTime}ms for ${pathname} (total: ${Date.now() - startTime}ms)`,
		);

		// Log subscription endpoint responses (non-public route case)
		if (pathname.startsWith("/api/auth/subscription/")) {
			console.log(`[Subscription] Response Status: ${response.status}`);
			if (response.status >= 400) {
				try {
					const errorBody = await response.clone().json();
					console.log(
						`[Subscription] Error Response:`,
						JSON.stringify(errorBody, null, 2),
					);
				} catch {
					console.log(`[Subscription] Error Response: (could not parse body)`);
				}
			}
			console.log(`[Subscription] =====================================`);
		}

		// Check if OTP was rate-limited (request succeeded but callback wasn't called)
		if (isOtpRequest && otpEmail && response.status === 200) {
			const wasSent = checkOtpSent();
			if (!wasSent) {
				console.log(
					`[OTP Tracking] OTP for ${otpEmail} was RATE LIMITED (existing OTP still valid)`,
				);

				// Modify response to indicate rate limiting
				try {
					const originalBody = (await response.clone().json()) as Record<
						string,
						unknown
					>;
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
			} else {
				console.log(`[OTP Tracking] OTP for ${otpEmail} was SENT successfully`);
			}
		}

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
 */
async function validateTurnstileForRequest(
	c: Context<{ Bindings: Bindings }>,
): Promise<{ valid: boolean; message: string }> {
	const pathname = c.req.path;
	const turnstileSecret = c.env.TURNSTILE_SECRET_KEY;

	// Skip validation if Turnstile is not configured (development mode)
	if (!turnstileSecret) {
		console.warn(
			`[Turnstile] TURNSTILE_SECRET_KEY not configured, skipping validation for ${pathname}`,
		);
		return { valid: true, message: "Turnstile not configured" };
	}

	// Get Turnstile token from either:
	// 1. x-captcha-response header (Better Auth client convention)
	// 2. turnstileToken in request body (legacy/custom clients)
	let turnstileToken = c.req.header("x-captcha-response");

	if (!turnstileToken) {
		// Fallback to request body for backwards compatibility
		// Clone the request stream to avoid exhausting it for Better Auth handler
		try {
			const body = (await c.req.raw.clone().json()) as {
				turnstileToken?: string;
			};
			turnstileToken = body.turnstileToken;
		} catch {
			// Body parsing failed, but header might still have token
		}
	}

	if (!turnstileToken) {
		console.warn(`[Turnstile] Missing token for ${pathname}`);
		return { valid: false, message: "Turnstile token is required" };
	}

	const clientIp = getClientIp(c.req.raw);
	const startTime = Date.now();
	console.log(`[Turnstile] Starting verification for ${pathname}`);

	const result = await verifyTurnstileToken({
		secretKey: turnstileSecret,
		token: turnstileToken,
		remoteIp: clientIp,
	});

	const duration = Date.now() - startTime;

	if (!result.success) {
		console.warn(
			`[Turnstile] Verification failed for ${pathname} in ${duration}ms:`,
			result["error-codes"],
		);
		return {
			valid: false,
			message: "Bot verification failed. Please try again.",
		};
	}

	console.log(
		`[Turnstile] Verification succeeded for ${pathname} in ${duration}ms`,
	);

	return { valid: true, message: "Turnstile verified" };
}

async function handleAuthRequest(
	c: Context<{ Bindings: Bindings }>,
	auth: { handler: (request: Request) => Promise<Response> },
) {
	// Wrap Better Auth handler to ensure all errors are caught and converted to responses
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
		const { auth: refreshed } = await getBetterAuthContext(
			c.env,
			executionContext,
		);
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
		const { auth: refreshed } = await getBetterAuthContext(
			c.env,
			executionContext,
		);
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
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", requestOrigin);
	headers.set("Access-Control-Allow-Credentials", "true");

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
