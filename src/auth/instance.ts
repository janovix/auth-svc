import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import * as Sentry from "@sentry/cloudflare";

import { buildResolvedAuthConfig, type StripePriceIds } from "./config";
import type { Bindings } from "../types/bindings";
import { getPrismaForD1 } from "../lib/prisma-d1";
import { createKVSecondaryStorage } from "../utils/kv-storage";
import { PricingRepository, PricingService } from "../domain/pricing";

/**
 * Module-level cache for Better Auth instances, keyed by resolved config hash.
 *
 * Root cause of infinite hangs (fixed here):
 * Cloudflare Workers give each request invocation a fresh `env` object, so
 * `env.DB` is a NEW proxy object on every request. A WeakMap keyed by `env.DB`
 * therefore NEVER produces a cache hit — every request created a brand-new
 * `betterAuth()` + `PrismaClient` and triggered a lazy JWKS D1 read/write on
 * the first `auth.handler()` call. When concurrent requests arrived, multiple
 * instances simultaneously tried to INSERT JWKS into D1. D1 is SQLite with a
 * single-writer lock; the second INSERT waited for the lock indefinitely because
 * `@prisma/adapter-d1` has no query timeout — causing the infinite "pending" hang.
 *
 * Fix: module-level `Map` keyed by the stable config hash (`cacheKey`).
 * Module-level state persists across requests within the same Worker isolate.
 * The D1 binding is a stateless HTTP proxy; there are no persistent connections
 * to go stale between requests.
 *
 * The cache differentiates between instances with and without the Stripe plugin
 * to prevent a non-Stripe instance from handling subscription endpoints.
 */
const authCache = new Map<string, { auth: ReturnType<typeof betterAuth> }>();

// Cache for Stripe price IDs fetched from database
let cachedPriceIds: StripePriceIds | null = null;
let priceIdsCacheTime = 0;
const PRICE_IDS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch Stripe price IDs from the database.
 * Throws if required price configuration is missing.
 */
async function fetchStripePriceIds(env: Bindings): Promise<StripePriceIds> {
	const now = Date.now();
	if (cachedPriceIds && now - priceIdsCacheTime < PRICE_IDS_CACHE_TTL) {
		return cachedPriceIds;
	}

	const pricingRepository = new PricingRepository(env.DB);
	const pricingService = new PricingService(pricingRepository);
	const priceMap = await pricingService.getAllSubscriptionPrices();

	const missingPlans: string[] = [];
	const requiredPlans = ["watchlist", "business", "pro", "ultra"];

	for (const plan of requiredPlans) {
		if (!priceMap.has(plan)) {
			missingPlans.push(plan);
		}
	}

	if (missingPlans.length > 0) {
		throw new Error(
			`Missing required Stripe price configuration in database for plans: ${missingPlans.join(", ")}. ` +
				`Expected price types: subscription, seat, overage_alert, overage_operation. ` +
				`Please run seed script or configure via admin panel.`,
		);
	}

	const priceIds: StripePriceIds = {
		watchlist: priceMap.get("watchlist")!,
		business: priceMap.get("business")!,
		pro: priceMap.get("pro")!,
		ultra: priceMap.get("ultra")!,
	};

	console.log("[Auth] Loaded Stripe price IDs from database:", priceIds);

	cachedPriceIds = priceIds;
	priceIdsCacheTime = now;

	return priceIds;
}

export function invalidateBetterAuthCache(env: Bindings) {
	const resolved = buildResolvedAuthConfig(env);
	authCache.delete(`${resolved.cacheKey}-with-stripe`);
	authCache.delete(`${resolved.cacheKey}-no-stripe`);
	// Also invalidate price cache
	cachedPriceIds = null;
}

/**
 * Returns a cached (or newly created) Better Auth instance for this Worker isolate.
 *
 * The auth instance is cached in a module-level Map keyed by the resolved config
 * hash so that JWKS initialization, Prisma setup, and plugin wiring happen at most
 * once per isolate lifetime rather than on every request.
 *
 * Stripe is only loaded for subscription endpoints — all other endpoints get a
 * lighter instance without the Stripe plugin.
 *
 * @param env      - Cloudflare Worker bindings for this request
 * @param pathname - Request pathname, used to decide whether Stripe is needed
 */
export async function getBetterAuthContext(
	env: Bindings,
	pathname?: string,
): Promise<{
	auth: ReturnType<typeof betterAuth>;
	accessPolicy: { enforceInternal: boolean; token?: string };
}> {
	const needsStripe = pathname?.startsWith("/api/auth/subscription/");

	let stripePriceIds: StripePriceIds | undefined;

	if (needsStripe) {
		try {
			stripePriceIds = await Promise.race([
				fetchStripePriceIds(env),
				new Promise<StripePriceIds>((_, reject) =>
					setTimeout(() => reject(new Error("Price fetch timeout")), 5000),
				),
			]);
		} catch (error) {
			console.error(
				"[Auth] Failed to fetch price IDs from database. Stripe billing will not be available:",
				error,
			);
			Sentry.captureException(error, {
				tags: { context: "stripe-price-fetch-timeout" },
				extra: { pathname },
			});
		}
	}

	const resolved = buildResolvedAuthConfig(env, undefined, stripePriceIds);

	// Differentiate cache key by Stripe presence so subscription endpoints
	// always get an instance with the Stripe plugin loaded.
	const cacheKey = stripePriceIds
		? `${resolved.cacheKey}-with-stripe`
		: `${resolved.cacheKey}-no-stripe`;

	const cached = authCache.get(cacheKey);
	if (cached) {
		return {
			auth: cached.auth,
			accessPolicy: resolved.accessPolicy,
		};
	}

	const prisma = getPrismaForD1(env.DB);
	const secondaryStorage = createKVSecondaryStorage(env.KV);

	const auth = betterAuth({
		...resolved.options,
		database: prismaAdapter(prisma, { provider: "sqlite", transaction: false }),
		secondaryStorage,
	});

	authCache.set(cacheKey, { auth });

	return {
		auth,
		accessPolicy: resolved.accessPolicy,
	};
}
