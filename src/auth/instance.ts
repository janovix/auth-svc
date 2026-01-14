import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { buildResolvedAuthConfig } from "./config";
import type { Bindings } from "../types/bindings";
import { createKVSecondaryStorage } from "../utils/kv-storage";

/**
 * Cache for static auth configuration (without execution context).
 * This caches only the parts that don't depend on per-request execution context.
 */
const staticAuthCache = new Map<
	string,
	{
		prisma: PrismaClient;
		secondaryStorage: ReturnType<typeof createKVSecondaryStorage>;
	}
>();

function createPrismaClient(db: D1Database) {
	const adapter = new PrismaD1(db);
	return new PrismaClient({ adapter });
}

export function invalidateBetterAuthCache(env: Bindings) {
	const resolved = buildResolvedAuthConfig(env);
	staticAuthCache.delete(resolved.cacheKey);
}

/**
 * Gets Better Auth context for handling requests.
 *
 * IMPORTANT: We DON'T cache the full auth instance because:
 * - Callbacks like sendVerificationOTP capture executionContext
 * - Each request gets a fresh executionContext in Cloudflare Workers
 * - Using a stale executionContext causes waitUntil() to fail silently
 *
 * We only cache the Prisma client and KV storage adapter which are safe to reuse.
 */
export function getBetterAuthContext(
	env: Bindings,
	executionContext?: ExecutionContext,
) {
	// Build full config with current execution context (for callbacks)
	const resolved = buildResolvedAuthConfig(env, executionContext);

	// Cache only safe-to-reuse parts (Prisma, KV storage)
	let cached = staticAuthCache.get(resolved.cacheKey);
	if (!cached) {
		const prisma = createPrismaClient(env.DB);
		const secondaryStorage = createKVSecondaryStorage(env.KV);
		cached = { prisma, secondaryStorage };
		staticAuthCache.set(resolved.cacheKey, cached);
	}

	// Create fresh auth instance with current execution context
	// This ensures callbacks like sendVerificationOTP use the correct waitUntil
	const auth = betterAuth({
		...resolved.options,
		database: prismaAdapter(cached.prisma, {
			provider: "sqlite",
			transaction: false,
		}),
		secondaryStorage: cached.secondaryStorage,
	});

	return {
		auth,
		accessPolicy: resolved.accessPolicy,
	};
}
