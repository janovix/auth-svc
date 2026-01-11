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
