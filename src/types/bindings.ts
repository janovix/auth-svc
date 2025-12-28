export type JanovixEnvironment =
	| "local"
	| "preview"
	| "dev"
	| "qa"
	| "production"
	| "test";

/**
 * Service bindings for worker-to-worker communication
 */
export interface Fetchers {
	/**
	 * Notification service binding for sending emails and notifications
	 */
	NOTIFICATIONS_SERVICE?: Fetcher;
}

export type Bindings = Env &
	Fetchers & {
		/**
		 * KV namespace for secondary storage (sessions, rate limiting).
		 * Provides faster access than D1 for high-frequency operations.
		 */
		KV: KVNamespace;

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
	};
