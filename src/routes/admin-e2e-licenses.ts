/**
 * E2E-only enterprise license helpers — E2E_API_KEY gated (same pattern as admin-e2e-purge).
 * POST /api/admin/e2e/licenses/* — mint, revoke, expire, bind to throwaway user.
 */
import { Hono } from "hono";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import type { Bindings } from "../types/bindings";
import { PricingRepository } from "../domain/pricing";
import type { CreateLicenseInput } from "../domain/pricing/types";

export const adminE2eLicensesRoutes = new Hono<{ Bindings: Bindings }>();

function prismaFor(env: Bindings) {
	const adapter = new PrismaD1(env.DB);
	return new PrismaClient({ adapter });
}

function generateLicenseKey(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const segment = () =>
		Array.from({ length: 4 }, () =>
			chars.charAt(Math.floor(Math.random() * chars.length)),
		).join("");
	return `ENT-${segment()}-${segment()}-${segment()}`;
}

adminE2eLicensesRoutes.use("*", async (c, next) => {
	const key = c.req.header("x-e2e-api-key");
	if (!c.env.E2E_API_KEY || key !== c.env.E2E_API_KEY) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
});

/**
 * POST /
 * Create a new enterprise license (no admin session; e2e key only).
 */
adminE2eLicensesRoutes.post("/", async (c) => {
	const body = await c.req.json<{
		organizationName?: string;
		expiresAt?: string | null;
		notes?: string;
		maxOrganizations?: number;
		maxUsers?: number;
		reportsPerMonth?: number;
		noticesPerMonth?: number;
		alertsPerMonth?: number;
		operationsPerMonth?: number;
		clientsPerMonth?: number;
		watchlistQueriesPerMonth?: number;
	}>();

	const organizationName =
		body.organizationName?.trim() || `E2E License ${Date.now()}`;

	const key = generateLicenseKey();
	const repository = new PricingRepository(c.env.DB);

	const input: CreateLicenseInput = {
		key,
		organizationName,
		notes: body.notes,
		expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
		maxOrganizations: body.maxOrganizations ?? 0,
		maxUsers: body.maxUsers ?? 0,
		reportsPerMonth: body.reportsPerMonth ?? 0,
		noticesPerMonth: body.noticesPerMonth ?? 0,
		alertsPerMonth: body.alertsPerMonth ?? 0,
		operationsPerMonth: body.operationsPerMonth ?? 0,
		clientsPerMonth: body.clientsPerMonth ?? 0,
		watchlistQueriesPerMonth: body.watchlistQueriesPerMonth ?? 0,
	};

	const license = await repository.createLicense(input);

	return c.json(
		{
			success: true,
			data: {
				id: license.id,
				key: license.key,
				expiresAt: license.expiresAt?.toISOString() ?? null,
			},
		},
		201,
	);
});

/**
 * POST /:id/revoke
 */
adminE2eLicensesRoutes.post("/:id/revoke", async (c) => {
	const id = c.req.param("id");
	const repository = new PricingRepository(c.env.DB);
	const license = await repository.getLicenseById(id);
	if (!license) {
		return c.json({ success: false, error: "License not found" }, 404);
	}
	await repository.revokeLicense(id);
	return c.json({ success: true, message: "License revoked" });
});

/**
 * POST /:id/expire
 * Set expires_at in the past so validateLicenseKey fails with "License has expired".
 */
adminE2eLicensesRoutes.post("/:id/expire", async (c) => {
	const id = c.req.param("id");
	let body: { daysAgo?: number } = {};
	try {
		body = await c.req.json<{ daysAgo?: number }>();
	} catch {
		/* empty body */
	}
	const daysAgo = body.daysAgo ?? 1;

	const repository = new PricingRepository(c.env.DB);
	const license = await repository.getLicenseById(id);
	if (!license) {
		return c.json({ success: false, error: "License not found" }, 404);
	}

	const past = new Date();
	past.setUTCDate(past.getUTCDate() - daysAgo);

	await c.env.DB.prepare(
		`UPDATE enterprise_licenses SET expires_at = ?, updated_at = datetime('now') WHERE id = ?`,
	)
		.bind(past.toISOString(), id)
		.run();

	const updated = await repository.getLicenseById(id);
	return c.json({ success: true, data: updated });
});

/**
 * POST /:id/activate-throwaway
 * Bind license to an existing user by email (for "already in use" e2e scenarios).
 */
adminE2eLicensesRoutes.post("/:id/activate-throwaway", async (c) => {
	const id = c.req.param("id");
	const body = await c.req.json<{ email: string }>();
	if (!body.email?.trim()) {
		return c.json({ success: false, error: "email is required" }, 400);
	}

	const repository = new PricingRepository(c.env.DB);
	const license = await repository.getLicenseById(id);
	if (!license) {
		return c.json({ success: false, error: "License not found" }, 404);
	}

	const prisma = prismaFor(c.env);
	const user = await prisma.user.findFirst({
		where: { email: body.email.trim().toLowerCase() },
		select: { id: true },
	});

	if (!user) {
		return c.json(
			{ success: false, error: `User not found for email ${body.email}` },
			404,
		);
	}

	await repository.activateLicense(id, user.id);
	const updated = await repository.getLicenseById(id);
	return c.json({ success: true, data: updated });
});
