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
 * Throws error if database configuration is incomplete
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

	// Validate all required price IDs are present
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

	// Cache the price IDs
	cachedPriceIds = priceIds;
	priceIdsCacheTime = now;

	return priceIds;
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
 * @returns Auth context with cleanup function for execution context
 */
export async function getBetterAuthContext(
	env: Bindings,
	executionContext?: ExecutionContext,
): Promise<{
	auth: ReturnType<typeof betterAuth>;
	accessPolicy: { enforceInternal: boolean; token?: string };
	cleanup: () => void;
}> {
	// Store execution context for this request (callbacks will access it dynamically)
	// CRITICAL: This must be called before any auth operations that trigger callbacks
	// (like email OTP sending) to ensure waitUntil() works in Cloudflare Workers.
	// The cleanup function should be called when the request completes.
	const cleanup = setCurrentExecutionContext(executionContext);

	// Fetch prices from database (with caching) - use timeout to prevent hanging
	let stripePriceIds: StripePriceIds | undefined;
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
		// Continue without price IDs - Better Auth Stripe plugin won't load
	}

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
			cleanup,
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
		cleanup,
	};
}
