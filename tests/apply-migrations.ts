import { applyD1Migrations, env } from "cloudflare:test";
import type { Bindings } from "../src/types/bindings";

// Setup files run outside isolated storage, and may be run multiple times.
// `applyD1Migrations()` only applies migrations that haven't already been
// applied, therefore it is safe to call this function here.
await applyD1Migrations(env.DB, env.MIGRATIONS);

// Ensure secrets required by auth/cors logic exist during tests.
const bindingsEnv = env as Bindings;
bindingsEnv.AUTH_INTERNAL_TOKEN ??= "test-internal-token";
bindingsEnv.BETTER_AUTH_URL ??= "https://auth-svc.janovix.workers.dev";

// Seed test plans and prices required for Better Auth Stripe plugin
// The auth instance requires watchlist, business, pro, and ultra plans
const testPlans = [
	{
		id: "plan_watchlist",
		name: "watchlist",
		display_name: "Watchlist",
		description: "Test watchlist plan",
	},
	{
		id: "plan_business",
		name: "business",
		display_name: "Business",
		description: "Test business plan",
	},
	{
		id: "plan_pro",
		name: "pro",
		display_name: "Pro",
		description: "Test pro plan",
	},
	{
		id: "plan_ultra",
		name: "ultra",
		display_name: "Ultra",
		description: "Test ultra plan",
	},
];

const testPrices = [
	{
		id: "price_watchlist_monthly",
		plan_id: "plan_watchlist",
		stripe_price_id: "price_test_watchlist",
		price_type: "subscription",
		amount: 0,
	},
	{
		id: "price_business_monthly",
		plan_id: "plan_business",
		stripe_price_id: "price_test_business",
		price_type: "subscription",
		amount: 999900,
	},
	{
		id: "price_pro_monthly",
		plan_id: "plan_pro",
		stripe_price_id: "price_test_pro",
		price_type: "subscription",
		amount: 1999900,
	},
	{
		id: "price_ultra_monthly",
		plan_id: "plan_ultra",
		stripe_price_id: "price_test_ultra",
		price_type: "subscription",
		amount: 3999900,
	},
];

const testLimits = [
	{
		id: "limit_watchlist",
		plan_id: "plan_watchlist",
		max_organizations: 1,
		users_per_org: 1,
		watchlist_queries_per_day: 10,
	},
	{
		id: "limit_business",
		plan_id: "plan_business",
		max_organizations: 1,
		users_per_org: 5,
		watchlist_queries_per_day: 50,
	},
	{
		id: "limit_pro",
		plan_id: "plan_pro",
		max_organizations: 3,
		users_per_org: 10,
		watchlist_queries_per_day: 200,
	},
	{
		id: "limit_ultra",
		plan_id: "plan_ultra",
		max_organizations: 10,
		users_per_org: 50,
		watchlist_queries_per_day: 1000,
	},
];

// Insert test plans
for (const plan of testPlans) {
	await env.DB.prepare(
		`INSERT OR REPLACE INTO subscription_plans (id, name, display_name, description, is_active, sort_order, trial_days, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 0, 14, datetime('now'), datetime('now'))`,
	)
		.bind(plan.id, plan.name, plan.display_name, plan.description)
		.run();
}

// Insert test prices
for (const price of testPrices) {
	await env.DB.prepare(
		`INSERT OR REPLACE INTO plan_prices (id, plan_id, stripe_price_id, price_type, amount, currency, interval, interval_count, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'MXN', 'month', 1, 1, datetime('now'), datetime('now'))`,
	)
		.bind(
			price.id,
			price.plan_id,
			price.stripe_price_id,
			price.price_type,
			price.amount,
		)
		.run();
}

// Insert test limits
for (const limit of testLimits) {
	await env.DB.prepare(
		`INSERT OR REPLACE INTO plan_limits (id, plan_id, max_organizations, users_per_org, reports_per_month, notices_per_month, alerts_per_month, transactions_per_month, clients_per_month, watchlist_queries_per_day, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 3, 50, 250, 50, ?, datetime('now'), datetime('now'))`,
	)
		.bind(
			limit.id,
			limit.plan_id,
			limit.max_organizations,
			limit.users_per_org,
			limit.watchlist_queries_per_day,
		)
		.run();
}
