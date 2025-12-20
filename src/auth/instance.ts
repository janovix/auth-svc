import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { buildResolvedAuthConfig } from "./config";
import type { Bindings } from "../types/bindings";

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

export function getBetterAuthContext(
	env: Bindings,
	executionContext?: ExecutionContext,
) {
	const resolved = buildResolvedAuthConfig(env, executionContext);
	const cached = authCache.get(resolved.cacheKey);

	if (cached) {
		return {
			auth: cached.auth,
			accessPolicy: resolved.accessPolicy,
		};
	}

	const prisma = createPrismaClient(env.DB);
	const auth = betterAuth({
		...resolved.options,
		database: prismaAdapter(prisma, { provider: "sqlite", transaction: false }),
	});

	authCache.set(resolved.cacheKey, { auth });

	return {
		auth,
		accessPolicy: resolved.accessPolicy,
	};
}
