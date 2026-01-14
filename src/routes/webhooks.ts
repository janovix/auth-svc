/**
 * Stripe Webhook Handler - Card Fingerprint Check
 *
 * This handler supplements Better Auth's Stripe webhook handling with:
 * - Card fingerprint checking for trial abuse prevention
 * - Usage reset on new billing periods
 *
 * Note: Most subscription lifecycle events are handled by Better Auth Stripe plugin.
 * This handler focuses on custom business logic.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import type { Bindings } from "../types/bindings";
import {
	SubscriptionRepository,
	SubscriptionService,
} from "../domain/subscription";

type WebhookBindings = {
	Bindings: Bindings;
};

type WebhookContext = Context<WebhookBindings>;

const webhookRoutes = new Hono<WebhookBindings>();

/**
 * Events we handle (supplementing Better Auth)
 */
const HANDLED_EVENTS = [
	// Checkout
	"checkout.session.completed",

	// Customer lifecycle
	"customer.created",
	"customer.deleted",
	"customer.updated",

	// Subscription lifecycle
	"customer.subscription.created",
	"customer.subscription.deleted",
	"customer.subscription.paused",
	"customer.subscription.resumed",
	"customer.subscription.updated",

	// Invoice events
	"invoice.paid",
	"invoice.payment_failed",
	"invoice.upcoming",
];

/**
 * Log a summarized view of incoming webhook events
 */
function logWebhookEvent(event: Stripe.Event) {
	const timestamp = new Date(event.created * 1000).toISOString();
	const obj = event.data.object as unknown as Record<string, unknown>;

	let summary = "";

	switch (event.type) {
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted":
		case "customer.subscription.paused":
		case "customer.subscription.resumed": {
			const sub = obj as {
				id?: string;
				status?: string;
				customer?: string;
				metadata?: Record<string, string>;
				items?: {
					data?: Array<{
						price?: { id?: string; nickname?: string; product?: string };
					}>;
				};
			};
			const priceId = sub.items?.data?.[0]?.price?.id || "unknown";
			const nickname = sub.items?.data?.[0]?.price?.nickname || "no-nickname";
			summary = `sub=${sub.id}, status=${sub.status}, customer=${sub.customer}, price=${priceId} (${nickname}), userId=${sub.metadata?.userId || sub.metadata?.referenceId || "none"}`;
			break;
		}
		case "checkout.session.completed": {
			const session = obj as {
				id?: string;
				mode?: string;
				subscription?: string;
				customer?: string;
				client_reference_id?: string;
				metadata?: Record<string, string>;
			};
			summary = `session=${session.id}, mode=${session.mode}, sub=${session.subscription}, customer=${session.customer}, userId=${session.client_reference_id || session.metadata?.userId || "none"}`;
			break;
		}
		case "invoice.paid":
		case "invoice.payment_failed":
		case "invoice.upcoming": {
			const invoice = obj as {
				id?: string;
				customer?: string;
				subscription?: string;
				amount_due?: number;
				status?: string;
			};
			summary = `invoice=${invoice.id}, status=${invoice.status}, amount=${invoice.amount_due}, customer=${invoice.customer}, sub=${invoice.subscription}`;
			break;
		}
		case "customer.created":
		case "customer.updated":
		case "customer.deleted": {
			const customer = obj as { id?: string; email?: string; name?: string };
			summary = `customer=${customer.id}, email=${customer.email}, name=${customer.name || "none"}`;
			break;
		}
		default:
			summary = `id=${obj.id || "unknown"}`;
	}

	console.log(`[Webhook] 📨 ${event.type} @ ${timestamp}`);
	console.log(`[Webhook]    └─ ${summary}`);
}

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events for custom business logic
 */
webhookRoutes.post("/stripe", async (c) => {
	if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_WEBHOOK_SECRET) {
		console.error("Stripe is not configured");
		return c.json({ error: "Webhook not configured" }, 500);
	}

	const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

	// Get the raw body and signature
	const body = await c.req.text();
	const signature = c.req.header("stripe-signature");

	if (!signature) {
		console.error("Missing stripe-signature header");
		return c.json({ error: "Missing signature" }, 400);
	}

	let event: Stripe.Event;

	try {
		event = await stripe.webhooks.constructEventAsync(
			body,
			signature,
			c.env.STRIPE_WEBHOOK_SECRET,
		);
	} catch (err) {
		console.error("Webhook signature verification failed:", err);
		return c.json({ error: "Invalid signature" }, 400);
	}

	// Log incoming webhook with helpful summary
	logWebhookEvent(event);

	// Skip events we don't handle
	if (!HANDLED_EVENTS.includes(event.type)) {
		console.log(`[Webhook] ⏭️  Skipping unhandled event: ${event.type}`);
		return c.json({ received: true, skipped: true });
	}

	console.log(`[Webhook] ✅ Processing ${event.type}`);

	try {
		await handleEvent(c, stripe, event);
		return c.json({ received: true });
	} catch (error) {
		console.error(`[Webhook] Error processing ${event.type}:`, error);
		// Return 200 to acknowledge receipt, but log the error
		// Returning 500 would cause Stripe to retry
		return c.json({ received: true, error: true });
	}
});

/**
 * Route events to appropriate handlers
 */
async function handleEvent(
	c: WebhookContext,
	stripe: Stripe,
	event: Stripe.Event,
): Promise<void> {
	const repository = new SubscriptionRepository(c.env.DB);
	const service = new SubscriptionService(repository, stripe);

	switch (event.type) {
		// =========================================================================
		// CHECKOUT COMPLETED - Check card fingerprint for trial abuse
		// =========================================================================
		case "checkout.session.completed": {
			const session = event.data.object as Stripe.Checkout.Session;

			// Only check for subscription mode (not one-time payments)
			if (session.mode !== "subscription" || !session.subscription) {
				break;
			}

			// Get the user ID from client_reference_id or metadata
			const userId =
				session.client_reference_id ||
				(session.metadata?.userId as string | undefined);

			if (!userId) {
				console.warn("[Webhook] checkout.session.completed: No user ID found");
				break;
			}

			const subscriptionId =
				typeof session.subscription === "string"
					? session.subscription
					: session.subscription.id;

			// Check for trial abuse
			const result = await service.handleCheckoutForTrialAbuse(
				subscriptionId,
				userId,
			);

			if (result.skipTrial) {
				console.log(
					`[Webhook] Trial skipped for user ${userId}: ${result.reason}`,
				);
			}
			break;
		}

		// =========================================================================
		// INVOICE PAID - Reset usage for new billing period
		// =========================================================================
		case "invoice.paid": {
			const invoice = event.data.object as Stripe.Invoice;

			// Only handle subscription invoices
			// Type assertion needed as Stripe types vary by version
			const invoiceData = invoice as unknown as {
				subscription?: string | { id: string } | null;
				period_start: number;
				period_end: number;
			};

			if (!invoiceData.subscription) {
				break;
			}

			const subscriptionId =
				typeof invoiceData.subscription === "string"
					? invoiceData.subscription
					: invoiceData.subscription.id;

			// Get subscription from our DB
			const subscription =
				await repository.getByStripeSubscriptionId(subscriptionId);

			if (!subscription) {
				console.warn(
					`[Webhook] invoice.paid: No subscription found for ${subscriptionId}`,
				);
				break;
			}

			// Get organizations owned by this user
			const orgsResult = await c.env.DB.prepare(
				`SELECT organizationId FROM members WHERE userId = ? AND role = 'owner'`,
			)
				.bind(subscription.referenceId)
				.all<{ organizationId: string }>();

			if (!orgsResult.results?.length) {
				break;
			}

			// Reset usage for all owned organizations
			const periodStart = new Date(invoiceData.period_start * 1000);
			const periodEnd = new Date(invoiceData.period_end * 1000);

			for (const org of orgsResult.results) {
				await service.resetUsageForPeriod(
					org.organizationId,
					periodStart,
					periodEnd,
				);
				console.log(`[Webhook] Reset usage for org ${org.organizationId}`);
			}
			break;
		}

		// =========================================================================
		// SUBSCRIPTION CREATED/UPDATED - Update subscription record
		// =========================================================================
		case "customer.subscription.created":
		case "customer.subscription.updated": {
			// Type assertion for subscription data (Stripe types vary by version)
			const stripeSub = event.data.object as unknown as {
				id: string;
				status: string;
				metadata?: Record<string, string>;
				current_period_start?: number;
				current_period_end?: number;
				trial_start?: number | null;
				trial_end?: number | null;
				cancel_at_period_end?: boolean;
				items?: {
					data: Array<{
						price?: {
							id?: string;
							nickname?: string;
							product?: string | { id: string; name?: string };
							lookup_key?: string;
						};
					}>;
				};
			};

			// Get our subscription ID from metadata
			const ourSubscriptionId = stripeSub.metadata?.subscriptionId;
			const userId =
				stripeSub.metadata?.referenceId || stripeSub.metadata?.userId;

			// Extract subscription data
			const stripeSubscriptionId = stripeSub.id;
			const status = stripeSub.status; // active, trialing, past_due, canceled, etc.
			const periodStart = stripeSub.current_period_start
				? new Date(stripeSub.current_period_start * 1000).toISOString()
				: null;
			const periodEnd = stripeSub.current_period_end
				? new Date(stripeSub.current_period_end * 1000).toISOString()
				: null;
			const trialStart = stripeSub.trial_start
				? new Date(stripeSub.trial_start * 1000).toISOString()
				: null;
			const trialEnd = stripeSub.trial_end
				? new Date(stripeSub.trial_end * 1000).toISOString()
				: null;
			const cancelAtPeriodEnd = stripeSub.cancel_at_period_end ? 1 : 0;

			// Extract plan name from subscription items
			// Try multiple sources in order of reliability
			let plan: string | null = null;
			const priceItem = stripeSub.items?.data?.[0]?.price;
			const priceId = priceItem?.id;

			if (priceId) {
				// Method 1: Compare against configured price IDs (most reliable)
				const businessPriceId = c.env.STRIPE_BUSINESS_PRICE_ID;
				const proPriceId = c.env.STRIPE_PRO_PRICE_ID;

				if (businessPriceId && priceId === businessPriceId) {
					plan = "business";
					console.log(
						`[Webhook] Plan detected from configured STRIPE_BUSINESS_PRICE_ID: ${plan}`,
					);
				} else if (proPriceId && priceId === proPriceId) {
					plan = "pro";
					console.log(
						`[Webhook] Plan detected from configured STRIPE_PRO_PRICE_ID: ${plan}`,
					);
				}
			}

			// Method 2: Try nickname or lookup_key from price
			if (!plan && priceItem) {
				if (priceItem.nickname) {
					plan = priceItem.nickname.toLowerCase();
					console.log(`[Webhook] Plan detected from price nickname: ${plan}`);
				} else if (priceItem.lookup_key) {
					plan = priceItem.lookup_key.toLowerCase();
					console.log(`[Webhook] Plan detected from price lookup_key: ${plan}`);
				}
			}

			// Method 3: Try to get product name from Stripe API
			if (!plan && priceItem?.product) {
				const productId =
					typeof priceItem.product === "string"
						? priceItem.product
						: priceItem.product.id;

				if (typeof priceItem.product !== "string" && priceItem.product.name) {
					// Product is expanded
					plan = priceItem.product.name.toLowerCase();
					console.log(
						`[Webhook] Plan detected from expanded product name: ${plan}`,
					);
				} else if (productId) {
					// Fetch product from Stripe to get name
					try {
						const product = await stripe.products.retrieve(productId);
						if (product.name) {
							plan = product.name.toLowerCase();
							console.log(
								`[Webhook] Plan detected from fetched product name: ${plan} (product: ${productId})`,
							);
						}
					} catch (err) {
						console.warn(
							`[Webhook] Failed to fetch product ${productId}:`,
							err,
						);
					}
				}
			}

			// Method 4: Pattern match on price ID as last resort
			if (!plan && priceId) {
				if (priceId.includes("pro")) {
					plan = "pro";
					console.log(`[Webhook] Plan detected from price ID pattern: ${plan}`);
				} else if (priceId.includes("business")) {
					plan = "business";
					console.log(`[Webhook] Plan detected from price ID pattern: ${plan}`);
				}
			}

			// Normalize plan name to our known values
			if (plan) {
				const normalizedPlan = plan.toLowerCase();
				if (normalizedPlan.includes("pro")) {
					plan = "pro";
				} else if (normalizedPlan.includes("business")) {
					plan = "business";
				} else {
					console.warn(`[Webhook] Unknown plan name "${plan}", keeping as-is`);
				}
			} else {
				console.warn(`[Webhook] Could not detect plan from subscription`, {
					priceId,
					nickname: priceItem?.nickname,
					lookupKey: priceItem?.lookup_key,
					product: priceItem?.product,
				});
			}

			console.log(`[Webhook] ${event.type}: Updating subscription`, {
				ourSubscriptionId,
				stripeSubscriptionId,
				status,
				plan,
				userId,
			});

			// Helper to run update with or without plan
			const runUpdate = async (
				whereClause: string,
				whereParams: (string | number | null)[],
				includeStripeSubId: boolean = false,
			) => {
				if (plan) {
					// Update including plan
					const sql = includeStripeSubId
						? `UPDATE subscription 
						   SET stripeSubscriptionId = ?,
						       status = ?,
						       plan = ?,
						       periodStart = ?,
						       periodEnd = ?,
						       trialStart = ?,
						       trialEnd = ?,
						       cancelAtPeriodEnd = ?,
						       updatedAt = datetime('now')
						   WHERE ${whereClause}`
						: `UPDATE subscription 
						   SET status = ?,
						       plan = ?,
						       periodStart = ?,
						       periodEnd = ?,
						       trialStart = ?,
						       trialEnd = ?,
						       cancelAtPeriodEnd = ?,
						       updatedAt = datetime('now')
						   WHERE ${whereClause}`;

					const params = includeStripeSubId
						? [
								stripeSubscriptionId,
								status,
								plan,
								periodStart,
								periodEnd,
								trialStart,
								trialEnd,
								cancelAtPeriodEnd,
								...whereParams,
							]
						: [
								status,
								plan,
								periodStart,
								periodEnd,
								trialStart,
								trialEnd,
								cancelAtPeriodEnd,
								...whereParams,
							];

					return c.env.DB.prepare(sql)
						.bind(...params)
						.run();
				} else {
					// Update without plan (keep existing)
					const sql = includeStripeSubId
						? `UPDATE subscription 
						   SET stripeSubscriptionId = ?,
						       status = ?,
						       periodStart = ?,
						       periodEnd = ?,
						       trialStart = ?,
						       trialEnd = ?,
						       cancelAtPeriodEnd = ?,
						       updatedAt = datetime('now')
						   WHERE ${whereClause}`
						: `UPDATE subscription 
						   SET status = ?,
						       periodStart = ?,
						       periodEnd = ?,
						       trialStart = ?,
						       trialEnd = ?,
						       cancelAtPeriodEnd = ?,
						       updatedAt = datetime('now')
						   WHERE ${whereClause}`;

					const params = includeStripeSubId
						? [
								stripeSubscriptionId,
								status,
								periodStart,
								periodEnd,
								trialStart,
								trialEnd,
								cancelAtPeriodEnd,
								...whereParams,
							]
						: [
								status,
								periodStart,
								periodEnd,
								trialStart,
								trialEnd,
								cancelAtPeriodEnd,
								...whereParams,
							];

					return c.env.DB.prepare(sql)
						.bind(...params)
						.run();
				}
			};

			// Update the subscription record - try by stripeSubscriptionId first (most reliable for updates)
			if (stripeSubscriptionId) {
				const updateResult = await runUpdate(
					"stripeSubscriptionId = ?",
					[stripeSubscriptionId],
					false,
				);

				if (updateResult.meta.changes > 0) {
					console.log(
						`[Webhook] Updated subscription by stripeSubscriptionId ${stripeSubscriptionId} to status: ${status}, plan: ${plan || "unchanged"}`,
					);
					break;
				}
			}

			// Fallback: update by our subscription ID from metadata
			if (ourSubscriptionId) {
				await runUpdate("id = ?", [ourSubscriptionId], true);
				console.log(
					`[Webhook] Updated subscription ${ourSubscriptionId} to status: ${status}, plan: ${plan || "unchanged"}`,
				);
			} else if (userId) {
				// Last fallback: update by userId if subscriptionId not in metadata
				await runUpdate(
					"referenceId = ? AND (stripeSubscriptionId IS NULL OR stripeSubscriptionId = ?)",
					[userId, stripeSubscriptionId],
					true,
				);
				console.log(
					`[Webhook] Updated subscription for user ${userId} to status: ${status}, plan: ${plan || "unchanged"}`,
				);
			} else {
				console.warn(
					`[Webhook] ${event.type}: Could not find subscription to update`,
					{ stripeSubscriptionId, metadata: stripeSub.metadata },
				);
			}
			break;
		}

		// =========================================================================
		// SUBSCRIPTION DELETED - Mark subscription as canceled
		// =========================================================================
		case "customer.subscription.deleted": {
			const stripeSub = event.data.object as unknown as { id: string };
			const stripeSubscriptionId = stripeSub.id;

			console.log(
				`[Webhook] customer.subscription.deleted: ${stripeSubscriptionId}`,
			);

			await c.env.DB.prepare(
				`UPDATE subscription 
				 SET status = 'canceled',
				     updatedAt = datetime('now')
				 WHERE stripeSubscriptionId = ?`,
			)
				.bind(stripeSubscriptionId)
				.run();

			console.log(
				`[Webhook] Marked subscription ${stripeSubscriptionId} as canceled`,
			);
			break;
		}

		// =========================================================================
		// SUBSCRIPTION PAUSED - Mark subscription as paused
		// =========================================================================
		case "customer.subscription.paused": {
			const stripeSub = event.data.object as unknown as { id: string };
			const stripeSubscriptionId = stripeSub.id;

			console.log(
				`[Webhook] customer.subscription.paused: ${stripeSubscriptionId}`,
			);

			await c.env.DB.prepare(
				`UPDATE subscription 
				 SET status = 'paused',
				     updatedAt = datetime('now')
				 WHERE stripeSubscriptionId = ?`,
			)
				.bind(stripeSubscriptionId)
				.run();

			console.log(
				`[Webhook] Marked subscription ${stripeSubscriptionId} as paused`,
			);
			break;
		}

		// =========================================================================
		// SUBSCRIPTION RESUMED - Mark subscription as active
		// =========================================================================
		case "customer.subscription.resumed": {
			const stripeSub = event.data.object as unknown as {
				id: string;
				status: string;
			};
			const stripeSubscriptionId = stripeSub.id;
			const status = stripeSub.status || "active";

			console.log(
				`[Webhook] customer.subscription.resumed: ${stripeSubscriptionId} -> ${status}`,
			);

			await c.env.DB.prepare(
				`UPDATE subscription 
				 SET status = ?,
				     updatedAt = datetime('now')
				 WHERE stripeSubscriptionId = ?`,
			)
				.bind(status, stripeSubscriptionId)
				.run();

			console.log(
				`[Webhook] Resumed subscription ${stripeSubscriptionId} to status: ${status}`,
			);
			break;
		}

		// =========================================================================
		// CUSTOMER EVENTS - Log for audit purposes
		// =========================================================================
		case "customer.created": {
			const customer = event.data.object as unknown as {
				id: string;
				email?: string;
			};
			console.log(
				`[Webhook] customer.created: ${customer.id} (${customer.email || "no email"})`,
			);
			// Customer creation is handled by our ensure-customer flow
			break;
		}

		case "customer.deleted": {
			const customer = event.data.object as unknown as { id: string };
			console.log(`[Webhook] customer.deleted: ${customer.id}`);
			// We don't delete local records - just log for audit
			break;
		}

		case "customer.updated": {
			const customer = event.data.object as unknown as {
				id: string;
				email?: string;
				name?: string;
			};
			console.log(
				`[Webhook] customer.updated: ${customer.id} (${customer.name || "no name"})`,
			);
			// Customer updates are synced from our side, not from Stripe
			break;
		}

		// =========================================================================
		// INVOICE PAYMENT FAILED - Log and potentially notify
		// =========================================================================
		case "invoice.payment_failed": {
			const invoice = event.data.object as unknown as {
				id: string;
				customer: string;
				subscription?: string;
				attempt_count: number;
			};

			console.log(`[Webhook] invoice.payment_failed:`, {
				invoiceId: invoice.id,
				customerId: invoice.customer,
				subscriptionId: invoice.subscription,
				attemptCount: invoice.attempt_count,
			});

			// TODO: Send notification email to user about failed payment
			// For now, just log - Stripe handles retry logic
			break;
		}

		// =========================================================================
		// INVOICE UPCOMING - Log for awareness
		// =========================================================================
		case "invoice.upcoming": {
			const invoice = event.data.object as unknown as {
				customer: string;
				subscription?: string;
				amount_due: number;
			};

			console.log(`[Webhook] invoice.upcoming:`, {
				customerId: invoice.customer,
				subscriptionId: invoice.subscription,
				amountDue: invoice.amount_due,
			});

			// TODO: Optionally send reminder email
			break;
		}

		default:
			console.log(`[Webhook] Unhandled event type: ${event.type}`);
	}
}

export { webhookRoutes };
