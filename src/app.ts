/**
 * Raw Hono application setup.
 * This file contains all routes and middleware without the Sentry wrapper.
 * Used by both production (index.ts) and tests (testWorker.ts).
 */
import * as Sentry from "@sentry/cloudflare";
import { ApiException } from "chanfana";
import { Hono } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import pkg from "../package.json";
import { getScalarHtml, type AppMeta } from "./app-meta";
import { openAPISpec } from "./openapi";
import { registerBetterAuthRoutes } from "./auth/routes";
import { createCorsMiddleware } from "./middleware/cors";
import type { Bindings } from "./types/bindings";
import { handleJwks } from "./routes/jwks";
import { runWithExecutionContext } from "./auth/execution-context";
import { createMemberLimitGuard } from "./middleware/member-limit";
import {
	createStripeBillingGuard,
	createWebhookBillingGuard,
} from "./middleware/stripe-billing-guard";
import { settingsRoutes } from "./routes/settings";
import { internalSettingsRoutes } from "./routes/internal-settings";
import { auditRoutes } from "./routes/audit";
import { internalAuditRoutes } from "./routes/internal-audit";
import { subscriptionRoutes } from "./routes/subscription";
import { organizationRoutes } from "./routes/organization";
import { webhookRoutes } from "./routes/webhooks";
import { uploadRoutes } from "./routes/upload";
import { adminRoutes } from "./routes/admin";
import { adminE2ePurgeRoutes } from "./routes/admin-e2e-purge";
import { adminOrganizationsRoutes } from "./routes/admin-organizations";
import { internalOrganizationsRoutes } from "./routes/internal-organizations";
import { pricingRoutes } from "./routes/pricing";
import { apiKeysRoutes } from "./routes/api-keys";
import { internalApiKeysRoutes } from "./routes/internal-api-keys";
import { usageRightsRoutes } from "./routes/usage-rights";
import { internalUsageRightsRoutes } from "./routes/internal-usage-rights";
import { licenseAdminRoutes } from "./routes/license-admin";
import { subscriptionAdminRoutes } from "./routes/subscription-admin";
import { amlSettingsProxyRoutes } from "./routes/aml-settings-proxy";
import { internalWebhookRoutes } from "./routes/internal-webhooks";
import { publicWebhookRoutes } from "./routes/webhooks-public";

// Start a Hono app
export const app = new Hono<{ Bindings: Bindings }>();

const appMeta: AppMeta = {
	name: pkg.name,
	version: pkg.version,
	description: pkg.description,
};

// Establish AsyncLocalStorage scope for every request so that all route
// handlers (auth, settings, subscription, admin, etc.) can access the
// Cloudflare ExecutionContext via getExecutionContext() / executeInBackground().
// This is required for Better Auth's backgroundTasks.handler to call
// ctx.waitUntil() on background D1 writes from any route, not just /api/auth/*.
app.use("*", async (c, next) => {
	return runWithExecutionContext(c.executionCtx, next);
});

// Global middleware - Better Auth handles its own CORS via trustedOrigins config
// Only apply CORS middleware to non-Better Auth routes
const corsMiddleware = createCorsMiddleware();
app.use("*", async (c, next) => {
	if (c.req.path.startsWith("/api/auth")) {
		return next();
	}
	return corsMiddleware(c, next);
});

app.onError((err, c) => {
	if (err instanceof ApiException) {
		// If it's a Chanfana ApiException, let Chanfana handle the response
		return c.json(
			{ success: false, errors: err.buildResponse() },
			err.status as ContentfulStatusCode,
		);
	}

	console.error("Global error handler caught:", err); // Log the error if it's not known

	Sentry.captureException(err, {
		tags: { context: "global-error-handler" },
	});

	// For other errors, return a generic 500 response
	return c.json(
		{
			success: false,
			errors: [{ code: 7000, message: "Internal Server Error" }],
		},
		500,
	);
});

// Serve consolidated OpenAPI spec (aml-svc style)
app.get("/openapi.json", (c) => c.json(openAPISpec));

app.get("/", (c) => {
	if (c.req.header("x-force-error") === "1") {
		throw new Error("Forced error");
	}

	return c.json({ name: appMeta.name, version: appMeta.version });
});

app.get("/healthz", (c) => {
	return c.json({ ok: true });
});

app.get("/docsz", (c) => {
	return c.html(getScalarHtml(appMeta));
});

// Register dedicated JWKS handler BEFORE Better Auth routes.
// This bypasses Better Auth's full pipeline (rate limiting KV ops, Prisma D1 query)
// for the JWKS endpoint, making it immune to intermittent D1 slowdowns.
// See src/routes/jwks.ts for details.
app.get("/api/auth/jwks", handleJwks);

// Guard member invitations against plan usersPerOrg limits.
// Must be registered BEFORE registerBetterAuthRoutes so the middleware runs first.
app.use("/api/auth/organization/invite-member", createMemberLimitGuard());

// Block Better Auth Stripe subscription routes when billing is disabled via flags-svc.
app.use("/api/auth/subscription/*", createStripeBillingGuard());
// Better Auth Stripe plugin webhook (POST /api/auth/stripe/webhook) — 200 no-op when disabled
app.use("/api/auth/stripe/webhook", createWebhookBillingGuard());

// Register Better Auth routes (actual implementation - handles requests)
registerBetterAuthRoutes(app);

// Register Settings routes (actual implementation)
app.route("/api/settings", settingsRoutes);

// Register AML Compliance Settings proxy (proxied to aml-svc via service binding)
app.route("/api/settings/aml-compliance", amlSettingsProxyRoutes);

// Register Internal routes for service bindings
app.route("/internal/settings", internalSettingsRoutes);

// Admin organizations (session + admin role; admin app calls this directly)
app.route("/admin/organizations", adminOrganizationsRoutes);

// Internal organizations (service binding access, no auth; for org member enumeration)
app.route("/internal/organizations", internalOrganizationsRoutes);

// Register Audit routes (actual implementation)
app.route("/api/audit", auditRoutes);

// Register Internal Audit routes for service bindings
app.route("/internal/audit", internalAuditRoutes);

// Stripe-only subscription routes (license-compatible routes stay on subscriptionRoutes)
app.use("/api/subscription/ensure-customer", createStripeBillingGuard());
app.use("/api/subscription/portal", createStripeBillingGuard());
app.use("/api/subscription/usage/report", createStripeBillingGuard());

// Register Subscription routes (usage tracking and org limits)
// Note: Checkout, cancel, upgrade are handled by Better Auth at /api/auth/subscription/*
app.route("/api/subscription", subscriptionRoutes);

// Stripe catalog sync
app.use("/api/pricing/sync-from-stripe", createStripeBillingGuard());

// Register Pricing routes (database-driven plans, prices, and limits)
app.route("/api/pricing", pricingRoutes);

// Register API Keys routes (organization-scoped keys for third-party access)
app.route("/api/api-keys", apiKeysRoutes);

// Register Internal API Keys routes (service binding validation)
app.route("/internal/api-keys", internalApiKeysRoutes);

// Register Usage Rights routes (entitlement checks, metering, gates)
app.route("/api/usage-rights", usageRightsRoutes);

// Register Internal Usage Rights routes (service binding, no auth)
app.route("/internal/usage-rights", internalUsageRightsRoutes);

// Register Internal Webhook routes (service binding, called by api worker)
app.route("/internal/webhooks", internalWebhookRoutes);

// Dashboard webhook CRUD (session + org owner/admin)
app.route("/api/webhooks", publicWebhookRoutes);

// Register Organization routes (invitation lookup by ID)
app.route("/api/organization", organizationRoutes);

// Register Stripe Webhooks (card fingerprint check and usage reset)
app.use("/webhooks/*", createWebhookBillingGuard());
app.route("/webhooks", webhookRoutes);

// Register Upload routes (avatar uploads via R2)
app.route("/api/upload", uploadRoutes);

// Register Admin routes (KV management, etc.)
app.route("/api/admin", adminRoutes);
app.route("/api/admin/e2e", adminE2ePurgeRoutes);

// Register License Admin routes (CRUD for enterprise licenses)
app.route("/api/admin/licenses", licenseAdminRoutes);

// Register Subscription Admin routes (list, stats, usage for admin)
app.route("/api/admin/subscriptions", subscriptionAdminRoutes);

// Dummy example endpoint (documented in openapi.ts)
const dummyBodySchema = z.object({ name: z.string() });
app.post("/dummy/:slug", async (c) => {
	const slug = c.req.param("slug");
	const body = await c.req.json();
	const parsed = dummyBodySchema.safeParse(body);
	if (!parsed.success) {
		const errors = parsed.error.errors.map((e) => ({
			code: 400,
			message: e.message,
		}));
		return c.json({ success: false, errors }, 400);
	}
	return c.json({
		success: true,
		result: {
			msg: "this is a dummy endpoint, serving as example",
			slug,
			name: parsed.data.name,
		},
	});
});
