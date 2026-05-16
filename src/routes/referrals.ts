/**
 * User referral program: opt-in code generation, attribution, validation.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";
import { getPrismaForD1 } from "../lib/prisma-d1";
import {
	attributeReferral,
	generateOrGetReferralCode,
	getMyReferralSummary,
	validateActiveReferralCode,
	resolveAuthFrontendBaseUrl,
} from "../domain/referrals";

type Ctx = Context<{ Bindings: Bindings }>;
const referralRoutes = new Hono<{ Bindings: Bindings }>();

async function getSessionUserId(c: Ctx): Promise<string | null> {
	const { auth } = await getBetterAuthContext(c.env);
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});
	return session?.user?.id ?? null;
}

const attributeBody = z.object({
	code: z.string().min(1).max(32),
});

/**
 * GET /api/referrals/validate?code=XXXXX
 * Public: whether code is well-formed and active.
 */
referralRoutes.get("/validate", async (c) => {
	const raw = c.req.query("code");
	if (raw == null || raw.length === 0) {
		return c.json(
			{
				success: false,
				error: { code: "VALIDATION", message: "code required" },
			},
			400,
		);
	}
	const prisma = getPrismaForD1(c.env.DB);
	const result = await validateActiveReferralCode(prisma, raw);
	return c.json({ success: true, data: { valid: result.valid } });
});

/**
 * GET /api/referrals/me
 * Authenticated: current code, share URL, count, recent conversions.
 */
referralRoutes.get("/me", async (c) => {
	const userId = await getSessionUserId(c);
	if (!userId) {
		return c.json(
			{
				success: false,
				error: { code: "UNAUTHORIZED", message: "Unauthorized" },
			},
			401,
		);
	}
	const prisma = getPrismaForD1(c.env.DB);
	const base = resolveAuthFrontendBaseUrl(c.env);
	const summary = await getMyReferralSummary(prisma, userId, base);
	return c.json({ success: true, data: summary });
});

/**
 * POST /api/referrals/generate
 * Idempotent: creates code on first use.
 */
referralRoutes.post("/generate", async (c) => {
	const userId = await getSessionUserId(c);
	if (!userId) {
		return c.json(
			{
				success: false,
				error: { code: "UNAUTHORIZED", message: "Unauthorized" },
			},
			401,
		);
	}
	const prisma = getPrismaForD1(c.env.DB);
	const { code } = await generateOrGetReferralCode(prisma, userId);
	const base = resolveAuthFrontendBaseUrl(c.env);
	const b = base.replace(/\/$/, "");
	const shareUrl = `${b}/login?ref=${encodeURIComponent(code)}`;
	return c.json({ success: true, data: { code, shareUrl } });
});

/**
 * POST /api/referrals/attribute
 * Authenticated: bind referee to a referrer's code.
 */
referralRoutes.post("/attribute", async (c) => {
	const userId = await getSessionUserId(c);
	if (!userId) {
		return c.json(
			{
				success: false,
				error: { code: "UNAUTHORIZED", message: "Unauthorized" },
			},
			401,
		);
	}

	const json = await c.req.json().catch(() => ({}));
	const parsed = attributeBody.safeParse(json);
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: {
					code: "VALIDATION",
					message: "Invalid body",
					details: parsed.error.flatten(),
				},
			},
			400,
		);
	}

	const prisma = getPrismaForD1(c.env.DB);
	const { auth } = await getBetterAuthContext(c.env);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session?.user?.id) {
		return c.json(
			{
				success: false,
				error: { code: "UNAUTHORIZED", message: "Unauthorized" },
			},
			401,
		);
	}

	// `createdAt` is required on Better Auth user; fallback for typing
	const created = session.user as { createdAt?: string | Date };
	const createdAt =
		typeof created.createdAt === "string"
			? new Date(created.createdAt)
			: created.createdAt && created.createdAt instanceof Date
				? created.createdAt
				: new Date(0);

	const res = await attributeReferral(
		prisma,
		parsed.data.code,
		userId,
		createdAt,
	);
	if (!res.success) {
		const notFound = res.code === "NOT_FOUND";
		const status = notFound ? 404 : 400;
		return c.json(
			{
				success: false,
				error: {
					code: res.code,
					message: res.message,
				},
			},
			status,
		);
	}
	return c.json({ success: true, data: { attributed: true } });
});

export { referralRoutes };
