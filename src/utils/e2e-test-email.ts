/**
 * E2E automation uses @e2e.janovix.com addresses with a fixed OTP (see emailOTP generateOTP).
 * Janovix controls this subdomain; do not use for real users.
 */
export const E2E_EMAIL_SUFFIX = "@e2e.janovix.com";

export function isE2eTestEmail(email: string | undefined | null): boolean {
	if (!email) {
		return false;
	}
	return email.trim().toLowerCase().endsWith(E2E_EMAIL_SUFFIX);
}
