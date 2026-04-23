import { describe, it, expect } from "vitest";
import {
	generateRandomReferralCodeString,
	isValidReferralCodeFormat,
	normalizeReferralCode,
} from "../../src/domain/referrals/code";

describe("referral code format", () => {
	it("normalizes to uppercase and validates 8 good chars", () => {
		const raw = "  01ab8d9h  ";
		const n = normalizeReferralCode(raw);
		expect(n).toBe("01AB8D9H");
		expect(isValidReferralCodeFormat(n)).toBe(true);
	});

	it("rejects I L O U and wrong length", () => {
		expect(isValidReferralCodeFormat("ABCDEFGH")).toBe(true);
		expect(isValidReferralCodeFormat("IJKLMNOP")).toBe(false);
		expect(isValidReferralCodeFormat("ABCDEFG")).toBe(false);
		expect(isValidReferralCodeFormat("")).toBe(false);
	});

	it("generateRandomReferralCodeString produces 8 valid chars (many draws)", () => {
		for (let i = 0; i < 50; i++) {
			const c = generateRandomReferralCodeString();
			expect(c).toHaveLength(8);
			expect(isValidReferralCodeFormat(c)).toBe(true);
		}
	});
});
