import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "./app";
import { SettingsService } from "./domain/settings";
import { AuditService } from "./domain/audit";
import {
	UsageRightsService,
	UsageRightsRepository,
} from "./domain/usage-rights";
import { PricingRepository } from "./domain/pricing";
import type { UsageMetric } from "./domain/usage-rights/types";
import type { Bindings } from "./types/bindings";

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
}

// JWKS KV cache key (kept in sync with routes/jwks.ts)
const JWKS_KV_CACHE_KEY = "ba:jwks:public-keys";
const JWKS_KV_TTL_SECONDS = 3600;
const JWKS_GRACE_PERIOD_MS = 30 * 24 * 3600 * 1000;

type JwksRow = {
	id: string;
	publicKey: string;
	alg: string | null;
	crv: string | null;
	expiresAt: string | null;
};

function buildJwks(rows: JwksRow[]): JwksResult {
	const now = Date.now();
	const keys = rows
		.filter((row) => {
			if (!row.expiresAt) return true;
			return new Date(row.expiresAt).getTime() + JWKS_GRACE_PERIOD_MS > now;
		})
		.map((row) => ({
			alg: row.alg ?? "EdDSA",
			...(row.crv ? { crv: row.crv } : {}),
			...JSON.parse(row.publicKey),
			kid: row.id,
		}));
	return { keys };
}

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
		const service = new UsageRightsService(
			new UsageRightsRepository(this.env.DB),
			new PricingRepository(this.env.DB),
		);
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
		const service = new UsageRightsService(
			new UsageRightsRepository(this.env.DB),
			new PricingRepository(this.env.DB),
		);
		await service.recordUsage(orgId, metric, count);
	}

	/**
	 * Check-only: pre-flight check without incrementing meter.
	 */
	async checkUsageRights(
		orgId: string,
		metric: UsageMetric,
	): Promise<GateResult> {
		const service = new UsageRightsService(
			new UsageRightsRepository(this.env.DB),
			new PricingRepository(this.env.DB),
		);
		const result = await service.checkRight(orgId, metric);
		return result as GateResult;
	}
}
