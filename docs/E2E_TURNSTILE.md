# E2E Turnstile bypass (auth-svc)

Playwright can send header `x-e2e-turnstile-bypass` with a value that matches the Worker binding **`E2E_TURNSTILE_BYPASS_SECRET`** (set in the Cloudflare Dashboard for `auth-svc`, not in `wrangler.jsonc`).

When the header matches the secret on a Turnstile-protected Better Auth POST (e.g. `send-verification-otp`), verification short-circuits with success—same outcome as the existing **`@e2e.janovix.com`** email bypass, but works for any test email if the auth app also skips the widget for that header.

## Setup

1. Generate a random secret and add it as **`E2E_TURNSTILE_BYPASS_SECRET`** in Workers → auth-svc → Settings → Variables / Secrets.
2. Use the **same** value in GitHub Actions (`secrets.E2E_TURNSTILE_BYPASS_SECRET`) and in local Playwright env (`smoke-tests` / `E2E_TURNSTILE_BYPASS_SECRET`).
3. Configure the **auth** Worker with the **same** `E2E_TURNSTILE_BYPASS_SECRET` so the server layout can omit the site key when the header matches. The Turnstile **site** key for the auth app stays **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** at build time only—no duplicate dashboard site-key binding (see smoke-tests `docs/E2E.md`).

## Rotation

Update the binding on both **auth** and **auth-svc**, then update the GitHub repo secret and any local `.env` files used for E2E.

## Security

The secret must not appear in client bundles or committed config. Leaking it only weakens Turnstile on OTP-related routes; rate limits and email delivery still apply.
