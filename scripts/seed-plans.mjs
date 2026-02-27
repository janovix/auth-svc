#!/usr/bin/env node
/**
 * Seed Subscription Plans, Prices, and Limits
 *
 * Creates subscription plans, their prices (with Stripe IDs), and limits in the database.
 * This should be run after creating the products/prices in Stripe Dashboard.
 *
 * Usage:
 *   node scripts/seed-plans.mjs                           # Local dev (defaults to 'dev' environment)
 *   ENV=local node scripts/seed-plans.mjs                 # Local dev with separate Stripe account
 *   REMOTE=true node scripts/seed-plans.mjs               # Remote dev
 *   ENV=preview REMOTE=true node scripts/seed-plans.mjs   # Preview
 *   ENV=prod REMOTE=true node scripts/seed-plans.mjs      # Production
 */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// ENVIRONMENT-SPECIFIC STRIPE IDS
// =============================================================================
// Update these Stripe IDs when setting up each environment.
// Get these from your Stripe Dashboard after creating products and prices.

const STRIPE_IDS = {
	// Local development environment (separate Stripe account)
	local: {
		watchlist: {
			subscription: "price_1SxrWOPFcJmmJgfAhM7BbYZ6",
			seat: "price_1SxsF8PFcJmmJgfANp38kpW4",
		},
		business: {
			subscription: "price_1SxrVOPFcJmmJgfAPoCqKteA",
			seat: "price_1SxrWbPFcJmmJgfAMjD5boQ7",
			extra_org: "price_1SxrWoPFcJmmJgfA4H9V89NZ",
			overage_report: "price_1SxrYNPFcJmmJgfAIgql5fAf",
			overage_notice: "price_1SxrYAPFcJmmJgfA40h8UksB",
			overage_client: "price_1SxrXdPFcJmmJgfANuZchO6X",
			overage_operation: "price_1SxrXPPFcJmmJgfAjOqEy9MH",
			overage_alert: "price_1SxrXwPFcJmmJgfAqSwOD9q9",
		},
		pro: {
			subscription: "price_1SxrVjPFcJmmJgfARQdlCT1X",
			seat: "price_1SxrWbPFcJmmJgfAMjD5boQ7",
			extra_org: "price_1SxrWoPFcJmmJgfA4H9V89NZ",
			overage_report: "price_1SxrYNPFcJmmJgfAIgql5fAf",
			overage_notice: "price_1SxrYAPFcJmmJgfA40h8UksB",
			overage_client: "price_1SxrXdPFcJmmJgfANuZchO6X",
			overage_operation: "price_1SxrXPPFcJmmJgfAjOqEy9MH",
			overage_alert: "price_1SxrXwPFcJmmJgfAqSwOD9q9",
		},
		ultra: {
			subscription: "price_1SxrWCPFcJmmJgfAIsvKSSdt",
			seat: "price_1SxrWbPFcJmmJgfAMjD5boQ7",
			extra_org: "price_1SxrWoPFcJmmJgfA4H9V89NZ",
			overage_report: "price_1SxrYNPFcJmmJgfAIgql5fAf",
			overage_notice: "price_1SxrYAPFcJmmJgfA40h8UksB",
			overage_client: "price_1SxrXdPFcJmmJgfANuZchO6X",
			overage_operation: "price_1SxrXPPFcJmmJgfAjOqEy9MH",
			overage_alert: "price_1SxrXwPFcJmmJgfAqSwOD9q9",
		},
	},
	// Development environment
	dev: {
		watchlist: {
			subscription: "price_1SpaSPA9qUPmowPeyC25PZwM",
			seat: "price_1SpHLEA9qUPmowPe7eb7yxwP",
		},
		business: {
			subscription: "price_1Spb4jA9qUPmowPe47LOiLE3",
			seat: "price_1SpHLEA9qUPmowPe7eb7yxwP",
			extra_org: "price_1SpaGEA9qUPmowPeLNfz70y3",
			overage_report: "price_1SpXE3A9qUPmowPezcwmvPmn",
			overage_notice: "price_1SpXDsA9qUPmowPePqapNz3a",
			overage_client: "price_1SpXChA9qUPmowPeGRfLqnzI",
			overage_operation: "price_1SpWihA9qUPmowPeEPuBSOXK",
			overage_alert: "price_1SpHKdA9qUPmowPenLSlPMjp",
		},
		pro: {
			subscription: "price_1Spb5cA9qUPmowPexCafPr3C",
			seat: "price_1SpHLEA9qUPmowPe7eb7yxwP",
			extra_org: "price_1SpaGEA9qUPmowPeLNfz70y3",
			overage_report: "price_1SpXE3A9qUPmowPezcwmvPmn",
			overage_notice: "price_1SpXDsA9qUPmowPePqapNz3a",
			overage_client: "price_1SpXChA9qUPmowPeGRfLqnzI",
			overage_operation: "price_1SpWihA9qUPmowPeEPuBSOXK",
			overage_alert: "price_1SpHKdA9qUPmowPenLSlPMjp",
		},
		ultra: {
			subscription: "price_1SpaU4A9qUPmowPeQmflgSGy",
			seat: "price_1SpHLEA9qUPmowPe7eb7yxwP",
			extra_org: "price_1SpaGEA9qUPmowPeLNfz70y3",
			overage_report: "price_1SpXE3A9qUPmowPezcwmvPmn",
			overage_notice: "price_1SpXDsA9qUPmowPePqapNz3a",
			overage_client: "price_1SpXChA9qUPmowPeGRfLqnzI",
			overage_operation: "price_1SpWihA9qUPmowPeEPuBSOXK",
			overage_alert: "price_1SpHKdA9qUPmowPenLSlPMjp",
		},
	},
	// Preview/staging environment
	preview: {
		watchlist: {
			subscription: "price_placeholder_preview_watchlist_subscription",
			seat: "price_1SpHLEA9qUPmowPe7eb7yxwP",
		},
		business: {
			subscription: "price_1Spb4jA9qUPmowPe47LOiLE3",
			seat: "price_1SpHLEA9qUPmowPe7eb7yxwP",
			extra_org: "price_1SpaGEA9qUPmowPeLNfz70y3",
			overage_report: "price_1SpXE3A9qUPmowPezcwmvPmn",
			overage_notice: "price_1SpXDsA9qUPmowPePqapNz3a",
			overage_client: "price_1SpXChA9qUPmowPeGRfLqnzI",
			overage_operation: "price_1SpWihA9qUPmowPeEPuBSOXK",
			overage_alert: "price_1SpHKdA9qUPmowPenLSlPMjp",
		},
		pro: {
			subscription: "price_1Spb5cA9qUPmowPexCafPr3C",
			seat: "price_1SpHLEA9qUPmowPe7eb7yxwP",
			extra_org: "price_1SpaGEA9qUPmowPeLNfz70y3",
			overage_report: "price_1SpXE3A9qUPmowPezcwmvPmn",
			overage_notice: "price_1SpXDsA9qUPmowPePqapNz3a",
			overage_client: "price_1SpXChA9qUPmowPeGRfLqnzI",
			overage_operation: "price_1SpWihA9qUPmowPeEPuBSOXK",
			overage_alert: "price_1SpHKdA9qUPmowPenLSlPMjp",
		},
		ultra: {
			subscription: "price_1SpaU4A9qUPmowPeQmflgSGy",
			seat: "price_1SpHLEA9qUPmowPe7eb7yxwP",
			extra_org: "price_1SpaGEA9qUPmowPeLNfz70y3",
			overage_report: "price_1SpXE3A9qUPmowPezcwmvPmn",
			overage_notice: "price_1SpXDsA9qUPmowPePqapNz3a",
			overage_client: "price_1SpXChA9qUPmowPeGRfLqnzI",
			overage_operation: "price_1SpWihA9qUPmowPeEPuBSOXK",
			overage_alert: "price_1SpHKdA9qUPmowPenLSlPMjp",
		},
	},
	// Production/main environment
	prod: {
		watchlist: {
			subscription: "price_1T2kA2ChjjpnvIjaKQLFPclO",
			seat: "price_1T2kXnChjjpnvIjaQ7COftNO",
		},
		business: {
			subscription: "price_1T2kD2ChjjpnvIja9Pez74N7",
			seat: "price_1T2kXnChjjpnvIjaQ7COftNO",
			extra_org: "price_1T2kWMChjjpnvIjauosrvgU0",
			overage_report: "price_1T2kuYChjjpnvIjaquUR3zuY",
			overage_notice: "price_1T2ktgChjjpnvIjakMXCnubW",
			overage_client: "price_1T2kruChjjpnvIjaY2BQ99zp",
			overage_operation: "price_1T2ksbChjjpnvIjaRAeh7wov",
			overage_alert: "price_1T4AauChjjpnvIjanYWJu3vG",
		},
		pro: {
			subscription: "price_1T2kEDChjjpnvIjaj3RZyn1m",
			seat: "price_1T2kXnChjjpnvIjaQ7COftNO",
			extra_org: "price_1T2kWMChjjpnvIjauosrvgU0",
			overage_report: "price_1T2kuYChjjpnvIjaquUR3zuY",
			overage_notice: "price_1T2ktgChjjpnvIjakMXCnubW",
			overage_client: "price_1T2kruChjjpnvIjaY2BQ99zp",
			overage_operation: "price_1T2ksbChjjpnvIjaRAeh7wov",
			overage_alert: "price_1T4AauChjjpnvIjanYWJu3vG",
		},
		ultra: {
			subscription: "price_1T2kEeChjjpnvIja5r0ekHO9",
			seat: "price_1T2kXnChjjpnvIjaQ7COftNO",
			extra_org: "price_1T2kWMChjjpnvIjauosrvgU0",
			overage_report: "price_1T2kuYChjjpnvIjaquUR3zuY",
			overage_notice: "price_1T2ktgChjjpnvIjakMXCnubW",
			overage_client: "price_1T2kruChjjpnvIjaY2BQ99zp",
			overage_operation: "price_1T2ksbChjjpnvIjaRAeh7wov",
			overage_alert: "price_1T4AauChjjpnvIjanYWJu3vG",
		},
	},
};

// =============================================================================
// PLAN DEFINITIONS (shared across all environments)
// =============================================================================
// Plan naming convention:
// - watchlist: Watchlist-only access (no AML)
// - aml_*: AML plans (includes Watchlist access)
// Product features:
// - product_watchlist: Access to Watchlist product
// - product_aml: Access to AML product (includes Watchlist)

const PLANS = [
	{
		id: "plan_watchlist",
		name: "watchlist",
		displayName: "Watchlist",
		description: "Acceso solo a consultas de listas de vigilancia",
		features: ["product_watchlist"],
	},
	{
		id: "plan_aml_business",
		name: "business",
		displayName: "AML Business",
		description: "Plan ideal para pequeñas y medianas empresas",
		features: [
			"product_aml",
			"product_watchlist",
			"data_capture",
			"compliance_validation",
			"report_generation",
			"acknowledgment_tracking",
		],
	},
	{
		id: "plan_aml_pro",
		name: "pro",
		displayName: "AML Pro",
		description: "Plan avanzado para empresas con mayor volumen de operaciones",
		features: [
			"product_aml",
			"product_watchlist",
			"data_capture",
			"compliance_validation",
			"report_generation",
			"acknowledgment_tracking",
			"advanced_roles",
			"approval_flows",
			"report_templates",
			"priority_support",
		],
	},
	{
		id: "plan_aml_ultra",
		name: "ultra",
		displayName: "AML Ultra",
		description:
			"Plan empresarial para grandes corporaciones con operaciones de alto volumen",
		features: [
			"product_aml",
			"product_watchlist",
			"data_capture",
			"compliance_validation",
			"report_generation",
			"acknowledgment_tracking",
			"advanced_roles",
			"approval_flows",
			"report_templates",
			"priority_support",
			"dedicated_support",
			"custom_integrations",
			"sla_guarantee",
		],
	},
];

// =============================================================================
// PLAN LIMITS (shared across all environments)
// =============================================================================

// Plan limits aligned with business pricing model (February 2026)
// - watchlistQueriesPerMonth: Per-organization monthly limit for watchlist queries
//   Monthly total is computed by SUMming organization_daily_usage within the billing period.
const PLAN_LIMITS = {
	watchlist: {
		maxOrganizations: 1,
		usersPerOrg: 1,
		reportsPerMonth: 0,
		noticesPerMonth: 0,
		alertsPerMonth: 0,
		operationsPerMonth: 0,
		clientsPerMonth: 0,
		watchlistQueriesPerMonth: 50,
	},
	business: {
		maxOrganizations: 1,
		usersPerOrg: 2,
		reportsPerMonth: 1,
		noticesPerMonth: 2,
		alertsPerMonth: 20,
		operationsPerMonth: 50,
		clientsPerMonth: 25,
		watchlistQueriesPerMonth: 100,
	},
	pro: {
		maxOrganizations: 3,
		usersPerOrg: 10,
		reportsPerMonth: 15,
		noticesPerMonth: 20,
		alertsPerMonth: 100,
		operationsPerMonth: 500,
		clientsPerMonth: 250,
		watchlistQueriesPerMonth: 600,
	},
	ultra: {
		maxOrganizations: 10,
		usersPerOrg: 20,
		reportsPerMonth: 100,
		noticesPerMonth: 100,
		alertsPerMonth: 500,
		operationsPerMonth: 2000,
		clientsPerMonth: 1000,
		watchlistQueriesPerMonth: 1000,
	},
};

// =============================================================================
// PRICE DEFINITIONS (amounts in centavos MXN)
// Pricing aligned with business model (January 2026)
// - Subscription: Base monthly fee
// - Seat: Extra user per org per month ($599 = 59900 centavos)
// - Extra Org: Additional organization per month ($1,499 = 149900 centavos)
// - Overages: Usage-based charges for exceeding limits
// =============================================================================

const PRICES = {
	watchlist: [
		{
			id: "price_watchlist_monthly",
			priceType: "subscription",
			amount: 49900, // $499 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Suscripción mensual Janovix Watchlist",
		},
		{
			id: "price_watchlist_seat",
			priceType: "seat",
			amount: 59900, // $599 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Usuario Extra",
		},
	],
	business: [
		{
			id: "price_aml_business_monthly",
			priceType: "subscription",
			amount: 299900, // $2,999 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Suscripción mensual Janovix AML Business",
		},
		{
			id: "price_aml_business_seat",
			priceType: "seat",
			amount: 59900, // $599 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Usuario Extra",
		},
		{
			id: "price_aml_business_extra_org",
			priceType: "extra_org",
			amount: 149900, // $1,499 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Organización Extra",
		},
		{
			id: "price_aml_business_report_overage",
			priceType: "overage_report",
			amount: 49900, // $499 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Reporte Extra",
		},
		{
			id: "price_aml_business_notice_overage",
			priceType: "overage_notice",
			amount: 39900, // $399 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Aviso Extra",
		},
		{
			id: "price_aml_business_client_overage",
			priceType: "overage_client",
			amount: 2900, // $29 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Cliente Extra",
		},
		{
			id: "price_aml_business_operation_overage",
			priceType: "overage_operation",
			amount: 1500, // $15 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Operación Extra",
		},
		{
			id: "price_aml_business_alert_overage",
			priceType: "overage_alert",
			amount: 7900, // $79 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Alerta Extra",
		},
	],
	pro: [
		{
			id: "price_aml_pro_monthly",
			priceType: "subscription",
			amount: 999900, // $9,999 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Suscripción mensual Janovix AML Pro",
		},
		{
			id: "price_aml_pro_seat",
			priceType: "seat",
			amount: 59900, // $599 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Usuario Extra",
		},
		{
			id: "price_aml_pro_extra_org",
			priceType: "extra_org",
			amount: 149900, // $1,499 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Organización Extra",
		},
		{
			id: "price_aml_pro_report_overage",
			priceType: "overage_report",
			amount: 49900, // $499 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Reporte Extra",
		},
		{
			id: "price_aml_pro_notice_overage",
			priceType: "overage_notice",
			amount: 39900, // $399 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Aviso Extra",
		},
		{
			id: "price_aml_pro_client_overage",
			priceType: "overage_client",
			amount: 2900, // $29 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Cliente Extra",
		},
		{
			id: "price_aml_pro_operation_overage",
			priceType: "overage_operation",
			amount: 1500, // $15 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Operación Extra",
		},
		{
			id: "price_aml_pro_alert_overage",
			priceType: "overage_alert",
			amount: 7900, // $79 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Alerta Extra",
		},
	],
	ultra: [
		{
			id: "price_aml_ultra_monthly",
			priceType: "subscription",
			amount: 1999900, // $19,999 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Suscripción mensual Janovix AML Ultra",
		},
		{
			id: "price_aml_ultra_seat",
			priceType: "seat",
			amount: 59900, // $599 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Usuario Extra",
		},
		{
			id: "price_aml_ultra_extra_org",
			priceType: "extra_org",
			amount: 149900, // $1,499 MXN
			currency: "MXN",
			interval: "month",
			intervalCount: 1,
			description: "Organización Extra",
		},
		{
			id: "price_aml_ultra_report_overage",
			priceType: "overage_report",
			amount: 49900, // $499 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Reporte Extra",
		},
		{
			id: "price_aml_ultra_notice_overage",
			priceType: "overage_notice",
			amount: 39900, // $399 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Aviso Extra",
		},
		{
			id: "price_aml_ultra_client_overage",
			priceType: "overage_client",
			amount: 2900, // $29 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Cliente Extra",
		},
		{
			id: "price_aml_ultra_operation_overage",
			priceType: "overage_operation",
			amount: 1500, // $15 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Operación Extra",
		},
		{
			id: "price_aml_ultra_alert_overage",
			priceType: "overage_alert",
			amount: 7900, // $79 MXN
			currency: "MXN",
			interval: null,
			intervalCount: null,
			description: "Alerta Extra",
		},
	],
};

// =============================================================================
// SQL GENERATION
// =============================================================================

function escapeSqlString(str) {
	if (str === null || str === undefined) return "NULL";
	return `'${String(str).replace(/'/g, "''")}'`;
}

function getStripeId(env, planName, priceType) {
	const envIds = STRIPE_IDS[env];
	if (!envIds) {
		throw new Error(`Unknown environment: ${env}`);
	}
	const planIds = envIds[planName];
	if (!planIds) {
		throw new Error(`Unknown plan: ${planName}`);
	}
	return (
		planIds[priceType] || `price_placeholder_${env}_${planName}_${priceType}`
	);
}

function generateSql(env) {
	const now = new Date().toISOString();
	let sql = `-- Seed subscription plans, prices, and limits
-- Environment: ${env}
-- Generated: ${now}

`;

	// 0. Clear existing prices to avoid UNIQUE constraint conflicts on stripe_price_id
	// (Stripe price IDs may be shared across plans in dev/preview environments)
	sql += `-- ========================================
-- CLEAR EXISTING DATA (to avoid UNIQUE conflicts)
-- ========================================
DELETE FROM plan_prices WHERE plan_id IN ('plan_watchlist', 'plan_aml_business', 'plan_aml_pro', 'plan_aml_ultra', 'plan_business', 'plan_pro', 'plan_ultra');
DELETE FROM plan_limits WHERE plan_id IN ('plan_watchlist', 'plan_aml_business', 'plan_aml_pro', 'plan_aml_ultra', 'plan_business', 'plan_pro', 'plan_ultra');
DELETE FROM subscription_plans WHERE id IN ('plan_business', 'plan_pro', 'plan_ultra');

`;

	// 1. Insert/Update plans
	// Note: features are stored in 'metadata' column as JSON (schema doesn't have 'features' column)
	sql += `-- ========================================
-- SUBSCRIPTION PLANS
-- ========================================
`;
	for (const plan of PLANS) {
		const metadata = JSON.stringify({ features: plan.features });
		sql += `INSERT INTO subscription_plans (id, name, display_name, description, metadata, created_at, updated_at)
VALUES (
    ${escapeSqlString(plan.id)},
    ${escapeSqlString(plan.name)},
    ${escapeSqlString(plan.displayName)},
    ${escapeSqlString(plan.description)},
    ${escapeSqlString(metadata)},
    datetime('now'),
    datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    display_name = excluded.display_name,
    description = excluded.description,
    metadata = excluded.metadata,
    updated_at = datetime('now');

`;
	}

	// 2. Insert/Update plan limits
	sql += `-- ========================================
-- PLAN LIMITS
-- ========================================
`;
	for (const plan of PLANS) {
		const limits = PLAN_LIMITS[plan.name];
		// Using simple INSERT since we DELETE first (avoids UNIQUE constraint issues)
		sql += `INSERT INTO plan_limits (id, plan_id, max_organizations, users_per_org, reports_per_month, notices_per_month, alerts_per_month, operations_per_month, clients_per_month, watchlist_queries_per_month, created_at, updated_at)
VALUES (
    ${escapeSqlString(`limit_${plan.name}`)},
    ${escapeSqlString(plan.id)},
    ${limits.maxOrganizations},
    ${limits.usersPerOrg},
    ${limits.reportsPerMonth},
    ${limits.noticesPerMonth},
    ${limits.alertsPerMonth},
    ${limits.operationsPerMonth},
    ${limits.clientsPerMonth},
    ${limits.watchlistQueriesPerMonth},
    datetime('now'),
    datetime('now')
);

`;
	}

	// 3. Insert/Update prices with environment-specific Stripe IDs
	sql += `-- ========================================
-- PLAN PRICES (with ${env} Stripe IDs)
-- ========================================
`;
	for (const plan of PLANS) {
		const prices = PRICES[plan.name];
		for (const price of prices) {
			const stripePriceId = getStripeId(env, plan.name, price.priceType);
			// Using simple INSERT since we DELETE first (avoids UNIQUE constraint on stripe_price_id)
			sql += `INSERT INTO plan_prices (id, plan_id, stripe_price_id, price_type, amount, currency, interval, interval_count, description, is_active, created_at, updated_at)
VALUES (
    ${escapeSqlString(price.id)},
    ${escapeSqlString(plan.id)},
    ${escapeSqlString(stripePriceId)},
    ${escapeSqlString(price.priceType)},
    ${price.amount},
    ${escapeSqlString(price.currency)},
    ${price.interval ? escapeSqlString(price.interval) : "NULL"},
    ${price.intervalCount !== null ? price.intervalCount : "NULL"},
    ${escapeSqlString(price.description)},
    1,
    datetime('now'),
    datetime('now')
);

`;
		}
	}

	return sql;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function seedPlans() {
	// Determine environment
	const env = process.env.ENV || "dev";
	const isRemote = process.env.CI === "true" || process.env.REMOTE === "true";

	// Validate environment
	if (!STRIPE_IDS[env]) {
		console.error(`❌ Unknown environment: ${env}`);
		console.error(
			`   Valid environments: ${Object.keys(STRIPE_IDS).join(", ")}`,
		);
		process.exit(1);
	}

	// Determine wrangler config file
	let configFile = process.env.WRANGLER_CONFIG;
	if (!configFile) {
		if (env === "preview") {
			configFile = "wrangler.preview.jsonc";
		} else if (env === "prod") {
			configFile = "wrangler.prod.jsonc";
		}
	}
	const configFlag = configFile ? `--config ${configFile}` : "";

	console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    JANOVIX PLAN SEEDER                           ║
╠══════════════════════════════════════════════════════════════════╣
║  Environment:  ${env.padEnd(48)}║
║  Remote:       ${(isRemote ? "yes" : "no (local)").padEnd(48)}║
║  Config:       ${(configFile || "default").padEnd(48)}║
╚══════════════════════════════════════════════════════════════════╝
`);

	// Check for placeholder Stripe IDs
	const stripeIds = STRIPE_IDS[env];
	const hasPlaceholders = Object.values(stripeIds).some((planIds) =>
		Object.values(planIds).some((id) => id.includes("REPLACE")),
	);

	if (hasPlaceholders) {
		console.log(`⚠️  WARNING: Some Stripe IDs contain placeholder values!`);
		console.log(
			`   Please update STRIPE_IDS.${env} in seed-plans.mjs with actual Stripe price IDs.`,
		);
		console.log(`   Stripe IDs for ${env}:`);
		for (const [planName, priceIds] of Object.entries(stripeIds)) {
			console.log(`   ${planName}:`);
			for (const [priceType, priceId] of Object.entries(priceIds)) {
				const status = priceId.includes("REPLACE") ? "❌" : "✅";
				console.log(`     ${status} ${priceType}: ${priceId}`);
			}
		}
		console.log("");
	}

	try {
		console.log(`🌱 Generating SQL for ${env} environment...`);

		// Generate SQL
		const sql = generateSql(env);
		const sqlFile = join(__dirname, `temp-seed-${env}-${Date.now()}.sql`);

		try {
			writeFileSync(sqlFile, sql);

			// Execute SQL
			const command = isRemote
				? `wrangler d1 execute DB ${configFlag} --remote --file "${sqlFile}"`
				: `wrangler d1 execute DB ${configFlag} --local --file "${sqlFile}"`;

			console.log(`📡 Executing: ${command}`);
			console.log("");
			execSync(command, { stdio: "inherit" });

			console.log(`
✅ Seeding completed successfully!

Plans created/updated:`);
			for (const plan of PLANS) {
				const limits = PLAN_LIMITS[plan.name];
				console.log(`   • ${plan.displayName} (${plan.name})`);
				console.log(
					`     - Max orgs: ${limits.maxOrganizations}, Users/org: ${limits.usersPerOrg}`,
				);
				console.log(
					`     - Notices/mo: ${limits.noticesPerMonth}, Reports/mo: ${limits.reportsPerMonth}`,
				);
				console.log(
					`     - Alerts/mo: ${limits.alertsPerMonth}, Ops/mo: ${limits.operationsPerMonth}`,
				);
				console.log(`     - Clients/mo: ${limits.clientsPerMonth}`);
				console.log(
					`     - Watchlist queries/mo: ${limits.watchlistQueriesPerMonth}`,
				);
			}

			console.log(`
Prices seeded:
   • Watchlist: ${PRICES.watchlist.length} prices
   • AML Business: ${PRICES.business.length} prices
   • AML Pro: ${PRICES.pro.length} prices
   • AML Ultra: ${PRICES.ultra.length} prices

💡 To verify, run:
   ${isRemote ? "REMOTE=true " : ""}node scripts/seed-plans.mjs --verify
`);
		} finally {
			// Clean up temp file
			try {
				unlinkSync(sqlFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	} catch (error) {
		console.error("❌ Error seeding plans:", error);
		throw error;
	}
}

// If run directly, execute seed
seedPlans().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
