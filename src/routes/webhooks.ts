/**
 * Stripe Webhook Handler
 *
 * Handles Stripe events for subscription lifecycle, invoices, and payments
 */
import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import type { Bindings } from "../types/bindings";
import {
	SubscriptionRepository,
	SubscriptionService,
} from "../domain/subscription";
import { LicenseRepository, LicenseService } from "../domain/license";

type WebhookBindings = {
	Bindings: Bindings;
};

type WebhookContext = Context<WebhookBindings>;

const webhookRoutes = new Hono<WebhookBindings>();

/**
 * Events we handle
 */
const HANDLED_EVENTS = [
	// Customer events
	"customer.created",
	"customer.updated",
	"customer.deleted",

	// Subscription events
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"customer.subscription.paused",
	"customer.subscription.resumed",

	// Invoice events
	"invoice.paid",
	"invoice.payment_failed",
	"invoice.upcoming",

	// Checkout events
	"checkout.session.completed",
];

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events
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

	// Skip events we don't handle
	if (!HANDLED_EVENTS.includes(event.type)) {
		return c.json({ received: true, skipped: true });
	}

	console.log(`[Webhook] Processing ${event.type}`);

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
	const subscriptionService = new SubscriptionService(repository, stripe);

	switch (event.type) {
		// =========================================================================
		// SUBSCRIPTION EVENTS
		// =========================================================================
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.resumed": {
			const subscription = event.data.object as Stripe.Subscription;
			await subscriptionService.handleSubscriptionUpdated(subscription);
			break;
		}

		case "customer.subscription.deleted":
		case "customer.subscription.paused": {
			const subscription = event.data.object as Stripe.Subscription;
			await subscriptionService.handleSubscriptionDeleted(subscription);
			break;
		}

		// =========================================================================
		// INVOICE EVENTS
		// =========================================================================
		case "invoice.paid": {
			const invoice = event.data.object as Stripe.Invoice;
			await subscriptionService.handleInvoicePaid(invoice);

			// Check if this is an enterprise license renewal
			// Type assertion for invoice with subscription property
			const invoiceData = invoice as unknown as {
				subscription?: string | null;
			};
			if (invoiceData.subscription) {
				const licenseRepository = new LicenseRepository(c.env.DB);
				const licenseService = new LicenseService(
					licenseRepository,
					stripe,
					c.env.LICENSE_PRIVATE_KEY || "",
					c.env.LICENSE_PUBLIC_KEY || "",
				);
				await licenseService.handleStripeInvoicePaid(invoiceData.subscription);
			}
			break;
		}

		case "invoice.payment_failed": {
			const invoice = event.data.object as Stripe.Invoice;
			console.warn(
				`[Webhook] Invoice payment failed: ${invoice.id} for customer ${invoice.customer}`,
			);
			// Could send notification or update status
			break;
		}

		case "invoice.upcoming": {
			// Good time to ensure usage is reported
			const invoice = event.data.object as Stripe.Invoice;
			console.log(
				`[Webhook] Upcoming invoice: ${invoice.id} for customer ${invoice.customer}`,
			);
			break;
		}

		// =========================================================================
		// CHECKOUT EVENTS
		// =========================================================================
		case "checkout.session.completed": {
			const session = event.data.object as Stripe.Checkout.Session;

			// If mode is subscription, the subscription webhook will handle it
			if (session.mode === "subscription" && session.subscription) {
				console.log(
					`[Webhook] Checkout completed, subscription ${session.subscription} will be handled by subscription webhook`,
				);
			}
			break;
		}

		// =========================================================================
		// CUSTOMER EVENTS
		// =========================================================================
		case "customer.created": {
			// We create customers ourselves, but log for tracking
			const customer = event.data.object as Stripe.Customer;
			console.log(`[Webhook] Customer created: ${customer.id}`);
			break;
		}

		case "customer.updated": {
			// Sync customer metadata back if needed
			const customer = event.data.object as Stripe.Customer;
			console.log(`[Webhook] Customer updated: ${customer.id}`);
			break;
		}

		case "customer.deleted": {
			// Customer deleted in Stripe - clean up our records
			const customer = event.data.object as Stripe.Customer;
			console.warn(`[Webhook] Customer deleted: ${customer.id}`);
			break;
		}

		default:
			console.log(`[Webhook] Unhandled event type: ${event.type}`);
	}
}

export { webhookRoutes };
