export type JanovixEnvironment =
	| "local"
	| "preview"
	| "dev"
	| "qa"
	| "production"
	| "test";

export type Bindings = Env & {
	/**
	 * KV namespace for secondary storage (sessions, rate limiting).
	 * Provides faster access than D1 for high-frequency operations.
	 */
	KV: KVNamespace;

	/**
	 * Cloudflare Worker version metadata.
	 * Used for Sentry release tracking.
	 */
	CF_VERSION_METADATA: WorkerVersionMetadata;

	/**
	 * Environment identifier (local, dev, qa, production, preview, test)
	 */
	ENVIRONMENT?: JanovixEnvironment | string;
	/**
	 * Secret used by Better Auth to sign tokens and encrypt sensitive data.
	 * Must be configured per environment via Wrangler secrets.
	 */
	BETTER_AUTH_SECRET?: string;
	/**
	 * Absolute public URL of this auth-core deployment (scheme + host),
	 * used by Better Auth as `baseURL` for correct issuer/audience URLs.
	 *
	 * Example: `https://core-template.algtools.algenium.dev`
	 */
	BETTER_AUTH_URL?: string;
	/**
	 * Shared secret header that internal consumers must send when calling
	 * auth-core's Better Auth endpoints.
	 */
	AUTH_INTERNAL_TOKEN?: string;
	/**
	 * Optional override for the cookie domain Better Auth should use when
	 * cross-subdomain cookies are enabled. Example: `.algenium.app`.
	 */
	AUTH_COOKIE_DOMAIN?: string;
	/**
	 * Comma separated list of additional trusted origins that should be appended
	 * to the environment defaults. Accepts wildcard patterns such as
	 * `https://*.client.com`.
	 */
	AUTH_TRUSTED_ORIGINS?: string;
	/**
	 * Mandrill API key for sending transactional emails.
	 * Configured via Cloudflare Dashboard secrets.
	 */
	MANDRILL_API_KEY?: string;
	/**
	 * Frontend application URL for password reset and other auth flows.
	 * Used to construct URLs in emails (e.g., password reset link).
	 * Example: `https://auth.janovix.workers.dev`
	 */
	AUTH_FRONTEND_URL?: string;
	/**
	 * Cloudflare Turnstile secret key for bot protection.
	 * Used to verify Turnstile tokens on password reset requests.
	 * Configured via Cloudflare Dashboard secrets.
	 */
	TURNSTILE_SECRET_KEY?: string;
	/**
	 * AML Frontend application URL for organization-related flows.
	 * Used to construct invitation acceptance URLs.
	 * Example: `https://aml.janovix.workers.dev`
	 */
	AML_FRONTEND_URL?: string;
	/**
	 * Sentry DSN for error tracking.
	 * If not set, Sentry will be disabled.
	 * Configured via Cloudflare Dashboard secrets or wrangler vars.
	 */
	SENTRY_DSN?: string;
	/**
	 * Service binding to aml-svc for worker-to-worker communication.
	 * Used to proxy AML compliance settings requests securely.
	 */
	AML_SERVICE?: Fetcher;

	// =========================================================================
	// STRIPE BILLING
	// =========================================================================

	/**
	 * Stripe secret key for server-side API calls.
	 * Configured via Cloudflare Dashboard secrets.
	 */
	STRIPE_SECRET_KEY?: string;

	/**
	 * Stripe publishable key for client-side use.
	 * Can be public, configured via wrangler vars.
	 */
	STRIPE_PUBLISHABLE_KEY?: string;

	/**
	 * Stripe webhook signing secret for verifying webhook events.
	 * Configured via Cloudflare Dashboard secrets.
	 */
	STRIPE_WEBHOOK_SECRET?: string;

	// =========================================================================
	// ENTERPRISE LICENSING
	// =========================================================================

	/**
	 * Ed25519 private key for signing enterprise license JWTs.
	 * Configured via Cloudflare Dashboard secrets.
	 * PEM format with headers.
	 */
	LICENSE_PRIVATE_KEY?: string;

	/**
	 * Ed25519 public key for verifying enterprise license JWTs.
	 * Can be public, used by other services for offline verification.
	 * PEM format with headers.
	 */
	LICENSE_PUBLIC_KEY?: string;

	// =========================================================================
	// R2 STORAGE
	// =========================================================================

	/**
	 * R2 bucket for storing user avatar images.
	 * Used for onboarding and profile avatar uploads.
	 */
	AVATARS_BUCKET?: R2Bucket;

	/**
	 * Public URL prefix for accessing avatar images.
	 * Example: `https://avatars.janovix.com` or `https://pub-xxx.r2.dev`
	 */
	AVATARS_PUBLIC_URL?: string;
};
