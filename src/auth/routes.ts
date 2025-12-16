import { Hono } from "hono";
import type { Context } from "hono";

import { getBetterAuthContext, invalidateBetterAuthCache } from "./instance";
import { originMatchesAnyPattern } from "../http/origins";
import {
	createCorsMiddleware,
	getTrustedOriginPatterns,
} from "../middleware/cors";
import type { Bindings } from "../types/bindings";

export const INTERNAL_AUTH_HEADER = "x-auth-internal-token";

export function registerBetterAuthRoutes(app: Hono<{ Bindings: Bindings }>) {
	const router = new Hono<{ Bindings: Bindings }>();

	// Handle OPTIONS preflight requests with a custom middleware that runs first
	// This ensures we always add CORS headers for trusted origins
	router.use("*", async (c, next) => {
		if (c.req.method === "OPTIONS") {
			return handleOptionsPreflight(c);
		}
		return next();
	});

	// Apply CORS middleware to Better Auth routes for non-OPTIONS requests
	// This is necessary because Better Auth's handler returns raw Response objects
	// that bypass Hono's global middleware. The middleware handles CORS for actual requests.
	router.use("*", createCorsMiddleware());

	router.all("*", async (c) => {
		const { auth, accessPolicy } = getBetterAuthContext(c.env);

		const pathname = c.req.path;
		const isPublicJwks = pathname === "/api/auth/jwks";
		const requestOrigin = c.req.header("origin");
		const isTrustedBrowserOrigin =
			!!requestOrigin &&
			originMatchesAnyPattern(requestOrigin, getTrustedOriginPatterns(c.env));

		if (accessPolicy.enforceInternal) {
			// JWKS must be publicly reachable so downstream services can verify JWTs.
			if (isPublicJwks) {
				return handleBetterAuthRequest(c, auth);
			}

			// Allow browser-based access from explicitly trusted origins (for cookie-based sessions),
			// while keeping the surface private for non-browser callers.
			if (isTrustedBrowserOrigin) {
				return handleBetterAuthRequest(c, auth);
			}

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

		return handleBetterAuthRequest(c, auth);
	});

	app.route("/api/auth", router);
}

type BetterAuthHandler = {
	handler: (request: Request) => Promise<Response>;
};

async function handleBetterAuthRequest(
	c: Context<{ Bindings: Bindings }>,
	auth: BetterAuthHandler,
) {
	// Defensive cleanup: Better Auth stores *encrypted* private keys in `jwks.privateKey`.
	// Some environments were seeded with plaintext JWK JSON, which triggers decrypt failures.
	// If we detect obvious plaintext JWK material, remove it before invoking Better Auth.
	await purgePlaintextJwks(c);

	try {
		const response = await auth.handler(c.req.raw);
		const shouldAttemptRecovery =
			await responseIndicatesJwksDecryptError(response);
		if (!shouldAttemptRecovery) {
			return await addCorsHeadersToResponse(c, response);
		}

		await clearJwksAndResetAuth(c);
		const { auth: refreshed } = getBetterAuthContext(c.env);
		const retryResponse = await refreshed.handler(c.req.raw);
		return await addCorsHeadersToResponse(c, retryResponse);
	} catch (error) {
		if (!isJwksDecryptError(error)) {
			throw error;
		}

		await clearJwksAndResetAuth(c, error);
		const { auth: refreshed } = getBetterAuthContext(c.env);
		const retryResponse = await refreshed.handler(c.req.raw);
		return await addCorsHeadersToResponse(c, retryResponse);
	}
}

function handleOptionsPreflight(c: Context<{ Bindings: Bindings }>) {
	const requestOrigin = c.req.header("origin");
	if (!requestOrigin) {
		console.log("[CORS] OPTIONS preflight: No origin header");
		return new Response(null, { status: 204 });
	}

	const patterns = getTrustedOriginPatterns(c.env);
	const isTrusted = originMatchesAnyPattern(requestOrigin, patterns);
	console.log("[CORS] OPTIONS preflight:", {
		requestOrigin,
		patterns,
		isTrusted,
	});
	if (!isTrusted) {
		console.log(
			"[CORS] OPTIONS preflight: Origin not trusted, returning 204 without CORS headers",
		);
		return new Response(null, { status: 204 });
	}

	// Return OPTIONS response with CORS headers
	console.log(
		"[CORS] OPTIONS preflight: Origin trusted, returning 204 with CORS headers",
	);
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": requestOrigin,
			"Access-Control-Allow-Credentials": "true",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
			"Access-Control-Allow-Headers":
				"Content-Type, Authorization, x-auth-internal-token, x-csrf-token, x-xsrf-token, x-requested-with",
			"Access-Control-Max-Age": "86400", // 24 hours
		},
	});
}

async function addCorsHeadersToResponse(
	c: Context<{ Bindings: Bindings }>,
	response: Response,
): Promise<Response> {
	const requestOrigin = c.req.header("origin");
	if (!requestOrigin) {
		return response;
	}

	const patterns = getTrustedOriginPatterns(c.env);
	const isTrusted = originMatchesAnyPattern(requestOrigin, patterns);
	if (!isTrusted) {
		return response;
	}

	// Clone headers and add CORS headers
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", requestOrigin);
	headers.set("Access-Control-Allow-Credentials", "true");
	headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, DELETE, PATCH, OPTIONS",
	);
	headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization, x-auth-internal-token, x-csrf-token, x-xsrf-token, x-requested-with",
	);

	// Create new response with CORS headers
	// Note: We need to clone the body stream properly
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
