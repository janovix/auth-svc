/**
 * License routes for enterprise license management
 *
 * Most routes are admin-only, except for activate and verify
 */
import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import type { Bindings } from "../types/bindings";
import { LicenseRepository, LicenseService } from "../domain/license";
import {
	generateLicenseInputSchema,
	activateLicenseInputSchema,
} from "../domain/license/schemas";
import { getBetterAuthContext } from "../auth/instance";

type LicenseBindings = {
	Bindings: Bindings;
};

type LicenseContext = Context<LicenseBindings>;

const licenseRoutes = new Hono<LicenseBindings>();

/**
 * Helper to get authenticated user
 */
async function getAuthenticatedUser(c: LicenseContext): Promise<{
	id: string;
	organizationId?: string;
	isOwner: boolean;
	isAdmin: boolean;
} | null> {
	try {
		const { auth } = getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) {
			return null;
		}

		const organizationId = (
			session.session as { activeOrganizationId?: string }
		)?.activeOrganizationId;

		// Check if user is admin (role from user table)
		const isAdmin = (session.user as { role?: string })?.role === "admin";

		// Check if user is org owner
		let isOwner = false;
		if (organizationId) {
			const memberResult = await c.env.DB.prepare(
				`SELECT role FROM members WHERE userId = ? AND organizationId = ? LIMIT 1`,
			)
				.bind(session.user.id, organizationId)
				.first<{ role: string }>();
			isOwner = memberResult?.role === "owner";
		}

		return {
			id: session.user.id,
			organizationId,
			isOwner,
			isAdmin,
		};
	} catch {
		return null;
	}
}

/**
 * Helper to get License service
 */
function getLicenseService(c: LicenseContext): LicenseService {
	if (!c.env.STRIPE_SECRET_KEY) {
		throw new Error("Stripe is not configured");
	}
	if (!c.env.LICENSE_PRIVATE_KEY || !c.env.LICENSE_PUBLIC_KEY) {
		throw new Error("License signing keys are not configured");
	}

	const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
	const repository = new LicenseRepository(c.env.DB);

	return new LicenseService(
		repository,
		stripe,
		c.env.LICENSE_PRIVATE_KEY,
		c.env.LICENSE_PUBLIC_KEY,
	);
}

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * GET /api/licenses
 * List all enterprise licenses (admin only)
 */
licenseRoutes.get("/", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isAdmin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const service = getLicenseService(c);
	const licenses = await service.getAllLicenses();

	// Map to safe output (don't expose full license keys)
	const safeOutput = licenses.map((license) => ({
		id: license.id,
		customerName: license.customerName,
		organizationId: license.organizationId,
		noticesPerMonth: license.noticesPerMonth,
		maxUsers: license.maxUsers,
		maxTransactions: license.maxTransactions,
		maxAlerts: license.maxAlerts,
		features: license.features,
		issuedAt: license.issuedAt.toISOString(),
		activatedAt: license.activatedAt?.toISOString() || null,
		expiresAt: license.expiresAt.toISOString(),
		revokedAt: license.revokedAt?.toISOString() || null,
		stripeSubscriptionId: license.stripeSubscriptionId,
	}));

	return c.json({
		success: true,
		data: safeOutput,
	});
});

/**
 * POST /api/licenses/generate
 * Generate a new enterprise license (admin only)
 */
licenseRoutes.post("/generate", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isAdmin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const body = await c.req.json();
	const parseResult = generateLicenseInputSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json(
			{
				success: false,
				error: "Invalid input",
				details: parseResult.error.errors,
			},
			400,
		);
	}

	const service = getLicenseService(c);

	try {
		const license = await service.generateLicense(parseResult.data, user.id);

		return c.json({
			success: true,
			data: {
				id: license.id,
				licenseKey: license.licenseKey,
				customerName: license.customerName,
				expiresAt: license.expiresAt.toISOString(),
				stripeSubscriptionId: license.stripeSubscriptionId,
				stripeInvoiceId: license.stripeInvoiceId,
			},
		});
	} catch (error) {
		console.error("License generation error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to generate license",
			},
			400,
		);
	}
});

/**
 * GET /api/licenses/:id
 * Get license details (admin only)
 */
licenseRoutes.get("/:id", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isAdmin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const licenseId = c.req.param("id");
	const service = getLicenseService(c);
	const status = await service.getLicenseStatus(licenseId);

	if (!status) {
		return c.json({ success: false, error: "License not found" }, 404);
	}

	return c.json({
		success: true,
		data: status,
	});
});

/**
 * POST /api/licenses/:id/revoke
 * Revoke a license (admin only)
 */
licenseRoutes.post("/:id/revoke", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isAdmin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const licenseId = c.req.param("id");
	const service = getLicenseService(c);

	try {
		await service.revokeLicense(licenseId);

		return c.json({
			success: true,
			message: "License revoked successfully",
		});
	} catch (error) {
		console.error("License revocation error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to revoke license",
			},
			400,
		);
	}
});

/**
 * POST /api/licenses/:id/renew
 * Renew a license for another year (admin only)
 */
licenseRoutes.post("/:id/renew", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.isAdmin) {
		return c.json({ success: false, error: "Admin access required" }, 403);
	}

	const licenseId = c.req.param("id");
	const service = getLicenseService(c);

	try {
		const license = await service.renewLicense(licenseId);

		return c.json({
			success: true,
			data: {
				id: license.id,
				expiresAt: license.expiresAt.toISOString(),
			},
		});
	} catch (error) {
		console.error("License renewal error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to renew license",
			},
			400,
		);
	}
});

// ============================================================================
// PUBLIC ROUTES (for license activation and verification)
// ============================================================================

/**
 * POST /api/licenses/activate
 * Activate a license for the current organization (org owner only)
 */
licenseRoutes.post("/activate", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.organizationId) {
		return c.json({ success: false, error: "No active organization" }, 400);
	}

	if (!user.isOwner) {
		return c.json(
			{
				success: false,
				error: "Only organization owners can activate licenses",
			},
			403,
		);
	}

	const body = await c.req.json();
	const parseResult = activateLicenseInputSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json(
			{
				success: false,
				error: "Invalid input",
				details: parseResult.error.errors,
			},
			400,
		);
	}

	const service = getLicenseService(c);

	try {
		const license = await service.activateLicense(
			parseResult.data.licenseKey,
			user.organizationId,
		);

		return c.json({
			success: true,
			data: {
				id: license.id,
				customerName: license.customerName,
				expiresAt: license.expiresAt.toISOString(),
				limits: {
					noticesPerMonth: license.noticesPerMonth,
					maxUsers: license.maxUsers,
					maxTransactions: license.maxTransactions,
					maxAlerts: license.maxAlerts,
				},
				features: license.features,
			},
		});
	} catch (error) {
		console.error("License activation error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to activate license",
			},
			400,
		);
	}
});

/**
 * POST /api/licenses/verify
 * Verify a license key (public endpoint for offline verification)
 */
licenseRoutes.post("/verify", async (c) => {
	const body = await c.req.json<{ licenseKey: string }>();
	if (!body.licenseKey) {
		return c.json({ success: false, error: "licenseKey is required" }, 400);
	}

	const service = getLicenseService(c);

	try {
		const result = await service.verifyLicenseKey(body.licenseKey);

		return c.json({
			success: true,
			data: {
				valid: result.valid,
				expired: result.expired,
				revoked: result.revoked,
				error: result.error,
				// Only include payload if valid
				...(result.valid && result.payload
					? {
							limits: result.payload.limits,
							features: result.payload.features,
							expiresAt: new Date(result.payload.exp * 1000).toISOString(),
						}
					: {}),
			},
		});
	} catch (error) {
		console.error("License verification error:", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to verify license",
			},
			400,
		);
	}
});

/**
 * GET /api/licenses/current
 * Get the current organization's license status
 */
licenseRoutes.get("/current", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	if (!user.organizationId) {
		return c.json({ success: false, error: "No active organization" }, 400);
	}

	const service = getLicenseService(c);
	const license = await service.getLicenseByOrganization(user.organizationId);

	if (!license) {
		return c.json({
			success: true,
			data: null,
		});
	}

	const status = await service.getLicenseStatus(license.id);

	return c.json({
		success: true,
		data: status,
	});
});

export { licenseRoutes };
