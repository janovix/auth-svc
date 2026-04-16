import type { EmailI18nPayload, LanguageCode } from "../lib/i18n";

// =============================================================================
// LOCAL RPC INTERFACES
// Mirrors entrypoint methods to enable typed RPC calls without a shared package.
// =============================================================================

/**
 * RPC interface exposed by aml-svc via `AmlSvcEntrypoint`.
 * Includes `fetch()` for backward-compatible HTTP calls (e.g., org settings proxy).
 */
export interface AmlSvcRpc {
	fetch(request: Request): Promise<Response>;
	getOrganizationSettings(
		orgId: string,
	): Promise<{ configured: boolean; settings: unknown }>;
	updateOrganizationSettings(
		orgId: string,
		data: unknown,
	): Promise<{ configured: boolean; settings: unknown }>;
	patchOrganizationSettings(
		orgId: string,
		data: unknown,
	): Promise<{ configured: boolean; settings: unknown }>;
	patchSelfServiceSettings(
		orgId: string,
		data: unknown,
	): Promise<{ configured: boolean; settings: unknown }>;
}

type NotificationsTarget =
	| { kind: "org" }
	| { kind: "user"; userId: string; email?: string; name?: string };

type NotificationsSeverity = "info" | "warn" | "error";

interface NotifyRpcInput {
	tenantId: string;
	target: NotificationsTarget;
	channelSlug?: string;
	type: string;
	title: string;
	body: string;
	payload?: Record<string, unknown>;
	severity?: NotificationsSeverity;
	callbackUrl?: string;
	sendEmail?: boolean;
	emailI18n?: EmailI18nPayload;
	emailLocale?: LanguageCode;
	sourceService: string;
	sourceEvent?: string;
}

interface NotifyRpcResult {
	notificationId: string;
	delivered: { realtime: boolean; email: string };
	recipientCount?: number;
}

interface EmailSendRpcInput {
	to: { email: string; name?: string };
	subject: string;
	content: { title: string; body: string; callbackUrl?: string };
	tags?: string[];
	sourceService: string;
	sourceEvent?: string;
	language?: LanguageCode;
}

interface EmailSendRpcResult {
	success: boolean;
	email: string;
	status?: string;
	mandrillId?: string;
	error?: string;
}

/**
 * RPC interface exposed by notifications-svc via `NotificationsEntrypoint`.
 * Used to type the `NOTIFICATIONS_SERVICE` service binding in auth-svc.
 */
export interface NotificationsRpc {
	notify(input: NotifyRpcInput): Promise<NotifyRpcResult>;
	sendEmail(input: EmailSendRpcInput): Promise<EmailSendRpcResult>;
}

export type FlagsFlagValue =
	| boolean
	| string
	| number
	| Record<string, unknown>;

export interface FlagsEvaluationContext {
	organizationId?: string;
	userId?: string;
	plan?: string;
	environment?: string;
	attributes?: Record<string, string | number | boolean>;
}

/**
 * RPC interface exposed by flags-svc via `FlagsSvcEntrypoint`.
 */
export interface FlagsSvcRpc {
	fetch(request: Request | string, init?: RequestInit): Promise<Response>;
	evaluateFlag(
		key: string,
		context: FlagsEvaluationContext,
	): Promise<FlagsFlagValue | null>;
	evaluateFlags(
		keys: string[],
		context: FlagsEvaluationContext,
	): Promise<Record<string, FlagsFlagValue>>;
	evaluateAllFlags(
		context: FlagsEvaluationContext,
	): Promise<Record<string, FlagsFlagValue>>;
	isFlagEnabled(key: string, context: FlagsEvaluationContext): Promise<boolean>;
}

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
	 * Google OAuth Client ID for social login.
	 * Created in Google Cloud Console, configured via wrangler vars.
	 */
	GOOGLE_CLIENT_ID?: string;
	/**
	 * Google OAuth Client Secret for social login.
	 * Created in Google Cloud Console, configured via Cloudflare Dashboard secrets.
	 */
	GOOGLE_CLIENT_SECRET?: string;
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
	 * Service binding to aml-svc via `AmlSvcEntrypoint`.
	 * Used to proxy AML compliance settings requests securely via typed RPC.
	 *
	 * Caller wrangler config must include `"entrypoint": "AmlSvcEntrypoint"`.
	 */
	AML_SERVICE?: AmlSvcRpc;

	/**
	 * Service binding to notifications-svc via `NotificationsEntrypoint`.
	 * Used to dispatch notifications for organization events.
	 *
	 * Caller wrangler config must include `"entrypoint": "NotificationsEntrypoint"`.
	 */
	NOTIFICATIONS_SERVICE?: NotificationsRpc;

	/**
	 * Service binding to flags-svc via `FlagsSvcEntrypoint`.
	 * Used to gate Stripe billing when `stripe-billing-enabled` is false.
	 */
	FLAGS_SERVICE?: FlagsSvcRpc;

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
	// ENTERPRISE LICENSING (DEPRECATED - Using Better Auth Stripe)
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
