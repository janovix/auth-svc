/**
 * Dedicated JWKS endpoint handler.
 *
 * This handler bypasses Better Auth's full request pipeline entirely,
 * avoiding the rate limiting KV operations and Prisma/D1 query that
 * the built-in `/api/auth/jwks` endpoint performs on every request.
 *
 * Why this matters:
 * Better Auth's JWKS endpoint runs through:
 *   1. Rate limiting: KV get + KV set (on every request, including GETs)
 *   2. Prisma adapter: D1 query via `findMany({ model: "jwks" })`
 *
 * When a concurrent session operation (cookie cache refresh, session update,
 * org-auto-select hook) makes D1 momentarily slow, the JWKS request gets
 * caught in the same slowdown and hits the 25-second timeout.
 *
 * This handler is immune to those slowdowns:
 *   - Primary path: reads pre-built JWKS JSON from KV (< 5ms, zero D1 load)
 *   - Fallback path: direct D1 SQL, bypassing Prisma entirely
 *
 * KV cache invalidation: clearJwksAndResetAuth() in auth/routes.ts deletes
 * the KV key whenever JWKS are rotated or regenerated.
 */

import type { Context } from "hono";
import * as Sentry from "@sentry/cloudflare";
import type { Bindings } from "../types/bindings";
import {
	JWKS_KV_CACHE_KEY,
	JWKS_KV_TTL_SECONDS,
	buildJwks,
	type JwksRow,
} from "../utils/jwks";

export { JWKS_KV_CACHE_KEY };

/**
 * Hono handler for GET /api/auth/jwks.
 *
 * Register this BEFORE registerBetterAuthRoutes() in app.ts so that Hono's
 * router matches the static route first and never enters Better Auth's
 * pipeline for this path.
 */
export async function handleJwks(
	c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
	const headers = {
		"Content-Type": "application/json",
		"Cache-Control": "public, max-age=3600, s-maxage=86400",
		"Access-Control-Allow-Origin": "*",
	};

	// --- Primary path: KV cache ---
	try {
		const cached = await c.env.KV.get(JWKS_KV_CACHE_KEY);
		if (cached) {
			return new Response(cached, { headers });
		}
	} catch (err) {
		// KV read failure is non-fatal; fall through to D1
		Sentry.captureException(err, {
			tags: { context: "jwks-kv-read" },
		});
	}

	// --- Fallback path: direct D1 query (bypasses Prisma) ---
	try {
		const result = await c.env.DB.prepare(
			"SELECT id, publicKey, alg, crv, expiresAt FROM jwks",
		).all<JwksRow>();

		const rows = result.results ?? [];

		if (rows.length === 0) {
			// No keys in DB yet. Better Auth creates keys lazily on the first
			// /api/auth/token request. Return an empty set so consumers can
			// handle it gracefully rather than getting a 504.
			return new Response(JSON.stringify({ keys: [] }), { headers });
		}

		const jwks = buildJwks(rows);
		const jwksJson = JSON.stringify(jwks);

		// Populate KV cache asynchronously so subsequent requests hit the fast path.
		c.executionCtx?.waitUntil?.(
			c.env.KV.put(JWKS_KV_CACHE_KEY, jwksJson, {
				expirationTtl: JWKS_KV_TTL_SECONDS,
			}).catch((err) => {
				Sentry.captureException(err, {
					tags: { context: "jwks-kv-write" },
				});
			}),
		);

		return new Response(jwksJson, { headers });
	} catch (err) {
		Sentry.captureException(err, {
			tags: { context: "jwks-d1-read" },
		});

		return new Response(
			JSON.stringify({
				success: false,
				error: "Service Unavailable",
				message: "Failed to load JWKS",
			}),
			{ status: 503, headers: { "Content-Type": "application/json" } },
		);
	}
}
