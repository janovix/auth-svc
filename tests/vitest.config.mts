import path from "node:path";
import {
	defineWorkersConfig,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

const migrationsPath = path.join(__dirname, "..", "migrations");
const migrations = await readD1Migrations(migrationsPath);

export default defineWorkersConfig({
	esbuild: {
		target: "esnext",
	},
	test: {
		coverage: {
			provider: "istanbul",
			reporter: ["text", "lcov"],
			all: true,
			include: ["src/**/*.ts"],
			exclude: [
				"**/*.d.ts",
				"**/node_modules/**",
				"**/tests/**",
				"**/dist/**",
				"**/coverage/**",
				"**/endpoints/**/openapi.ts", // OpenAPI schema definitions don't need coverage
			],
			thresholds: {
				lines: 80,
				functions: 75,
				branches: 70,
				statements: 80,
			},
		},
		// Bundle problematic dependencies that fail to import on Windows and other systems
		// Using the newer optimizer API to ensure kysely is bundled for Workers environment
		deps: {
			optimizer: {
				ssr: {
					include: [
						"kysely",
						"zod",
						"better-call",
						// Bundle kysely and any kysely-related packages
						// These are often used by better-auth internally and can fail on Windows
						// due to module resolution issues or platform-specific code
						"@kysely/*",
					],
				},
			},
		},
		setupFiles: ["./tests/apply-migrations.ts"],
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					configPath: "../wrangler.jsonc",
				},
				miniflare: {
					compatibilityFlags: ["experimental", "nodejs_compat"],
					bindings: {
						MIGRATIONS: migrations,
					},
				},
			},
		},
	},
});
