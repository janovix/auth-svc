/**
 * Crockford base32 — 8 random draws from 32 symbols (0–9, A–Z exc. I, L, O, U).
 */
const CROCKFORD_32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ" as const;

const CODE_REGEX = /^[0-9A-HJKMNP-TV-Z]{8}$/i;

const MAX_CODE_GEN_ATTEMPTS = 5;

export function normalizeReferralCode(raw: string): string {
	return raw.trim().toUpperCase();
}

export function isValidReferralCodeFormat(code: string): boolean {
	return CODE_REGEX.test(code.trim());
}

/**
 * Produces a new 8-character referral code. Not guaranteed unique; caller must retry on conflict.
 */
export function generateRandomReferralCodeString(): string {
	const buf = new Uint8Array(8);
	crypto.getRandomValues(buf);
	let s = "";
	for (let i = 0; i < 8; i++) {
		s += CROCKF32(buf[i]!);
	}
	return s;
}

function CROCKF32(byte: number): string {
	return CROCKFORD_32[byte! % 32]!;
}

export { MAX_CODE_GEN_ATTEMPTS };

export function newEntityId(): string {
	return crypto.randomUUID();
}
