/**
 * POST /api/admin/e2e/purge — E2E_API_KEY-gated purge of @e2e.janovix.com users and orgs.
 */
import { Hono } from "hono";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import type { Bindings } from "../types/bindings";

export const adminE2ePurgeRoutes = new Hono<{ Bindings: Bindings }>();

function prismaFor(env: Bindings) {
	const adapter = new PrismaD1(env.DB);
	return new PrismaClient({ adapter });
}

adminE2ePurgeRoutes.use("*", async (c, next) => {
	const key = c.req.header("x-e2e-api-key");
	if (!c.env.E2E_API_KEY || key !== c.env.E2E_API_KEY) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
});

adminE2ePurgeRoutes.post("/purge", async (c) => {
	const prisma = prismaFor(c.env);
	const errors: string[] = [];

	const users = await prisma.user.findMany({
		where: { email: { endsWith: "@e2e.janovix.com" } },
		select: { id: true, email: true },
	});
	const userIds = users.map((u) => u.id);
	if (userIds.length === 0) {
		await prisma.$disconnect();
		return c.json({
			purgedUsers: 0,
			purgedOrgs: 0,
			cancelledSubs: 0,
			errors,
		});
	}

	const memberships = await prisma.member.findMany({
		where: { userId: { in: userIds } },
		select: { organizationId: true, userId: true },
	});
	const orgIds = [...new Set(memberships.map((m) => m.organizationId))];

	const orgMembers = await prisma.member.findMany({
		where: { organizationId: { in: orgIds } },
		include: { user: { select: { email: true } } },
	});
	const orgToEmails = new Map<string, string[]>();
	for (const m of orgMembers) {
		const list = orgToEmails.get(m.organizationId) ?? [];
		if (m.user?.email) list.push(m.user.email.toLowerCase());
		orgToEmails.set(m.organizationId, list);
	}
	const eligibleOrgIds = orgIds.filter((oid) => {
		const emails = orgToEmails.get(oid) ?? [];
		return (
			emails.length > 0 && emails.every((e) => e.endsWith("@e2e.janovix.com"))
		);
	});

	const apiKey = c.env.E2E_API_KEY ?? "";
	const body = JSON.stringify({ organizationIds: eligibleOrgIds });

	async function fanout(
		label: string,
		baseUrl: string | undefined,
	): Promise<void> {
		if (!baseUrl) {
			errors.push(`${label}: missing URL binding`);
			return;
		}
		const url = `${baseUrl.replace(/\/$/, "")}/api/v1/internal/e2e/purge`;
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-e2e-api-key": apiKey,
				},
				body,
			});
			if (!res.ok) {
				errors.push(`${label}: ${res.status} ${await res.text()}`);
			}
		} catch (e) {
			errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	await Promise.all([
		fanout("aml-svc", c.env.AML_SVC_URL),
		fanout("watchlist-svc", c.env.WATCHLIST_SVC_URL),
		fanout("doc-svc", c.env.DOC_SVC_URL),
	]);

	await prisma.member.deleteMany({ where: { userId: { in: userIds } } });

	await prisma.webhookDelivery.deleteMany({
		where: { organizationId: { in: eligibleOrgIds } },
	});
	await prisma.webhookEndpoint.deleteMany({
		where: { organizationId: { in: eligibleOrgIds } },
	});
	await prisma.organizationDailyUsage.deleteMany({
		where: { organizationId: { in: eligibleOrgIds } },
	});
	await prisma.apiKey.deleteMany({
		where: { organizationId: { in: eligibleOrgIds } },
	});
	await prisma.organizationUsage.deleteMany({
		where: { organizationId: { in: eligibleOrgIds } },
	});
	await prisma.organizationSettings.deleteMany({
		where: { organizationId: { in: eligibleOrgIds } },
	});

	await prisma.organization.deleteMany({
		where: { id: { in: eligibleOrgIds } },
	});

	let cancelledSubs = 0;
	const stripeKey = c.env.STRIPE_SECRET_KEY;
	if (stripeKey) {
		const stripe = new Stripe(stripeKey);
		const subs = await prisma.subscription.findMany({
			where: { referenceId: { in: userIds } },
		});
		for (const s of subs) {
			if (s.stripeSubscriptionId) {
				try {
					await stripe.subscriptions.cancel(s.stripeSubscriptionId, {
						prorate: false,
					});
					cancelledSubs++;
				} catch (e) {
					errors.push(
						`stripe ${s.stripeSubscriptionId}: ${e instanceof Error ? e.message : String(e)}`,
					);
				}
			}
		}
		await prisma.subscription.deleteMany({
			where: { referenceId: { in: userIds } },
		});
	}

	await prisma.userOverageSettings.deleteMany({
		where: { userId: { in: userIds } },
	});
	await prisma.userSettings.deleteMany({
		where: { userId: { in: userIds } },
	});
	await prisma.enterpriseLicense.deleteMany({
		where: { userId: { in: userIds } },
	});

	await prisma.user.deleteMany({
		where: { id: { in: userIds } },
	});

	await prisma.$disconnect();

	return c.json({
		purgedUsers: userIds.length,
		purgedOrgs: eligibleOrgIds.length,
		cancelledSubs,
		errors,
	});
});
