import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

/**
 * D1-bound Prisma client. Caller must not disconnect in request hot path.
 */
export function getPrismaForD1(db: D1Database): PrismaClient {
	return new PrismaClient({
		adapter: new PrismaD1(db),
	});
}
