import { Prisma, type PrismaClient } from "@prisma/client";
import {
	generateRandomReferralCodeString,
	isValidReferralCodeFormat,
	MAX_CODE_GEN_ATTEMPTS,
	normalizeReferralCode,
	newEntityId,
} from "./code";

const NEW_USER_ATTRIBUTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ReferralAttributionErrorCode =
	| "INVALID_CODE"
	| "SELF_REFERRAL"
	| "ALREADY_ATTRIBUTED"
	| "USER_TOO_OLD"
	| "NOT_FOUND";

export type MyReferralSummary = {
	code: string | null;
	shareUrl: string | null;
	successfulReferrals: number;
	recentConversions: Array<{
		maskedEmail: string;
		convertedAt: string;
		conversionType: "subscription" | "license";
	}>;
};

function maskEmail(email: string): string {
	const at = email.indexOf("@");
	if (at < 0) {
		return "•••@•••";
	}
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);
	if (local.length === 0) {
		return `***@${domain}`;
	}
	return `${local[0]!}***@${domain}`;
}

/**
 * Resolves a public base URL for share links (auth app, no trailing slash).
 */
export function resolveAuthFrontendBaseUrl(
	env:
		| { AUTH_FRONTEND_URL?: string; BETTER_AUTH_URL?: string }
		| null
		| undefined,
): string {
	const raw =
		env?.AUTH_FRONTEND_URL?.trim() || env?.BETTER_AUTH_URL?.trim() || "";
	if (raw) {
		return raw.replace(/\/$/, "");
	}
	return "http://localhost:3000";
}

function buildShareUrl(base: string, code: string): string {
	const b = base.replace(/\/$/, "");
	return `${b}/login?ref=${encodeURIComponent(code)}`;
}

/**
 * Create or return existing active referral code for a user.
 */
export async function generateOrGetReferralCode(
	prisma: PrismaClient,
	userId: string,
): Promise<{ code: string }> {
	const existing = await prisma.referralCode.findUnique({
		where: { userId },
	});
	if (existing) {
		return { code: existing.code };
	}

	for (let attempt = 0; attempt < MAX_CODE_GEN_ATTEMPTS; attempt++) {
		const code = generateRandomReferralCodeString();
		try {
			await prisma.referralCode.create({
				data: {
					id: newEntityId(),
					userId,
					code,
				},
			});
			return { code };
		} catch (e) {
			if (
				e instanceof Prisma.PrismaClientKnownRequestError &&
				e.code === "P2002"
			) {
				continue;
			}
			throw e;
		}
	}

	throw new Error("Failed to generate unique referral code after retries");
}

/**
 * Public validate: code exists, active, and format is valid.
 */
export async function validateActiveReferralCode(
	prisma: PrismaClient,
	rawCode: string,
): Promise<{ valid: false } | { valid: true }> {
	const code = normalizeReferralCode(rawCode);
	if (!isValidReferralCodeFormat(code)) {
		return { valid: false };
	}
	const row = await prisma.referralCode.findFirst({
		where: { code, isActive: true },
	});
	return row ? { valid: true } : { valid: false };
}

export async function getMyReferralSummary(
	prisma: PrismaClient,
	userId: string,
	shareBaseUrl: string,
): Promise<MyReferralSummary> {
	const ref = await prisma.referralCode.findUnique({
		where: { userId },
	});
	if (!ref) {
		return {
			code: null,
			shareUrl: null,
			successfulReferrals: 0,
			recentConversions: [],
		};
	}

	const conversions = await prisma.referralConversion.findMany({
		where: {
			referralCodeId: ref.id,
			convertedAt: { not: null },
		},
		orderBy: { convertedAt: "desc" },
		take: 20,
		include: {
			referredUser: { select: { email: true } },
		},
	});

	const base = shareBaseUrl.replace(/\/$/, "");
	const shareUrl = buildShareUrl(base, ref.code);

	return {
		code: ref.code,
		shareUrl,
		successfulReferrals: ref.successfulReferrals,
		recentConversions: conversions
			.filter(
				(c) =>
					c.convertedAt &&
					(c.conversionType === "subscription" ||
						c.conversionType === "license"),
			)
			.map((c) => ({
				maskedEmail: maskEmail(c.referredUser.email),
				convertedAt: c.convertedAt!.toISOString(),
				conversionType: c.conversionType as "subscription" | "license",
			})),
	};
}

export type AttributeReferralResult =
	| { success: true }
	| { success: false; code: ReferralAttributionErrorCode; message: string };

/**
 * Bind a referee to a referral code. Only for "new" accounts and one-time per user.
 */
export async function attributeReferral(
	prisma: PrismaClient,
	referrerCodeInput: string,
	referredUserId: string,
	referredUserCreatedAt: Date,
): Promise<AttributeReferralResult> {
	const codeNorm = normalizeReferralCode(referrerCodeInput);
	if (!isValidReferralCodeFormat(codeNorm)) {
		return {
			success: false,
			code: "INVALID_CODE",
			message: "Invalid referral code format",
		};
	}

	const age = Date.now() - referredUserCreatedAt.getTime();
	if (age > NEW_USER_ATTRIBUTION_MAX_AGE_MS) {
		return {
			success: false,
			code: "USER_TOO_OLD",
			message: "Referral attribution is only for new accounts",
		};
	}

	const existingRef = await prisma.referralConversion.findUnique({
		where: { referredUserId },
	});
	if (existingRef) {
		return {
			success: false,
			code: "ALREADY_ATTRIBUTED",
			message: "A referral is already associated with this account",
		};
	}

	const refRow = await prisma.referralCode.findFirst({
		where: { code: codeNorm, isActive: true },
	});
	if (!refRow) {
		return {
			success: false,
			code: "NOT_FOUND",
			message: "Unknown or inactive referral code",
		};
	}
	if (refRow.userId === referredUserId) {
		return {
			success: false,
			code: "SELF_REFERRAL",
			message: "You cannot use your own referral code",
		};
	}

	await prisma.referralConversion.create({
		data: {
			id: newEntityId(),
			referralCodeId: refRow.id,
			referredUserId,
		},
	});

	return { success: true };
}

export type ConversionType = "subscription" | "license";

/**
 * On first successful conversion (subscription first invoice or license activation), increment counter.
 * Idempotent if no pending conversion or already converted.
 */
export async function markReferralConvertedIfPending(
	prisma: PrismaClient,
	referredUserId: string,
	type: ConversionType,
	conversionReference: string,
): Promise<{ converted: boolean }> {
	const pending = await prisma.referralConversion.findFirst({
		where: {
			referredUserId,
			convertedAt: null,
		},
	});

	if (!pending) {
		return { converted: false };
	}

	const invoker = async (tx: Prisma.TransactionClient) => {
		const fresh = await tx.referralConversion.findUnique({
			where: { id: pending.id },
		});
		if (!fresh || fresh.convertedAt) {
			return;
		}
		await tx.referralConversion.update({
			where: { id: pending.id },
			data: {
				convertedAt: new Date(),
				conversionType: type,
				conversionReference,
			},
		});
		await tx.referralCode.update({
			where: { id: fresh.referralCodeId },
			data: { successfulReferrals: { increment: 1 } },
		});
	};

	await prisma.$transaction(invoker);

	return { converted: true };
}
