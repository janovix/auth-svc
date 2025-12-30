/**
 * Cloudflare Turnstile verification utility.
 *
 * Verifies Turnstile tokens to protect against bots.
 * See: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const TURNSTILE_VERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
	success: boolean;
	/** ISO timestamp of the challenge */
	challenge_ts?: string;
	/** Hostname for which the challenge was served */
	hostname?: string;
	/** List of error codes if verification failed */
	"error-codes"?: string[];
	/** Action configured for this widget */
	action?: string;
	/** Custom data passed to the widget */
	cdata?: string;
}

export interface TurnstileVerifyOptions {
	/** The Turnstile secret key */
	secretKey: string;
	/** The Turnstile token from the client */
	token: string;
	/** Optional: The user's IP address */
	remoteIp?: string;
}

/**
 * Verifies a Turnstile token with Cloudflare's API.
 *
 * @returns TurnstileVerifyResult with success status and error codes
 */
export async function verifyTurnstileToken(
	options: TurnstileVerifyOptions,
): Promise<TurnstileVerifyResult> {
	const { secretKey, token, remoteIp } = options;

	const formData = new FormData();
	formData.append("secret", secretKey);
	formData.append("response", token);

	if (remoteIp) {
		formData.append("remoteip", remoteIp);
	}

	try {
		const response = await fetch(TURNSTILE_VERIFY_URL, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			return {
				success: false,
				"error-codes": ["server-error"],
			};
		}

		const result = (await response.json()) as TurnstileVerifyResult;
		return result;
	} catch (error) {
		console.error("[Turnstile] Verification failed:", error);
		return {
			success: false,
			"error-codes": ["network-error"],
		};
	}
}

/**
 * Gets the client IP from common headers.
 * Cloudflare Workers have access to CF-Connecting-IP header.
 */
export function getClientIp(request: Request): string | undefined {
	return (
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
		request.headers.get("X-Real-IP") ||
		undefined
	);
}
