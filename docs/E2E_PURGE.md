# E2E purge API (`auth-svc`)

## Endpoint

`POST /api/admin/e2e/purge`

- **Auth**: header `x-e2e-api-key` must equal worker secret `E2E_API_KEY`.
- **Body**: optional JSON `{}` (ignored). Orgas and users are discovered server-side.

## Behavior

1. Load all users with email ending `@e2e.janovix.com`.
2. Collect their `organizationId`s from `members`.
3. Keep only orgs where **every** member’s email ends with `@e2e.janovix.com` (never purge mixed orgs).
4. **Fan-out** `POST {AML_SVC_URL|WATCHLIST_SVC_URL|DOC_SVC_URL}/api/v1/internal/e2e/purge` with JSON `{ "organizationIds": [...] }` and the same `x-e2e-api-key`. Failures are appended to `errors[]` but other steps continue.
5. Delete tenant-scoped rows in auth DB (webhooks, usage, org settings, etc.), then organizations.
6. If `STRIPE_SECRET_KEY` is set: cancel Stripe subscriptions tied to those users, delete local subscription rows.
7. Delete `userOverageSettings`, `userSettings`, `enterpriseLicense`, then users.

Response shape: `{ purgedUsers, purgedOrgs, cancelledSubs, errors: string[] }`.

## Wrangler / secrets

Set in the worker environment:

- `E2E_API_KEY` — shared with aml-svc, watchlist-svc, doc-svc internal routes and smoke-tests `cleanup:prod`.
- `AML_SVC_URL`, `WATCHLIST_SVC_URL`, `DOC_SVC_URL` — base URLs **without** trailing path (e.g. `https://aml-svc.janovix.com`).

Production: `wrangler secret put E2E_API_KEY` (and ensure URL vars match deployed workers).

## Runbook

- **Weekly**: GitHub Action in `smoke-tests` repo runs `pnpm cleanup:prod` against production `AUTH_URL`.
- **Manual**: same script from a trusted machine with `E2E_API_KEY` and `AUTH_URL=https://auth.janovix.com`.
