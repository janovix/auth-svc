import { applyD1Migrations, env } from "cloudflare:test";

// Setup files run outside isolated storage, and may be run multiple times.
// `applyD1Migrations()` only applies migrations that haven't already been
// applied, therefore it is safe to call this function here.
await applyD1Migrations(env.DB, env.MIGRATIONS);

// Mock notification service binding if not provided
// This ensures tests don't fail when the service binding is not available
if (!("NOTIFICATIONS_SERVICE" in env) || !env.NOTIFICATIONS_SERVICE) {
	// @ts-expect-error - Adding mock service binding for tests
	env.NOTIFICATIONS_SERVICE = {
		fetch: async (request: Request) => {
			const url = new URL(request.url);
			if (url.pathname === "/send-auth") {
				return new Response(
					JSON.stringify({
						success: true,
						messageId: "test-message-id",
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}
			return new Response("Not Found", { status: 404 });
		},
	} as Fetcher;
}
