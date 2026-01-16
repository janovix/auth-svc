import { execSync } from "node:child_process";

if (process.env.WORKERS_CI_BRANCH === "main") {
	console.log("Skipping versions:upload because WORKERS_CI_BRANCH=main");
	process.exit(0);
}

// Run migrations
execSync("pnpm run predeploy:preview", { stdio: "inherit" });

// Upload worker version
execSync("wrangler versions upload --config wrangler.preview.jsonc", {
	stdio: "inherit",
});

// Seed subscription plans after deployment
console.log("\n🌱 Seeding subscription plans for preview environment...");
execSync("pnpm run seed:plans:preview", { stdio: "inherit" });
