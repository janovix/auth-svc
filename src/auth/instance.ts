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
 * Throws an error if database fetch fails - D1 is the single source of truth
 */
async function fetchStripePriceIds(env: Bindings): Promise<StripePriceIds> {
	// Return cached prices if still valid
	const now = Date.now();
	if (cachedPriceIds && now - priceIdsCacheTime < PRICE_IDS_CACHE_TTL) {
		return cachedPriceIds;
	}

	const pricingRepository = new PricingRepository(env.DB);
	const pricingService = new PricingService(pricingRepository);
	const priceMap = await pricingService.getAllSubscriptionPrices();

	// Validate that all required plans have prices
	const watchlist = priceMap.get("watchlist");
	const business = priceMap.get("business");
	const pro = priceMap.get("pro");
	const ultra = priceMap.get("ultra");

	const missingPlans: string[] = [];
	if (!watchlist) missingPlans.push("watchlist");
	if (!business) missingPlans.push("business");
	if (!pro) missingPlans.push("pro");
	if (!ultra) missingPlans.push("ultra");

	if (missingPlans.length > 0) {
		throw new Error(
			`Failed to load Stripe pricing from database. Missing prices for plans: ${missingPlans.join(", ")}. ` +
				`Ensure plans are seeded via 'pnpm seed:plans'.`,
		);
	}

	const priceIds: StripePriceIds = {
		watchlist: watchlist!,
		business: business!,
		pro: pro!,
		ultra: ultra!,
	};

	console.log("[Auth] Loaded Stripe price IDs from database:", priceIds);

	// Cache the price IDs
	cachedPriceIds = priceIds;
	priceIdsCacheTime = now;

	return priceIds;
}

export function invalidateBetterAuthCache(env: Bindings) {
	// Pass dummy prices to get cache key (cache key doesn't depend on prices)
	const dummyPrices: StripePriceIds = {
		watchlist: "",
		business: "",
		pro: "",
		ultra: "",
	};
	const resolved = buildResolvedAuthConfig(env, undefined, dummyPrices);
	authCache.delete(resolved.cacheKey);
	// Also invalidate price cache
	cachedPriceIds = null;
}

/**
 * Set cached price IDs for testing purposes only
 * @internal
 */
export function _setCachedPriceIdsForTesting(
	priceIds: StripePriceIds | null,
): void {
	cachedPriceIds = priceIds;
	priceIdsCacheTime = priceIds ? Date.now() : 0;
}

/**
 * Get Better Auth context - async version that fetches prices from database
 */
export async function getBetterAuthContextAsync(
	env: Bindings,
	executionContext?: ExecutionContext,
) {
	// Store execution context for this request (callbacks will access it dynamically)
	// This must be called before any Better Auth callbacks execute
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

/**
 * Get Better Auth context - synchronous version (uses cached prices only)
 * @deprecated Use getBetterAuthContextAsync for database-backed prices
 * @throws Error if price IDs have not been cached (call getBetterAuthContextAsync first)
 */
export function getBetterAuthContext(
	env: Bindings,
	executionContext?: ExecutionContext,
) {
	// Store execution context for this request (callbacks will access it dynamically)
	setCurrentExecutionContext(executionContext);

	// Require cached prices - no env var fallback
	if (!cachedPriceIds) {
		throw new Error(
			"Stripe price IDs not cached. Call getBetterAuthContextAsync first to load prices from database, " +
				"or ensure plans are seeded via 'pnpm seed:plans'.",
		);
	}

	const resolved = buildResolvedAuthConfig(
		env,
		executionContext,
		cachedPriceIds,
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
