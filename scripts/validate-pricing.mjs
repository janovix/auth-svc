#!/usr/bin/env node
/**
 * Validate Pricing Configuration
 *
 * Checks that the database has correct limits and prices that match
 * the business requirements. Also validates Stripe price IDs are configured.
 *
 * Usage:
 *   node scripts/validate-pricing.mjs                    # Local dev
 *   REMOTE=true node scripts/validate-pricing.mjs       # Remote dev
 *   ENV=preview REMOTE=true node scripts/validate-pricing.mjs   # Preview
 *   ENV=prod REMOTE=true node scripts/validate-pricing.mjs      # Production
 */

import { execSync } from "node:child_process";

// =============================================================================
// EXPECTED BUSINESS VALUES (January 2026)
// =============================================================================

const EXPECTED_LIMITS = {
	business: {
		maxOrganizations: 1,
		usersPerOrg: 2,
		reportsPerMonth: 1,
		noticesPerMonth: 2,
		alertsPerMonth: 20,
		operationsPerMonth: 50,
		clientsPerMonth: 25,
	},
	pro: {
		maxOrganizations: 3,
		usersPerOrg: 10,
		reportsPerMonth: 15,
		noticesPerMonth: 20,
		alertsPerMonth: 100,
		operationsPerMonth: 500,
		clientsPerMonth: 250,
	},
	ultra: {
		maxOrganizations: 10,
		usersPerOrg: 20,
		reportsPerMonth: 100,
		noticesPerMonth: 100,
		alertsPerMonth: 500,
		operationsPerMonth: 2000,
		clientsPerMonth: 1000,
	},
};

const EXPECTED_PRICES = {
	business: {
		subscription: 299999, // $2,999.99 MXN
		seat: 59999, // $599.99 MXN
		extra_org: 149999, // $1,499.99 MXN
		overage_report: 49999, // $499.99 MXN
		overage_notice: 39999, // $399.99 MXN
		overage_alert: 7999, // $79.99 MXN
		overage_operation: 1499, // $14.99 MXN
		overage_client: 2999, // $29.99 MXN
	},
	pro: {
		subscription: 999999, // $9,999.99 MXN
		seat: 59999, // $599.99 MXN
		extra_org: 149999, // $1,499.99 MXN
		overage_report: 49999, // $499.99 MXN
		overage_notice: 39999, // $399.99 MXN
		overage_alert: 7999, // $79.99 MXN
		overage_operation: 1499, // $14.99 MXN
		overage_client: 2999, // $29.99 MXN
	},
	ultra: {
		subscription: 1999999, // $19,999.99 MXN
		seat: 59999, // $599.99 MXN
		extra_org: 149999, // $1,499.99 MXN
		overage_report: 49999, // $499.99 MXN
		overage_notice: 39999, // $399.99 MXN
		overage_alert: 7999, // $79.99 MXN
		overage_operation: 1499, // $14.99 MXN
		overage_client: 2999, // $29.99 MXN
	},
};

// =============================================================================
// DATABASE QUERIES
// =============================================================================

function runQuery(query, env, isRemote, configFlag) {
	const command = isRemote
		? `wrangler d1 execute DB ${configFlag} --remote --command "${query}" --json`
		: `wrangler d1 execute DB ${configFlag} --local --command "${query}" --json`;

	try {
		const result = execSync(command, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		const parsed = JSON.parse(result);
		return parsed[0]?.results || [];
	} catch (error) {
		console.error(`Query failed: ${query}`);
		console.error(error.message);
		return [];
	}
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

function validateLimits(dbLimits, issues) {
	console.log("\n📊 Validating Plan Limits...\n");

	for (const [planName, expected] of Object.entries(EXPECTED_LIMITS)) {
		const dbLimit = dbLimits.find((l) => l.plan_id === `plan_${planName}`);

		if (!dbLimit) {
			issues.push(`❌ Missing limits for plan: ${planName}`);
			continue;
		}

		console.log(`  ${planName.toUpperCase()}:`);

		const checks = [
			["max_organizations", expected.maxOrganizations],
			["users_per_org", expected.usersPerOrg],
			["reports_per_month", expected.reportsPerMonth],
			["notices_per_month", expected.noticesPerMonth],
			["alerts_per_month", expected.alertsPerMonth],
			["operations_per_month", expected.operationsPerMonth],
			["clients_per_month", expected.clientsPerMonth],
		];

		for (const [field, expectedValue] of checks) {
			const actualValue = dbLimit[field];
			if (actualValue === expectedValue) {
				console.log(`    ✅ ${field}: ${actualValue}`);
			} else {
				console.log(
					`    ❌ ${field}: ${actualValue} (expected: ${expectedValue})`,
				);
				issues.push(
					`${planName}.${field}: got ${actualValue}, expected ${expectedValue}`,
				);
			}
		}
	}
}

function validatePrices(dbPrices, issues) {
	console.log("\n💰 Validating Plan Prices...\n");

	for (const [planName, expected] of Object.entries(EXPECTED_PRICES)) {
		console.log(`  ${planName.toUpperCase()}:`);

		for (const [priceType, expectedAmount] of Object.entries(expected)) {
			const dbPrice = dbPrices.find(
				(p) => p.plan_id === `plan_${planName}` && p.price_type === priceType,
			);

			if (!dbPrice) {
				console.log(`    ❌ ${priceType}: MISSING`);
				issues.push(`${planName}.${priceType}: price not found in database`);
				continue;
			}

			const amountMatch = dbPrice.amount === expectedAmount;
			const hasStripeId =
				dbPrice.stripe_price_id &&
				!dbPrice.stripe_price_id.includes("REPLACE") &&
				!dbPrice.stripe_price_id.includes("placeholder");

			if (amountMatch && hasStripeId) {
				console.log(
					`    ✅ ${priceType}: $${(dbPrice.amount / 100).toLocaleString()} MXN (Stripe: configured)`,
				);
			} else if (amountMatch && !hasStripeId) {
				console.log(
					`    ⚠️  ${priceType}: $${(dbPrice.amount / 100).toLocaleString()} MXN (Stripe: NOT CONFIGURED)`,
				);
				issues.push(
					`${planName}.${priceType}: Stripe price ID not configured (${dbPrice.stripe_price_id})`,
				);
			} else {
				console.log(
					`    ❌ ${priceType}: $${(dbPrice.amount / 100).toLocaleString()} MXN (expected: $${(expectedAmount / 100).toLocaleString()} MXN)`,
				);
				issues.push(
					`${planName}.${priceType}: amount is ${dbPrice.amount}, expected ${expectedAmount}`,
				);
			}
		}
	}
}

function validatePlans(dbPlans, issues) {
	console.log("\n📋 Validating Plans...\n");

	const expectedPlans = ["business", "pro", "ultra"];

	for (const planName of expectedPlans) {
		const dbPlan = dbPlans.find((p) => p.name === planName);
		if (dbPlan) {
			console.log(`  ✅ ${planName}: ${dbPlan.display_name}`);
		} else {
			console.log(`  ❌ ${planName}: NOT FOUND`);
			issues.push(`Plan "${planName}" not found in database`);
		}
	}
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function validatePricing() {
	const env = process.env.ENV || "dev";
	const isRemote = process.env.CI === "true" || process.env.REMOTE === "true";

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
║               JANOVIX PRICING VALIDATOR                          ║
╠══════════════════════════════════════════════════════════════════╣
║  Environment:  ${env.padEnd(48)}║
║  Remote:       ${(isRemote ? "yes" : "no (local)").padEnd(48)}║
║  Config:       ${(configFile || "default").padEnd(48)}║
╚══════════════════════════════════════════════════════════════════╝`);

	const issues = [];

	// Fetch data from database
	console.log("\n🔍 Fetching data from database...");

	const dbPlans = runQuery(
		"SELECT id, name, display_name FROM subscription_plans",
		env,
		isRemote,
		configFlag,
	);

	const dbLimits = runQuery(
		"SELECT * FROM plan_limits",
		env,
		isRemote,
		configFlag,
	);

	const dbPrices = runQuery(
		"SELECT * FROM plan_prices WHERE is_active = 1",
		env,
		isRemote,
		configFlag,
	);

	if (dbPlans.length === 0 && dbLimits.length === 0 && dbPrices.length === 0) {
		console.log(
			"\n⚠️  No data found in database. Have you run seed-plans.mjs?",
		);
		console.log("   Run: node scripts/seed-plans.mjs");
		process.exit(1);
	}

	// Validate
	validatePlans(dbPlans, issues);
	validateLimits(dbLimits, issues);
	validatePrices(dbPrices, issues);

	// Summary
	console.log("\n" + "=".repeat(68));

	if (issues.length === 0) {
		console.log(`
✅ ALL VALIDATIONS PASSED!

Your pricing configuration matches the business requirements:
  • Business: $2,999/month, 1 org, 2 users/org
  • Pro: $9,999/month, 3 orgs, 10 users/org
  • Ultra: $19,999/month, 10 orgs, 20 users/org

Extra/Overage pricing is correctly configured.
`);
		process.exit(0);
	} else {
		console.log(`
❌ VALIDATION FAILED - ${issues.length} issue(s) found:
`);
		for (const issue of issues) {
			console.log(`  • ${issue}`);
		}
		console.log(`
To fix these issues:
  1. Update seed-plans.mjs with correct values
  2. Run: node scripts/seed-plans.mjs
  3. For Stripe price IDs, create prices in Stripe Dashboard
     and update STRIPE_IDS in seed-plans.mjs
`);
		process.exit(1);
	}
}

validatePricing().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
