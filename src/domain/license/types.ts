/**
 * Enterprise License domain types
 */

import type { Feature } from "../subscription/types";

/**
 * License limits embedded in JWT
 */
export interface LicenseLimits {
	noticesPerMonth: number;
	maxUsers: number;
	maxTransactions?: number;
	maxAlerts?: number;
}

/**
 * Enterprise license JWT payload
 */
export interface EnterpriseLicensePayload {
	// Standard JWT claims
	iss: "janovix.com";
	sub: string; // License ID
	iat: number; // Issued at (Unix timestamp)
	exp: number; // Expiration (Unix timestamp)

	// License-specific claims
	lid: string; // License ID (same as sub)
	cust: string; // Customer name

	// Limits
	limits: LicenseLimits;

	// Features enabled
	features: Feature[];

	// Stripe references (for renewal tracking)
	stripe?: {
		customerId: string;
		subscriptionId: string;
	};
}

/**
 * Enterprise license from database
 */
export interface EnterpriseLicense {
	id: string;
	organizationId: string | null;
	licenseKey: string;
	noticesPerMonth: number;
	maxUsers: number;
	maxTransactions: number | null;
	maxAlerts: number | null;
	features: Feature[];
	stripeSubscriptionId: string | null;
	stripeInvoiceId: string | null;
	issuedAt: Date;
	activatedAt: Date | null;
	expiresAt: Date;
	revokedAt: Date | null;
	issuedBy: string;
	customerName: string | null;
	notes: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Input for generating a new license
 */
export interface GenerateLicenseInput {
	customerName: string;
	limits: LicenseLimits;
	features: Feature[];
	notes?: string;
	// Stripe options (optional - creates yearly subscription if provided)
	stripeCustomerId?: string;
	stripeYearlyPrice?: number; // Custom yearly price in centavos
}

/**
 * License activation input
 */
export interface ActivateLicenseInput {
	licenseKey: string;
	organizationId: string;
}

/**
 * License status for display
 */
export interface LicenseStatus {
	id: string;
	customerName: string | null;
	isActive: boolean;
	isExpired: boolean;
	isRevoked: boolean;
	expiresAt: string;
	daysUntilExpiry: number;
	limits: LicenseLimits;
	features: Feature[];
	activatedAt: string | null;
	organizationId: string | null;
}

/**
 * License verification result
 */
export interface LicenseVerificationResult {
	valid: boolean;
	expired: boolean;
	revoked: boolean;
	payload?: EnterpriseLicensePayload;
	error?: string;
}
