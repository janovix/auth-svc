import { isE2eTestEmail } from "../utils/e2e-test-email";

const TURNSTILE_VERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Better Auth previously used the captcha plugin for these paths.
 * We verify Turnstile here so @e2e.janovix.com can skip verification for Playwright.
 */
export function isCaptchaProtectedAuthPath(pathname: string): boolean {
	return (
		pathname.endsWith("/sign-up/email") ||
		pathname.endsWith("/email-otp/send-verification-otp")
	);
}

type VerifyResult = { ok: true } | { ok: false; response: Response };

/**
 * When TURNSTILE_SECRET_KEY is unset (local), captcha is skipped (same as before).
 * When set, require x-captcha-response unless the JSON body email is @e2e.janovix.com.
 */
export async function verifyTurnstileForProtectedAuthPost(
	requestUrl: string,
	headers: Headers,
	bodyText: string,
	secretKey: string | undefined,
	e2eTurnstileBypassSecret?: string,
): Promise<VerifyResult> {
	if (!secretKey) {
		return { ok: true };
	}

	const pathname = new URL(requestUrl).pathname;
	if (!isCaptchaProtectedAuthPath(pathname)) {
		return { ok: true };
	}

	const bypassHeader = headers.get("x-e2e-turnstile-bypass");
	if (
		e2eTurnstileBypassSecret &&
		bypassHeader &&
		bypassHeader === e2eTurnstileBypassSecret
	) {
		return { ok: true };
	}

	let email: string | undefined;
	try {
		const parsed = JSON.parse(bodyText) as { email?: string };
		email = parsed.email;
	} catch {
		// Body may not be JSON; still require captcha
	}

	if (isE2eTestEmail(email)) {
		return { ok: true };
	}

	const captchaResponse = headers.get("x-captcha-response");
	if (!captchaResponse) {
		return {
			ok: false,
			response: new Response(
				JSON.stringify({
					code: "CAPTCHA_MISSING",
					message: "Missing captcha response",
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			),
		};
	}

	const remoteIp =
		headers.get("cf-connecting-ip") ??
		headers.get("x-forwarded-for")?.split(",")[0]?.trim();

	const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			secret: secretKey,
			response: captchaResponse,
			...(remoteIp ? { remoteip: remoteIp } : {}),
		}),
	});

	const verifyJson = (await verifyRes.json()) as { success?: boolean };

	if (!verifyJson.success) {
		return {
			ok: false,
			response: new Response(
				JSON.stringify({
					code: "CAPTCHA_FAILED",
					message: "Captcha verification failed",
				}),
				{ status: 403, headers: { "Content-Type": "application/json" } },
			),
		};
	}

	return { ok: true };
}

/**
 * Rebuilds a POST Request with the same URL, headers, and body text after body was read.
 */
export function rebuildPostRequest(
	original: Request,
	bodyText: string,
): Request {
	return new Request(original.url, {
		method: original.method,
		headers: original.headers,
		body: bodyText,
	});
}
