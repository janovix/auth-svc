/**
 * License domain exports
 */

// Types
export type {
	LicenseLimits,
	EnterpriseLicensePayload,
	EnterpriseLicense,
	LicenseStatus,
	LicenseVerificationResult,
} from "./types";

// Schemas and schema-derived types (use Zod-inferred types)
export {
	licenseLimitsSchema,
	generateLicenseInputSchema,
	activateLicenseInputSchema,
	verifyLicenseInputSchema,
	revokeLicenseInputSchema,
} from "./schemas";

export type {
	GenerateLicenseInput,
	ActivateLicenseInput,
	VerifyLicenseInput,
	RevokeLicenseInput,
} from "./schemas";

// Repository and Service
export { LicenseRepository } from "./repository";
export { LicenseService } from "./service";

// JWT utilities
export {
	signLicense,
	verifyLicense,
	createLicensePayload,
	decodeLicensePayload,
	generateKeyPair,
} from "./jwt-utils";
