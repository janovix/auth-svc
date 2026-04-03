import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "./app";
import { SettingsService } from "./domain/settings";
import { AuditService } from "./domain/audit";
import { createUsageRightsServiceFromEnv } from "./domain/usage-rights";
import { PricingRepository } from "./domain/pricing";
import {
	SubscriptionService,
	SubscriptionRepository,
} from "./domain/subscription";
import type { UsageMetric } from "./domain/usage-rights/types";
import type {
	Feature,
	UsageMetric as SubUsageMetric,
} from "./domain/subscription/types";
import type { Bindings } from "./types/bindings";
import {
	validateApiKeyDirect,
	type ApiKeyValidationResult,
} from "./routes/internal-api-keys";
import {
	JWKS_KV_CACHE_KEY,
	JWKS_KV_TTL_SECONDS,
	buildJwks,
	type JwksRow,
} from "./utils/jwks";

const REPORTABLE_USAGE_METRICS = [
	"reports",
	"notices",
	"alerts",
	"operations",
	"clients",
] as const;

type ReportableUsageMetric = (typeof REPORTABLE_USAGE_METRICS)[number];

function toReportableUsageMetric(
	metric: SubUsageMetric,
): ReportableUsageMetric {
	if ((REPORTABLE_USAGE_METRICS as readonly string[]).includes(metric)) {
		return metric as ReportableUsageMetric;
	}
	throw new Error(`Unsupported usage metric for reporting: ${metric}`);
}

// =============================================================================
// RPC OUTPUT TYPES
// =============================================================================

export interface JwksResult {
	keys: Record<string, unknown>[];
}

export interface AuditLogInput {
	eventType: string;
	entityType: string;
	entityId?: string | null;
	actorUserId?: string | null;
	actorOrganizationId?: string | null;
	actorIp?: string | null;
	actorUserAgent?: string | null;
	previousState?: Record<string, unknown> | null;
	newState?: Record<string, unknown> | null;
	changeSummary?: Record<string, unknown> | null;
	requestId?: string | null;
	metadata?: Record<string, unknown> | null;
	sourceService?: string;
}

export interface AuditLogResult {
	id: string;
	signature: string;
}

export interface GateResult {
	allowed: boolean;
	metric?: string;
	used?: number;
	limit?: number;
	remaining?: number;
	entitlementType?: string;
	error?: string;
	upgradeRequired?: boolean;
	code?: string;
	overageWarning?: boolean;
	overageUnits?: number;
	overageEnabled?: boolean;
	spendLimitRemaining?: number | null;
}

export interface OrgBranding {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: Record<string, unknown> | null;
	/** Better Auth organizations.status — archived orgs are read-only in product apps */
	status: string;
}

export interface OrgMember {
	id: string;
	userId: string;
	role: string;
	email: string;
	name: string;
	image: string | null;
}

export interface OrgIdsPage {
	organizationIds: string[];
	total: number;
}

export interface OrgSubscriptionStatus {
	hasSubscription: boolean;
	isEnterprise: boolean;
	status: string | null;
	planTier: string | null;
	planName: string | null;
	features: string[];
}

export interface OrgUsageCheckResult {
	allowed: boolean;
	used: number;
	included: number;
	remaining: number;
	overage: number;
}

export type { ApiKeyValidationResult } from "./routes/internal-api-keys";

// =============================================================================
// RPC ENTRYPOINT
// =============================================================================

/**
 * RPC entrypoint for auth-svc.
 *
 * Exposes typed methods for inter-service communication via Cloudflare Service
 * Bindings. Callers must declare `"entrypoint": "AuthSvcEntrypoint"` in their
 * wrangler config service binding.
 *
 * The `fetch()` method delegates to the Hono app, maintaining full HTTP
 * backward compatibility for callers that still use `.fetch()` (e.g.,
 * notifications-svc fetching org members).
 *
 * @example wrangler.jsonc (caller)
 * ```jsonc
 * {
 *   "services": [{
 *     "binding": "AUTH_SERVICE",
 *     "service": "auth-svc",
 *     "entrypoint": "AuthSvcEntrypoint"
 *   }]
 * }
 * ```
 */
export class AuthSvcEntrypoint extends WorkerEntrypoint<Bindings> {
	/**
	 * HTTP fallback — delegates to the Hono app so existing `.fetch()` callers
	 * (e.g., fetching org members from notifications-svc) continue to work.
	 */
	async fetch(request: Request): Promise<Response> {
		return app.fetch(request, this.env, this.ctx);
	}

	/**
	 * Retrieve JWKS for JWT verification.
	 *
	 * Uses KV cache (primary path) with D1 fallback — same logic as the
	 * dedicated HTTP handler at GET /api/auth/jwks.
	 */
	async getJwks(): Promise<JwksResult> {
		// Primary path: KV cache
		try {
			const cached = await this.env.KV.get(JWKS_KV_CACHE_KEY);
			if (cached) {
				return JSON.parse(cached) as JwksResult;
			}
		} catch {
			// KV read failure is non-fatal; fall through to D1
		}

		// Fallback path: direct D1 query
		const result = await this.env.DB.prepare(
			"SELECT id, publicKey, alg, crv, expiresAt FROM jwks",
		).all<JwksRow>();

		const rows = result.results ?? [];
		const jwks = buildJwks(rows);

		// Populate KV cache asynchronously
		if (rows.length > 0) {
			this.ctx.waitUntil(
				this.env.KV.put(JWKS_KV_CACHE_KEY, JSON.stringify(jwks), {
					expirationTtl: JWKS_KV_TTL_SECONDS,
				}).catch(() => {}),
			);
		}

		return jwks;
	}

	/**
	 * Get resolved settings (user + org + browser hints merged).
	 *
	 * @param userId - User ID to get settings for
	 * @param orgId - Optional organization ID for org defaults
	 * @param headers - Optional base64-encoded JSON of browser hints
	 */
	async getResolvedSettings(
		userId: string,
		orgId?: string,
		headers?: string,
	): Promise<unknown> {
		const service = new SettingsService(this.env.DB);
		const browserHints = service.parseBrowserHints(headers);
		return service.resolveSettings(userId, orgId, browserHints);
	}

	/**
	 * Create an audit log entry.
	 */
	async logAuditEvent(input: AuditLogInput): Promise<AuditLogResult | null> {
		try {
			const service = new AuditService(this.env.DB);
			const entry = await service.createLog({
				...input,
				sourceService: input.sourceService ?? "unknown",
			});
			return { id: entry.id, signature: entry.signature };
		} catch (error) {
			console.error("[AuthSvcEntrypoint] Failed to create audit log:", error);
			return null;
		}
	}

	/**
	 * Gate-and-meter: check if action is allowed and atomically increment the
	 * meter. Returns `allowed: false` if the limit is exceeded.
	 */
	async gateUsageRights(
		orgId: string,
		metric: UsageMetric,
		count: number = 1,
	): Promise<GateResult> {
		const service = createUsageRightsServiceFromEnv(this.env);
		const result = await service.gateAndMeter(orgId, metric, count);
		return result as GateResult;
	}

	/**
	 * Meter-only: increment counter without gate check.
	 */
	async meterUsageRights(
		orgId: string,
		metric: UsageMetric,
		count: number = 1,
	): Promise<void> {
		const service = createUsageRightsServiceFromEnv(this.env);
		await service.recordUsage(orgId, metric, count);
	}

	/**
	 * Check-only: pre-flight check without incrementing meter.
	 */
	async checkUsageRights(
		orgId: string,
		metric: UsageMetric,
	): Promise<GateResult> {
		const service = createUsageRightsServiceFromEnv(this.env);
		const result = await service.checkRight(orgId, metric);
		return result as GateResult;
	}

	// ===========================================================================
	// ORGANIZATION METHODS
	// ===========================================================================

	/**
	 * Get branding fields for a single organization.
	 * Used by aml-svc public KYC page to render org logo and name.
	 */
	async getOrganization(id: string): Promise<OrgBranding | null> {
		const org = await this.env.DB.prepare(
			`SELECT id, name, slug, logo, metadata, status FROM organizations WHERE id = ?`,
		)
			.bind(id)
			.first<{
				id: string;
				name: string;
				slug: string;
				logo: string | null;
				metadata: string | null;
				status: string | null;
			}>();

		if (!org) return null;

		return {
			id: org.id,
			name: org.name,
			slug: org.slug,
			logo: org.logo,
			metadata: org.metadata
				? (JSON.parse(org.metadata) as Record<string, unknown>)
				: null,
			status: org.status ?? "active",
		};
	}

	/**
	 * Get all members (with user info) for an organization.
	 * Used by notifications-svc to send org-scoped emails.
	 */
	async getOrganizationMembers(orgId: string): Promise<OrgMember[]> {
		const result = await this.env.DB.prepare(
			`SELECT m.id, m.userId, m.role, u.email, u.name, u.image
			 FROM members m
			 INNER JOIN users u ON u.id = m.userId
			 WHERE m.organizationId = ?
			 ORDER BY m.createdAt ASC`,
		)
			.bind(orgId)
			.all<{
				id: string;
				userId: string;
				role: string;
				email: string;
				name: string | null;
				image: string | null;
			}>();

		return result.results.map((m) => ({
			id: m.id,
			userId: m.userId,
			role: m.role,
			email: m.email,
			name: m.name ?? "",
			image: m.image ?? null,
		}));
	}

	/**
	 * Get a paginated list of all organization IDs.
	 * Used by notifications-svc broadcast to iterate over all orgs.
	 */
	async getAllOrganizationIds(
		limit: number = 100,
		offset: number = 0,
	): Promise<OrgIdsPage> {
		const [countRow, rows] = await Promise.all([
			this.env.DB.prepare(`SELECT COUNT(*) as total FROM organizations`).first<{
				total: number;
			}>(),
			this.env.DB.prepare(
				`SELECT id FROM organizations ORDER BY createdAt ASC, id ASC LIMIT ? OFFSET ?`,
			)
				.bind(limit, offset)
				.all<{ id: string }>(),
		]);

		return {
			organizationIds: rows.results.map((r) => r.id),
			total: countRow?.total ?? 0,
		};
	}

	// ===========================================================================
	// SUBSCRIPTION METHODS (org-scoped; resolve owner internally)
	// ===========================================================================

	/**
	 * Get subscription status for an organization.
	 * Resolves the org owner internally; returns null if owner not found.
	 */
	async getSubscriptionStatus(
		organizationId: string,
	): Promise<OrgSubscriptionStatus | null> {
		const owner = await this.env.DB.prepare(
			`SELECT userId FROM members WHERE organizationId = ? AND role = 'owner' LIMIT 1`,
		)
			.bind(organizationId)
			.first<{ userId: string }>();

		if (!owner) return null;

		const service = new SubscriptionService(
			new SubscriptionRepository(this.env.DB),
			null,
			new PricingRepository(this.env.DB),
		);
		const status = await service.getUserSubscriptionStatus(owner.userId);
		const features = await service.getUserFeatures(owner.userId);

		return {
			hasSubscription: status.hasSubscription,
			isEnterprise: status.plan === "enterprise",
			status: status.status ?? null,
			planTier: status.plan ?? null,
			planName: status.plan ?? null,
			features: features as string[],
		};
	}

	/**
	 * Increment usage counter for an organization metric.
	 * Used by watchlist-svc after recording watchlist matches.
	 */
	async reportSubscriptionUsage(
		organizationId: string,
		metric: SubUsageMetric,
		count: number = 1,
	): Promise<void> {
		const reportable = toReportableUsageMetric(metric);
		const service = new SubscriptionService(
			new SubscriptionRepository(this.env.DB),
			null,
			new PricingRepository(this.env.DB),
		);
		await service.reportUsage(organizationId, reportable, count);
	}

	/**
	 * Pre-flight usage check for an organization metric (no increment).
	 * Resolves the org owner internally.
	 */
	async checkSubscriptionUsage(
		organizationId: string,
		metric: SubUsageMetric,
	): Promise<OrgUsageCheckResult | null> {
		const owner = await this.env.DB.prepare(
			`SELECT userId FROM members WHERE organizationId = ? AND role = 'owner' LIMIT 1`,
		)
			.bind(organizationId)
			.first<{ userId: string }>();

		if (!owner) return null;

		const service = new SubscriptionService(
			new SubscriptionRepository(this.env.DB),
			null,
			new PricingRepository(this.env.DB),
		);
		const result = await service.checkUsage(
			organizationId,
			owner.userId,
			metric,
		);

		return {
			allowed: result.allowed,
			used: result.used,
			included: result.included,
			remaining: result.remaining,
			overage: result.overage,
		};
	}

	/**
	 * Check whether an organization's subscription includes a specific feature.
	 * Resolves the org owner internally.
	 */
	async checkSubscriptionFeature(
		organizationId: string,
		feature: Feature,
	): Promise<{ allowed: boolean; planTier: string | null }> {
		const owner = await this.env.DB.prepare(
			`SELECT userId FROM members WHERE organizationId = ? AND role = 'owner' LIMIT 1`,
		)
			.bind(organizationId)
			.first<{ userId: string }>();

		if (!owner) return { allowed: false, planTier: null };

		const service = new SubscriptionService(
			new SubscriptionRepository(this.env.DB),
			null,
			new PricingRepository(this.env.DB),
		);
		const [hasFeatureResult, status] = await Promise.all([
			service.hasFeature(owner.userId, feature),
			service.getUserSubscriptionStatus(owner.userId),
		]);

		return {
			allowed: hasFeatureResult,
			planTier: status.plan ?? null,
		};
	}

	// ===========================================================================
	// API KEY VALIDATION
	// ===========================================================================

	/**
	 * Validate an API key and return an ephemeral JWT for proxying to aml-svc.
	 */
	async validateApiKey(key: string): Promise<ApiKeyValidationResult> {
		return validateApiKeyDirect(this.env, this.ctx, key);
	}
}
