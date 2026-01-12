/**
 * JWT Utilities for Enterprise License
 *
 * Uses Web Crypto API for Ed25519 signing/verification
 * Compatible with Cloudflare Workers runtime
 */

import type { EnterpriseLicensePayload, LicenseLimits } from "./types";
import type { Feature } from "../subscription/types";

/**
 * Base64URL encode
 */
function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str: string): Uint8Array {
	const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * Sign a license payload with Ed25519 private key
 */
export async function signLicense(
	payload: EnterpriseLicensePayload,
	privateKeyPem: string,
): Promise<string> {
	// Import the private key
	const privateKey = await importPrivateKey(privateKeyPem);

	// Create JWT header
	const header = {
		alg: "EdDSA",
		typ: "JWT",
	};

	// Encode header and payload
	const encoder = new TextEncoder();
	const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
	const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
	const message = `${headerB64}.${payloadB64}`;

	// Sign the message
	const signature = await crypto.subtle.sign(
		"Ed25519",
		privateKey,
		encoder.encode(message),
	);

	// Return the complete JWT
	return `${message}.${base64UrlEncode(signature)}`;
}

/**
 * Verify and decode a license JWT
 */
export async function verifyLicense(
	token: string,
	publicKeyPem: string,
): Promise<{
	valid: boolean;
	payload?: EnterpriseLicensePayload;
	error?: string;
}> {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return { valid: false, error: "Invalid token format" };
		}

		const [headerB64, payloadB64, signatureB64] = parts;

		// Import the public key
		const publicKey = await importPublicKey(publicKeyPem);

		// Verify the signature
		const encoder = new TextEncoder();
		const message = `${headerB64}.${payloadB64}`;
		const signature = base64UrlDecode(signatureB64);

		const isValid = await crypto.subtle.verify(
			"Ed25519",
			publicKey,
			signature,
			encoder.encode(message),
		);

		if (!isValid) {
			return { valid: false, error: "Invalid signature" };
		}

		// Decode the payload
		const decoder = new TextDecoder();
		const payloadJson = decoder.decode(base64UrlDecode(payloadB64));
		const payload = JSON.parse(payloadJson) as EnterpriseLicensePayload;

		// Check expiration
		const now = Math.floor(Date.now() / 1000);
		if (payload.exp && payload.exp < now) {
			return { valid: false, payload, error: "License expired" };
		}

		// Check issued at
		if (payload.iat && payload.iat > now) {
			return { valid: false, payload, error: "License not yet valid" };
		}

		return { valid: true, payload };
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : "Verification failed",
		};
	}
}

/**
 * Decode a license JWT without verification (for display purposes only)
 */
export function decodeLicensePayload(
	token: string,
): EnterpriseLicensePayload | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return null;
		}

		const decoder = new TextDecoder();
		const payloadJson = decoder.decode(base64UrlDecode(parts[1]));
		return JSON.parse(payloadJson) as EnterpriseLicensePayload;
	} catch {
		return null;
	}
}

/**
 * Create a license payload
 */
export function createLicensePayload(
	licenseId: string,
	customerName: string,
	limits: LicenseLimits,
	features: Feature[],
	expiresAt: Date,
	stripeCustomerId?: string,
	stripeSubscriptionId?: string,
): EnterpriseLicensePayload {
	const now = Math.floor(Date.now() / 1000);
	const exp = Math.floor(expiresAt.getTime() / 1000);

	const payload: EnterpriseLicensePayload = {
		iss: "janovix.com",
		sub: licenseId,
		iat: now,
		exp,
		lid: licenseId,
		cust: customerName,
		limits,
		features,
	};

	if (stripeCustomerId && stripeSubscriptionId) {
		payload.stripe = {
			customerId: stripeCustomerId,
			subscriptionId: stripeSubscriptionId,
		};
	}

	return payload;
}

/**
 * Import Ed25519 private key from PEM format
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
	// Remove PEM headers and decode
	const pemContents = pem
		.replace("-----BEGIN PRIVATE KEY-----", "")
		.replace("-----END PRIVATE KEY-----", "")
		.replace(/\s/g, "");

	const binaryDer = base64UrlDecode(
		pemContents.replace(/\+/g, "-").replace(/\//g, "_"),
	);

	return crypto.subtle.importKey(
		"pkcs8",
		binaryDer,
		{ name: "Ed25519" },
		false,
		["sign"],
	);
}

/**
 * Import Ed25519 public key from PEM format
 */
async function importPublicKey(pem: string): Promise<CryptoKey> {
	// Remove PEM headers and decode
	const pemContents = pem
		.replace("-----BEGIN PUBLIC KEY-----", "")
		.replace("-----END PUBLIC KEY-----", "")
		.replace(/\s/g, "");

	const binaryDer = base64UrlDecode(
		pemContents.replace(/\+/g, "-").replace(/\//g, "_"),
	);

	return crypto.subtle.importKey(
		"spki",
		binaryDer,
		{ name: "Ed25519" },
		false,
		["verify"],
	);
}

/**
 * Generate a new Ed25519 key pair
 * Useful for initial setup
 */
export async function generateKeyPair(): Promise<{
	privateKey: string;
	publicKey: string;
}> {
	const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
		"sign",
		"verify",
	])) as CryptoKeyPair;

	const privateKeyBuffer = (await crypto.subtle.exportKey(
		"pkcs8",
		keyPair.privateKey,
	)) as ArrayBuffer;
	const publicKeyBuffer = (await crypto.subtle.exportKey(
		"spki",
		keyPair.publicKey,
	)) as ArrayBuffer;

	const privateKeyB64 = btoa(
		String.fromCharCode(...new Uint8Array(privateKeyBuffer)),
	);
	const publicKeyB64 = btoa(
		String.fromCharCode(...new Uint8Array(publicKeyBuffer)),
	);

	return {
		privateKey: `-----BEGIN PRIVATE KEY-----\n${privateKeyB64.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----`,
		publicKey: `-----BEGIN PUBLIC KEY-----\n${publicKeyB64.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`,
	};
}
