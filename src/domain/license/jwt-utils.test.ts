import { describe, it, expect, beforeAll } from "vitest";
import {
	signLicense,
	verifyLicense,
	decodeLicensePayload,
	createLicensePayload,
	generateKeyPair,
} from "./jwt-utils";
import type { EnterpriseLicensePayload, LicenseLimits } from "./types";
import type { Feature } from "../subscription/types";

describe("JWT Utilities", () => {
	let testKeyPair: { privateKey: string; publicKey: string };

	beforeAll(async () => {
		// Generate a key pair for testing
		testKeyPair = await generateKeyPair();
	});

	describe("generateKeyPair", () => {
		it("should generate a valid key pair", async () => {
			const keyPair = await generateKeyPair();

			expect(keyPair.privateKey).toContain("-----BEGIN PRIVATE KEY-----");
			expect(keyPair.privateKey).toContain("-----END PRIVATE KEY-----");
			expect(keyPair.publicKey).toContain("-----BEGIN PUBLIC KEY-----");
			expect(keyPair.publicKey).toContain("-----END PUBLIC KEY-----");
		});

		it("should generate unique key pairs each time", async () => {
			const keyPair1 = await generateKeyPair();
			const keyPair2 = await generateKeyPair();

			expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
			expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
		});
	});

	describe("createLicensePayload", () => {
		it("should create a valid license payload", () => {
			const licenseId = "test-license-id";
			const customerName = "Test Customer";
			const limits: LicenseLimits = {
				noticesPerMonth: 1000,
				maxUsers: 50,
				maxTransactions: 5000,
				maxAlerts: 100,
			};
			const features: Feature[] = ["data_capture", "sso"];
			const expiresAt = new Date("2027-01-01");

			const payload = createLicensePayload(
				licenseId,
				customerName,
				limits,
				features,
				expiresAt,
			);

			expect(payload.iss).toBe("janovix.com");
			expect(payload.sub).toBe(licenseId);
			expect(payload.lid).toBe(licenseId);
			expect(payload.cust).toBe(customerName);
			expect(payload.limits).toEqual(limits);
			expect(payload.features).toEqual(features);
			expect(payload.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
			expect(payload.exp).toBe(Math.floor(expiresAt.getTime() / 1000));
			expect(payload.stripe).toBeUndefined();
		});

		it("should include Stripe info when provided", () => {
			const licenseId = "test-license-id";
			const customerName = "Test Customer";
			const limits: LicenseLimits = { noticesPerMonth: 100, maxUsers: 10 };
			const features: Feature[] = ["data_capture"];
			const expiresAt = new Date("2027-01-01");
			const stripeCustomerId = "cus_123";
			const stripeSubscriptionId = "sub_456";

			const payload = createLicensePayload(
				licenseId,
				customerName,
				limits,
				features,
				expiresAt,
				stripeCustomerId,
				stripeSubscriptionId,
			);

			expect(payload.stripe).toEqual({
				customerId: stripeCustomerId,
				subscriptionId: stripeSubscriptionId,
			});
		});

		it("should not include Stripe info when only customerId is provided", () => {
			const payload = createLicensePayload(
				"id",
				"Customer",
				{ noticesPerMonth: 100, maxUsers: 10 },
				[],
				new Date("2027-01-01"),
				"cus_123",
			);

			expect(payload.stripe).toBeUndefined();
		});
	});

	describe("signLicense and verifyLicense", () => {
		it("should sign and verify a license successfully", async () => {
			const payload: EnterpriseLicensePayload = {
				iss: "janovix.com",
				sub: "test-license",
				iat: Math.floor(Date.now() / 1000),
				exp: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year
				lid: "test-license",
				cust: "Test Customer",
				limits: { noticesPerMonth: 1000, maxUsers: 50 },
				features: ["data_capture", "sso"],
			};

			const token = await signLicense(payload, testKeyPair.privateKey);
			const result = await verifyLicense(token, testKeyPair.publicKey);

			expect(result.valid).toBe(true);
			expect(result.payload).toBeDefined();
			expect(result.payload?.lid).toBe(payload.lid);
			expect(result.payload?.cust).toBe(payload.cust);
			expect(result.error).toBeUndefined();
		});

		it("should fail verification with wrong public key", async () => {
			const payload: EnterpriseLicensePayload = {
				iss: "janovix.com",
				sub: "test-license",
				iat: Math.floor(Date.now() / 1000),
				exp: Math.floor(Date.now() / 1000) + 86400,
				lid: "test-license",
				cust: "Test Customer",
				limits: { noticesPerMonth: 100, maxUsers: 10 },
				features: [],
			};

			const token = await signLicense(payload, testKeyPair.privateKey);
			const differentKeyPair = await generateKeyPair();
			const result = await verifyLicense(token, differentKeyPair.publicKey);

			expect(result.valid).toBe(false);
			expect(result.error).toBe("Invalid signature");
		});

		it("should fail verification for expired license", async () => {
			const payload: EnterpriseLicensePayload = {
				iss: "janovix.com",
				sub: "test-license",
				iat: Math.floor(Date.now() / 1000) - 86400 * 2, // 2 days ago
				exp: Math.floor(Date.now() / 1000) - 86400, // expired 1 day ago
				lid: "test-license",
				cust: "Test Customer",
				limits: { noticesPerMonth: 100, maxUsers: 10 },
				features: [],
			};

			const token = await signLicense(payload, testKeyPair.privateKey);
			const result = await verifyLicense(token, testKeyPair.publicKey);

			expect(result.valid).toBe(false);
			expect(result.payload).toBeDefined();
			expect(result.error).toBe("License expired");
		});

		it("should fail verification for future-dated license", async () => {
			const payload: EnterpriseLicensePayload = {
				iss: "janovix.com",
				sub: "test-license",
				iat: Math.floor(Date.now() / 1000) + 86400, // issued in the future
				exp: Math.floor(Date.now() / 1000) + 86400 * 365,
				lid: "test-license",
				cust: "Test Customer",
				limits: { noticesPerMonth: 100, maxUsers: 10 },
				features: [],
			};

			const token = await signLicense(payload, testKeyPair.privateKey);
			const result = await verifyLicense(token, testKeyPair.publicKey);

			expect(result.valid).toBe(false);
			expect(result.error).toBe("License not yet valid");
		});

		it("should return error for invalid token format", async () => {
			const result = await verifyLicense(
				"invalid-token",
				testKeyPair.publicKey,
			);

			expect(result.valid).toBe(false);
			expect(result.error).toBe("Invalid token format");
		});

		it("should return error for token with only two parts", async () => {
			const result = await verifyLicense("part1.part2", testKeyPair.publicKey);

			expect(result.valid).toBe(false);
			expect(result.error).toBe("Invalid token format");
		});

		it("should return error for malformed token", async () => {
			const result = await verifyLicense(
				"invalid.base64.token",
				testKeyPair.publicKey,
			);

			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
		});
	});

	describe("decodeLicensePayload", () => {
		it("should decode a valid JWT payload without verification", async () => {
			const payload: EnterpriseLicensePayload = {
				iss: "janovix.com",
				sub: "test-license",
				iat: Math.floor(Date.now() / 1000),
				exp: Math.floor(Date.now() / 1000) + 86400,
				lid: "test-license",
				cust: "Test Customer",
				limits: { noticesPerMonth: 100, maxUsers: 10 },
				features: ["data_capture"],
			};

			const token = await signLicense(payload, testKeyPair.privateKey);
			const decoded = decodeLicensePayload(token);

			expect(decoded).not.toBeNull();
			expect(decoded?.lid).toBe(payload.lid);
			expect(decoded?.cust).toBe(payload.cust);
			expect(decoded?.features).toEqual(payload.features);
		});

		it("should return null for invalid token format", () => {
			expect(decodeLicensePayload("invalid")).toBeNull();
			expect(decodeLicensePayload("only.two")).toBeNull();
		});

		it("should return null for malformed base64", () => {
			expect(decodeLicensePayload("a.!!!invalid!!!.c")).toBeNull();
		});

		it("should decode even an expired license", async () => {
			const payload: EnterpriseLicensePayload = {
				iss: "janovix.com",
				sub: "expired-license",
				iat: Math.floor(Date.now() / 1000) - 86400 * 2,
				exp: Math.floor(Date.now() / 1000) - 86400,
				lid: "expired-license",
				cust: "Expired Customer",
				limits: { noticesPerMonth: 100, maxUsers: 10 },
				features: [],
			};

			const token = await signLicense(payload, testKeyPair.privateKey);
			const decoded = decodeLicensePayload(token);

			expect(decoded).not.toBeNull();
			expect(decoded?.lid).toBe("expired-license");
		});
	});
});
