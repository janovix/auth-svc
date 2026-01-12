#!/usr/bin/env node
/**
 * Seed Subscription Plans
 *
 * Creates subscription plans in the database with their Stripe price IDs.
 * This should be run after creating the products/prices in Stripe Dashboard.
 */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Subscription plans configuration
// Update these Stripe Price IDs when setting up a new environment
const PLANS = [
	{
		id: "plan-business-monthly",
		name: "Business",
		tier: "business",
		billingInterval: "month",
		stripePriceId: "price_1SoaP3A9qUPmowPeSsX2cRsS", // Dev environment
		basePrice: 9999, // MXN centavos (9,999.00)
		noticesIncluded: 50,
		usersIncluded: 5,
		transactionsIncluded: null,
		alertsIncluded: null,
		overagePriceId: null,
		overagePrice: 20,
		features: [
			"data_capture",
			"compliance_validation",
			"report_generation",
			"acknowledgment_tracking",
		],
		active: true,
	},
	{
		id: "plan-pro-monthly",
		name: "Pro",
		tier: "pro",
		billingInterval: "month",
		stripePriceId: "price_1SoaPTA9qUPmowPeWQ5UuqEz", // Dev environment
		basePrice: 19999, // MXN centavos (19,999.00)
		noticesIncluded: 150,
		usersIncluded: 10,
		transactionsIncluded: null,
		alertsIncluded: null,
		overagePriceId: null,
		overagePrice: 15,
		features: [
			"data_capture",
			"compliance_validation",
			"report_generation",
			"acknowledgment_tracking",
			"advanced_roles",
			"approval_flows",
			"report_templates",
			"priority_support",
		],
		active: true,
	},
];

function escapeSqlString(str) {
	if (str === null || str === undefined) return "NULL";
	return `'${String(str).replace(/'/g, "''")}'`;
}

function generateSql() {
	const values = PLANS.map((plan) => {
		const id = escapeSqlString(plan.id);
		const name = escapeSqlString(plan.name);
		const tier = escapeSqlString(plan.tier);
		const billingInterval = escapeSqlString(plan.billingInterval);
		const stripePriceId = escapeSqlString(plan.stripePriceId);
		const basePrice = plan.basePrice;
		const noticesIncluded = plan.noticesIncluded;
		const usersIncluded = plan.usersIncluded;
		const transactionsIncluded =
			plan.transactionsIncluded !== null ? plan.transactionsIncluded : "NULL";
		const alertsIncluded =
			plan.alertsIncluded !== null ? plan.alertsIncluded : "NULL";
		const overagePriceId =
			plan.overagePriceId !== null
				? escapeSqlString(plan.overagePriceId)
				: "NULL";
		const overagePrice =
			plan.overagePrice !== null ? plan.overagePrice : "NULL";
		const features = escapeSqlString(JSON.stringify(plan.features));
		const active = plan.active ? 1 : 0;

		return `(
    ${id},
    ${name},
    ${tier},
    ${billingInterval},
    ${stripePriceId},
    ${basePrice},
    ${noticesIncluded},
    ${usersIncluded},
    ${transactionsIncluded},
    ${alertsIncluded},
    ${overagePriceId},
    ${overagePrice},
    ${features},
    ${active},
    datetime('now'),
    datetime('now')
)`;
	}).join(",\n");

	const sql = `-- Seed subscription plans
-- Generated: ${new Date().toISOString()}

INSERT INTO subscription_plans (
    id, name, tier, billing_interval, stripe_price_id, base_price,
    notices_included, users_included, transactions_included, alerts_included,
    overage_price_id, overage_price, features, active, created_at, updated_at
) VALUES 
${values}
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    tier = excluded.tier,
    billing_interval = excluded.billing_interval,
    stripe_price_id = excluded.stripe_price_id,
    base_price = excluded.base_price,
    notices_included = excluded.notices_included,
    users_included = excluded.users_included,
    transactions_included = excluded.transactions_included,
    alerts_included = excluded.alerts_included,
    overage_price_id = excluded.overage_price_id,
    overage_price = excluded.overage_price,
    features = excluded.features,
    active = excluded.active,
    updated_at = datetime('now');
`;

	return sql;
}

async function seedPlans() {
	const isRemote = process.env.CI === "true" || process.env.REMOTE === "true";
	// Use WRANGLER_CONFIG if set, otherwise detect preview environment
	let configFile = process.env.WRANGLER_CONFIG;
	if (!configFile) {
		if (
			process.env.CF_PAGES_BRANCH ||
			(process.env.WORKERS_CI_BRANCH &&
				process.env.WORKERS_CI_BRANCH !== "main") ||
			process.env.PREVIEW === "true"
		) {
			configFile = "wrangler.preview.jsonc";
		}
	}
	const configFlag = configFile ? `--config ${configFile}` : "";

	try {
		console.log(
			`🌱 Seeding subscription plans (${isRemote ? "remote" : "local"})...`,
		);

		// Generate SQL
		const sql = generateSql();
		const sqlFile = join(__dirname, `temp-plans-${Date.now()}.sql`);

		try {
			writeFileSync(sqlFile, sql);

			// Execute SQL
			const command = isRemote
				? `wrangler d1 execute DB ${configFlag} --remote --file "${sqlFile}"`
				: `wrangler d1 execute DB ${configFlag} --local --file "${sqlFile}"`;

			execSync(command, { stdio: "inherit" });

			console.log(`✅ Subscription plans seeding completed:`);
			PLANS.forEach((plan) => {
				console.log(
					`   - ${plan.name} (${plan.tier}): ${plan.basePrice / 100} MXN/month`,
				);
			});
		} finally {
			// Clean up temp file
			try {
				unlinkSync(sqlFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	} catch (error) {
		console.error("❌ Error seeding subscription plans:", error);
		throw error;
	}
}

// If run directly, execute seed
seedPlans().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
