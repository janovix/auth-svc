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
 */
const authCache = new Map<
	string,
	{
		auth: ReturnType<typeof betterAuth>;
	}
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
	authCache.delete(resolved.cacheKey);
	// Also invalidate price cache
	cachedPriceIds = null;
}

/**
 * Get Better Auth context for handling requests.
 *
 * This function:
 * 1. Sets the execution context for background tasks (email sending, Stripe sync)
 * 2. Fetches Stripe price IDs from database (with 5-min caching)
 * 3. Returns cached or creates new Better Auth instance
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
	const cached = authCache.get(resolved.cacheKey);

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

	authCache.set(resolved.cacheKey, { auth });

	return {
		auth,
		accessPolicy: resolved.accessPolicy,
	};
}
