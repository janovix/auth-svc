/**
 * Internal API Keys validation route (service binding access)
 *
 * Mounted at /internal/api-keys in app.ts
 * Called by the api worker via service binding to validate API keys
 * and obtain an ephemeral JWT for proxying to aml-svc.
 */
import { Hono } from "hono";
import type { Bindings } from "../types/bindings";
import { ApiKeyService, ApiKeyRepository } from "../domain/api-keys";

type InternalBindings = { Bindings: Bindings };

const internalApiKeysRoutes = new Hono<InternalBindings>();

/**
 * POST /internal/api-keys/validate
 *
 * Input: { key: "jnvx_..." }
 * Output: { valid, organizationId, jwt, plan } or { valid: false, error }
 *
 * Flow:
 * 1. Hash the key, look up in DB
 * 2. Check: not revoked, not expired
 * 3. Check: org exists, owner has active subscription with eligible plan
 * 4. Issue an ephemeral JWT (30-60s) with org context
 * 5. Update lastUsedAt in background (waitUntil)
 */
internalApiKeysRoutes.post("/validate", async (c) => {
	const body = await c.req.json<{ key?: string }>();

	if (!body.key || typeof body.key !== "string") {
		return c.json({ valid: false, error: "missing_key" }, 400);
	}

	const service = new ApiKeyService(new ApiKeyRepository(c.env.DB));

	// Step 1-2: Validate the key (hash, lookup, check revoked/expired)
	const validation = await service.validate(body.key);
	if (!validation.valid || !validation.organizationId) {
		return c.json(
			{ valid: false, error: validation.error ?? "invalid_key" },
			401,
		);
	}

	// Step 3: Check subscription plan eligibility
	// Find org owner's subscription plan
	const owner = await c.env.DB.prepare(
		`SELECT userId FROM members WHERE organizationId = ? AND role = 'owner' LIMIT 1`,
	)
		.bind(validation.organizationId)
		.first<{ userId: string }>();

	if (!owner) {
		return c.json({ valid: false, error: "organization_no_owner" }, 403);
	}

	const subscription = await c.env.DB.prepare(
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
		return c.json({ valid: false, error: "plan_not_eligible" }, 403);
	}

	// Step 4: Issue an ephemeral JWT
	// Get the org owner's user details to populate JWT claims
	const ownerUser = await c.env.DB.prepare(
		`SELECT id, email, name, role FROM users WHERE id = ? LIMIT 1`,
	)
		.bind(owner.userId)
		.first<{ id: string; email: string; name: string | null; role: string }>();

	if (!ownerUser) {
		return c.json({ valid: false, error: "owner_not_found" }, 500);
	}

	// Issue an ephemeral JWT using JWKS keys stored in auth-svc's D1.
	// We sign directly rather than going through Better Auth's session-based
	// getToken API, because this is a service-binding call with no user session.
	let jwt: string;
	try {
		jwt = await createEphemeralJwt(c.env, {
			sub: ownerUser.id,
			email: ownerUser.email,
			name: ownerUser.name,
			role: ownerUser.role,
			organizationId: validation.organizationId,
		});
	} catch (err) {
		console.error("[Internal API Keys] JWT creation failed:", err);
		return c.json({ valid: false, error: "jwt_creation_failed" }, 500);
	}

	// Step 5: Update lastUsedAt in background
	try {
		const ctx = c.executionCtx;
		if (ctx && "waitUntil" in ctx) {
			ctx.waitUntil(service.touchLastUsed(body.key));
		} else {
			// Fallback: fire and forget
			service.touchLastUsed(body.key).catch(() => {});
		}
	} catch {
		// Non-critical, ignore
	}

	return c.json({
		valid: true,
		organizationId: validation.organizationId,
		jwt,
		plan,
	});
});

/**
 * Create an ephemeral JWT using JWKS keys stored in auth-svc's D1.
 * This JWT has a very short expiry (60s) — it only needs to survive
 * the service binding hop from the api worker to aml-svc.
 */
async function createEphemeralJwt(
	env: Bindings,
	payload: {
		sub: string;
		email: string;
		name: string | null;
		role: string;
		organizationId: string;
	},
): Promise<string> {
	// Get the most recent JWKS private key from the database
	const jwksRow = await env.DB.prepare(
		`SELECT id, privateKey, publicKey, alg, crv FROM jwks
			 WHERE (expiresAt IS NULL OR expiresAt > datetime('now'))
			 ORDER BY createdAt DESC
			 LIMIT 1`,
	).first<{
		id: string;
		privateKey: string;
		publicKey: string;
		alg: string | null;
		crv: string | null;
	}>();

	if (!jwksRow) {
		throw new Error("No JWKS keys available for JWT signing");
	}

	// Parse the private key (Better Auth stores JWK format as JSON string)
	const privateKeyJwk = JSON.parse(jwksRow.privateKey);

	// Import the private key for signing
	const privateKey = await crypto.subtle.importKey(
		"jwk",
		privateKeyJwk,
		{
			name: "ECDSA",
			namedCurve: privateKeyJwk.crv || "P-256",
		},
		false,
		["sign"],
	);

	// Build JWT header
	const header = {
		alg: "ES256",
		typ: "JWT",
		kid: jwksRow.id,
	};

	// Build JWT payload with short expiry
	const now = Math.floor(Date.now() / 1000);
	const jwtPayload = {
		...payload,
		iat: now,
		exp: now + 60, // 60 second expiry
		iss: env.BETTER_AUTH_URL || "auth-svc",
		jti: crypto.randomUUID(),
	};

	// Encode header and payload
	const encodedHeader = base64urlEncode(JSON.stringify(header));
	const encodedPayload = base64urlEncode(JSON.stringify(jwtPayload));
	const signingInput = `${encodedHeader}.${encodedPayload}`;

	// Sign
	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: { name: "SHA-256" } },
		privateKey,
		new TextEncoder().encode(signingInput),
	);

	// Convert DER signature to raw r||s format for JWT
	const rawSignature = derToRaw(new Uint8Array(signature));
	const encodedSignature = base64urlEncodeBuffer(rawSignature);

	return `${signingInput}.${encodedSignature}`;
}

/** Base64url encode a string */
function base64urlEncode(str: string): string {
	const bytes = new TextEncoder().encode(str);
	return base64urlEncodeBuffer(bytes);
}

/** Base64url encode a buffer */
function base64urlEncodeBuffer(buffer: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < buffer.length; i++) {
		binary += String.fromCharCode(buffer[i]);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * Convert DER-encoded ECDSA signature to raw r||s format.
 * Web Crypto API returns DER format, but JWT expects raw format.
 */
function derToRaw(der: Uint8Array): Uint8Array {
	// DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
	const rLength = der[3];
	const rStart = 4;
	const sLengthIndex = rStart + rLength + 1;
	const sLength = der[sLengthIndex];
	const sStart = sLengthIndex + 1;

	// Extract r and s, removing leading zero padding
	let r = der.slice(rStart, rStart + rLength);
	let s = der.slice(sStart, sStart + sLength);

	// Remove leading zero byte if present (DER encoding adds it for positive numbers)
	if (r.length === 33 && r[0] === 0) r = r.slice(1);
	if (s.length === 33 && s[0] === 0) s = s.slice(1);

	// Pad to 32 bytes each
	const raw = new Uint8Array(64);
	raw.set(r, 32 - r.length);
	raw.set(s, 64 - s.length);

	return raw;
}

export { internalApiKeysRoutes };
