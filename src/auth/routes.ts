import { Hono } from "hono";
import type { Context } from "hono";

import { getBetterAuthContext, invalidateBetterAuthCache } from "./instance";
import type { Bindings } from "../types/bindings";

export const INTERNAL_AUTH_HEADER = "x-auth-internal-token";

export function registerBetterAuthRoutes(app: Hono<{ Bindings: Bindings }>) {
	// Better Auth handles CORS and cookies internally based on its configuration
	// Just mount the handler as per Better Auth documentation: https://www.better-auth.com/docs/integrations/hono
	// Include OPTIONS to handle preflight requests
	app.on(["POST", "GET", "OPTIONS"], "/api/auth/*", async (c) => {
		const { auth, accessPolicy } = getBetterAuthContext(c.env);

		// Defensive cleanup: Better Auth stores *encrypted* private keys in `jwks.privateKey`.
		// Some environments were seeded with plaintext JWK JSON, which triggers decrypt failures.
		await purgePlaintextJwks(c);

		// Handle internal access policy if enabled
		// Better Auth's trustedOrigins config handles browser access, so we only block non-browser API calls
		if (accessPolicy.enforceInternal) {
			const pathname = c.req.path;
			const isPublicJwks = pathname === "/api/auth/jwks";
			const isOptions = c.req.method === "OPTIONS";

			// JWKS must be publicly reachable
			if (isPublicJwks) {
				return handleAuthRequest(c, auth);
			}

			// OPTIONS preflight requests should be allowed through
			// Better Auth will handle CORS validation
			if (isOptions) {
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
			return response;
		}

		// Retry after clearing JWKS on decrypt error
		await clearJwksAndResetAuth(c);
		const { auth: refreshed } = getBetterAuthContext(c.env);
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
		return retryPromise;
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
		const { auth: refreshed } = getBetterAuthContext(c.env);
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
		return retryPromise;
	}
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
