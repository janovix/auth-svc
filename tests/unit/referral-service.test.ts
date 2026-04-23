import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
	attributeReferral,
	markReferralConvertedIfPending,
} from "../../src/domain/referrals/service";

describe("attributeReferral", () => {
	it("returns SELF_REFERRAL when code owner is the current user", async () => {
		const p = {
			referralConversion: {
				findUnique: vi.fn().mockResolvedValue(null),
			},
			referralCode: {
				findFirst: vi.fn().mockResolvedValue({ id: "c1", userId: "user-a" }),
			},
		} as unknown as PrismaClient;
		const r = await attributeReferral(p, "12345678", "user-a", new Date());
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(r.code).toBe("SELF_REFERRAL");
		}
	});

	it("returns ALREADY_ATTRIBUTED when a row exists for this user", async () => {
		const p = {
			referralConversion: {
				findUnique: vi
					.fn()
					.mockResolvedValue({ id: "x", referredUserId: "u1" }),
			},
		} as unknown as PrismaClient;
		const r = await attributeReferral(p, "12345678", "u1", new Date());
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(r.code).toBe("ALREADY_ATTRIBUTED");
		}
	});
});

describe("markReferralConvertedIfPending", () => {
	it("returns false when there is no pending conversion", async () => {
		const p = {
			referralConversion: {
				findFirst: vi.fn().mockResolvedValue(null),
			},
			$transaction: vi.fn(),
		} as unknown as PrismaClient;
		const r = await markReferralConvertedIfPending(
			p,
			"u99",
			"subscription",
			"in_1",
		);
		expect(r.converted).toBe(false);
		const tx = p["$transaction"] as ReturnType<typeof vi.fn>;
		expect(tx).not.toHaveBeenCalled();
	});
});
