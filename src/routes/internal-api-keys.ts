/**
 * Internal API Keys validation route (service binding access)
 *
 * Mounted at /internal/api-keys in app.ts
 * Called by the api worker via service binding to validate API keys
 * and obtain an ephemeral JWT for proxying to aml-svc.
 */
import { Hono } from "hono";
import { SignJWT, importJWK } from "jose";
import { symmetricDecrypt } from "better-auth/crypto";
import type { Bindings } from "../types/bindings";
import { ApiKeyService, ApiKeyRepository } from "../domain/api-keys";
import { resolveAuthEnvironment } from "../auth/config";

type InternalBindings = { Bindings: Bindings };

const internalApiKeysRoutes = new Hono<InternalBindings>();

/**
 * Core API key validation logic — callable directly without HTTP overhead.
 *
 * Flow:
 * 1. Hash the key, look up in DB
 * 2. Check: not revoked, not expired
 * 3. Look up org owner and subscription plan (for JWT claims)
 * 4. Issue an ephemeral JWT (60s) using Better Auth's encrypted JWKS keys
 * 5. Update lastUsedAt in background (waitUntil)
 */
export interface ApiKeyValidationResult {
	valid: boolean;
	organizationId?: string;
	jwt?: string;
	plan?: string | null;
	environment?: string;
	error?: string;
}

export async function validateApiKeyDirect(
	env: Bindings,
	ctx: ExecutionContext | undefined,
	key: string,
): Promise<ApiKeyValidationResult> {
	if (!key || typeof key !== "string") {
		return { valid: false, error: "missing_key" };
	}

	const service = new ApiKeyService(new ApiKeyRepository(env.DB));

	const validation = await service.validate(key);
	if (!validation.valid || !validation.organizationId) {
		return { valid: false, error: validation.error ?? "invalid_key" };
	}

	const keyEnvironment = validation.environment ?? "production";

	// Step 3: Look up org owner and subscription plan
	const owner = await env.DB.prepare(
		`SELECT userId FROM members WHERE organizationId = ? AND role = 'owner' LIMIT 1`,
	)
		.bind(validation.organizationId)
		.first<{ userId: string }>();

	if (!owner) {
		return { valid: false, error: "organization_no_owner" };
	}

	const subscription = await env.DB.prepare(
		`SELECT plan, status FROM subscription
			 WHERE referenceId = ?
			   AND status IN ('active', 'trialing')
			 ORDER BY
			   CASE WHEN stripeSubscriptionId IS NOT NULL THEN 0 ELSE 1 END,
			   createdAt DESC
			 LIMIT 1`,
	)
		.bind(owner.userId)
		.first<{ plan: string; status: string }>();

	const plan = subscription?.plan ?? null;
	if (!ApiKeyService.isPlanEligible(plan)) {
		return { valid: false, error: "plan_not_eligible" };
	}

	// Step 4: Get the org owner's user details for JWT claims
	const ownerUser = await env.DB.prepare(
		`SELECT id, email, name, role FROM users WHERE id = ? LIMIT 1`,
	)
		.bind(owner.userId)
		.first<{ id: string; email: string; name: string | null; role: string }>();

	if (!ownerUser) {
		return { valid: false, error: "owner_not_found" };
	}

	// Issue an ephemeral JWT using the same JWKS keys Better Auth uses.
	// We decrypt the private key with symmetricDecrypt (same as Better Auth's
	// internal signJWT function) and sign using jose — so the token is verifiable
	// by aml-svc's JWKS-based auth middleware.
	let jwt: string;
	try {
		jwt = await createEphemeralJwt(env, {
			sub: ownerUser.id,
			email: ownerUser.email,
			name: ownerUser.name,
			role: ownerUser.role,
			organizationId: validation.organizationId,
			environment: keyEnvironment,
		});
	} catch (err) {
		console.error("[Internal API Keys] JWT creation failed:", err);
		return { valid: false, error: "jwt_creation_failed" };
	}

	// Step 5: Update lastUsedAt in background
	try {
		if (ctx && "waitUntil" in ctx) {
			ctx.waitUntil(service.touchLastUsed(key));
		} else {
			service.touchLastUsed(key).catch(() => {});
		}
	} catch {
		// Non-critical, ignore
	}

	return {
		valid: true,
		organizationId: validation.organizationId,
		jwt,
		plan,
		environment: keyEnvironment,
	};
}

/**
 * POST /internal/api-keys/validate
 *
 * Input: { key: "jnvx_..." }
 * Output: { valid, organizationId, jwt, plan } or { valid: false, error }
 */
internalApiKeysRoutes.post("/validate", async (c) => {
	const body = await c.req.json<{ key?: string }>();
	const result = await validateApiKeyDirect(
		c.env,
		c.executionCtx,
		body.key ?? "",
	);
	const status = result.valid
		? 200
		: result.error === "missing_key"
			? 400
			: result.error === "plan_not_eligible" ||
				  result.error === "organization_no_owner"
				? 403
				: result.error === "owner_not_found"
					? 500
					: 401;
	return c.json(result, status);
});

/**
 * Resolve the Better Auth secret for the current environment.
 * Mirrors the logic in auth/config.ts resolveSecret().
 */
function getSecret(env: Bindings): string {
	if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length >= 32) {
		return env.BETTER_AUTH_SECRET;
	}
	const envName = resolveAuthEnvironment(env);
	if (envName === "local" || envName === "test") {
		return "local-dev-secret-please-override-0123456789";
	}
	throw new Error("BETTER_AUTH_SECRET is not configured");
}

/**
 * Create an ephemeral JWT using Better Auth's encrypted JWKS keys.
 *
 * This replicates the exact signing flow from Better Auth's signJWT:
 * 1. Read the most recent JWKS row from D1
 * 2. Decrypt the private key using symmetricDecrypt + BETTER_AUTH_SECRET
 * 3. Import the JWK and sign the JWT using jose
 *
 * The resulting JWT is verifiable by aml-svc's JWKS-based auth middleware
 * because the public key is served at /api/auth/jwks.
 */
async function createEphemeralJwt(
	env: Bindings,
	payload: {
		sub: string;
		email: string;
		name: string | null;
		role: string;
		organizationId: string;
		environment: string;
	},
): Promise<string> {
	const secret = getSecret(env);

	// Get the most recent JWKS key from D1
	const jwksRow = await env.DB.prepare(
		`SELECT id, privateKey, alg FROM jwks
			 WHERE (expiresAt IS NULL OR expiresAt > datetime('now'))
			 ORDER BY createdAt DESC
			 LIMIT 1`,
	).first<{
		id: string;
		privateKey: string;
		alg: string | null;
	}>();

	if (!jwksRow) {
		throw new Error("No JWKS keys available for JWT signing");
	}

	// Decrypt the private key — Better Auth encrypts it with the secret.
	// The stored value is a JSON-encoded encrypted string.
	const encryptedData = JSON.parse(jwksRow.privateKey) as string;
	const decryptedJwk = await symmetricDecrypt({
		key: secret,
		data: encryptedData,
	});

	// Import the decrypted JWK for signing
	const alg = jwksRow.alg ?? "EdDSA";
	const privateKey = await importJWK(JSON.parse(decryptedJwk), alg);

	// Build and sign the JWT with 60s expiry
	const now = Math.floor(Date.now() / 1000);
	const issuer = env.BETTER_AUTH_URL || "auth-svc";

	const token = await new SignJWT({
		...payload,
	})
		.setProtectedHeader({ alg, kid: jwksRow.id })
		.setIssuedAt(now)
		.setExpirationTime(now + 60) // 60s — only needs to survive api → aml-svc hop
		.setIssuer(issuer)
		.setSubject(payload.sub)
		.setJti(crypto.randomUUID())
		.sign(privateKey);

	return token;
}

export { internalApiKeysRoutes };
