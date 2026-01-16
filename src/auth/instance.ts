import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { buildResolvedAuthConfig, type StripePriceIds } from "./config";
import { setCurrentExecutionContext } from "./execution-context";
import type { Bindings } from "../types/bindings";
import { createKVSecondaryStorage } from "../utils/kv-storage";
import { PricingRepository, PricingService } from "../domain/pricing";

/**
 * Cache for Better Auth instances.
 * We cache the full auth instance to preserve internal state needed for
 * redirect handling, session management, etc.
 *
 * NOTE: We use a WeakMap keyed by the DB instance to ensure that when
 * the DB binding changes (new request context), we create a fresh instance.
 * This helps avoid stale connection issues in Cloudflare Workers.
 */
const authCacheByDb = new WeakMap<
	D1Database,
	Map<string, { auth: ReturnType<typeof betterAuth> }>
>();

// Cache for Stripe price IDs fetched from database
let cachedPriceIds: StripePriceIds | null = null;
let priceIdsCacheTime = 0;
const PRICE_IDS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function createPrismaClient(db: D1Database) {
	const adapter = new PrismaD1(db);
	return new PrismaClient({ adapter });
}

/**
 * Fetch Stripe price IDs from the database
 * Falls back to env vars if database fetch fails
 */
async function fetchStripePriceIds(env: Bindings): Promise<StripePriceIds> {
	// Return cached prices if still valid
	const now = Date.now();
	if (cachedPriceIds && now - priceIdsCacheTime < PRICE_IDS_CACHE_TTL) {
		return cachedPriceIds;
	}

	try {
		const pricingRepository = new PricingRepository(env.DB);
		const pricingService = new PricingService(pricingRepository);
		const priceMap = await pricingService.getAllSubscriptionPrices();

		const priceIds: StripePriceIds = {
			watchlist:
				priceMap.get("watchlist") ||
				env.STRIPE_WATCHLIST_PRICE_ID ||
				"price_watchlist",
			business:
				priceMap.get("business") ||
				env.STRIPE_BUSINESS_PRICE_ID ||
				"price_aml_business",
			pro: priceMap.get("pro") || env.STRIPE_PRO_PRICE_ID || "price_aml_pro",
			ultra:
				priceMap.get("ultra") || env.STRIPE_ULTRA_PRICE_ID || "price_aml_ultra",
		};

		console.log("[Auth] Loaded Stripe price IDs from database:", priceIds);

		// Cache the price IDs
		cachedPriceIds = priceIds;
		priceIdsCacheTime = now;

		return priceIds;
	} catch (error) {
		console.warn(
			"[Auth] Failed to fetch price IDs from database, using env vars:",
			error,
		);
		// Fall back to env vars
		return {
			watchlist: env.STRIPE_WATCHLIST_PRICE_ID || "price_watchlist",
			business: env.STRIPE_BUSINESS_PRICE_ID || "price_aml_business",
			pro: env.STRIPE_PRO_PRICE_ID || "price_aml_pro",
			ultra: env.STRIPE_ULTRA_PRICE_ID || "price_aml_ultra",
		};
	}
}

export function invalidateBetterAuthCache(env: Bindings) {
	const resolved = buildResolvedAuthConfig(env);
	// Get the cache for this DB instance
	const dbCache = authCacheByDb.get(env.DB);
	if (dbCache) {
		dbCache.delete(resolved.cacheKey);
	}
	// Also invalidate price cache
	cachedPriceIds = null;
}

/**
 * Get Better Auth context for handling requests.
 *
 * This function uses a WeakMap keyed by D1Database instance to cache auth
 * instances. This ensures that:
 * 1. Within the same Worker isolate with the same DB binding, we reuse the instance
 * 2. When a new request comes with a potentially different DB context, we detect it
 *
 * This approach balances performance (caching) with reliability (fresh connections
 * when needed) in Cloudflare Workers.
 *
 * @param env - Cloudflare Worker bindings
 * @param executionContext - Optional execution context for waitUntil support
 */
export async function getBetterAuthContext(
	env: Bindings,
	executionContext?: ExecutionContext,
) {
	// Store execution context for this request (callbacks will access it dynamically)
	// CRITICAL: This must be called before any auth operations that trigger callbacks
	// (like email OTP sending) to ensure waitUntil() works in Cloudflare Workers.
	setCurrentExecutionContext(executionContext);

	// Fetch prices from database (with caching)
	const stripePriceIds = await fetchStripePriceIds(env);

	const resolved = buildResolvedAuthConfig(
		env,
		executionContext,
		stripePriceIds,
	);

	// Get or create cache for this specific DB instance
	let dbCache = authCacheByDb.get(env.DB);
	if (!dbCache) {
		dbCache = new Map();
		authCacheByDb.set(env.DB, dbCache);
	}

	const cached = dbCache.get(resolved.cacheKey);
	if (cached) {
		return {
			auth: cached.auth,
			accessPolicy: resolved.accessPolicy,
		};
	}

	const prisma = createPrismaClient(env.DB);
	const secondaryStorage = createKVSecondaryStorage(env.KV);

	const auth = betterAuth({
		...resolved.options,
		database: prismaAdapter(prisma, { provider: "sqlite", transaction: false }),
		secondaryStorage,
	});

	dbCache.set(resolved.cacheKey, { auth });

	return {
		auth,
		accessPolicy: resolved.accessPolicy,
	};
}
