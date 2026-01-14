import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { buildResolvedAuthConfig } from "./config";
import { setCurrentExecutionContext } from "./execution-context";
import type { Bindings } from "../types/bindings";
import { createKVSecondaryStorage } from "../utils/kv-storage";

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

function createPrismaClient(db: D1Database) {
	const adapter = new PrismaD1(db);
	return new PrismaClient({ adapter });
}

export function invalidateBetterAuthCache(env: Bindings) {
	const resolved = buildResolvedAuthConfig(env);
	authCache.delete(resolved.cacheKey);
}

/**
 * Gets Better Auth context for handling requests.
 *
 * We cache the full auth instance to preserve internal state, but store
 * the execution context in a request-scoped variable that callbacks can
 * access via getCurrentExecutionContext().
 */
export function getBetterAuthContext(
	env: Bindings,
	executionContext?: ExecutionContext,
) {
	// Store execution context for this request (callbacks will access it dynamically)
	setCurrentExecutionContext(executionContext);

	const resolved = buildResolvedAuthConfig(env, executionContext);
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
