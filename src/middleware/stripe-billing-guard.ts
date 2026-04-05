import type { MiddlewareHandler } from "hono";
import type { Bindings } from "../types/bindings";
import { isStripeBillingEnabled } from "../lib/stripe-billing-flag";

type AppBindings = { Bindings: Bindings };

const BILLING_DISABLED_BODY = {
	success: false,
	error: "Stripe billing is currently disabled",
	code: "BILLING_DISABLED",
} as const;

/**
 * Blocks Stripe-only HTTP routes with 403 when `stripe-billing-enabled` is false.
 */
export function createStripeBillingGuard(): MiddlewareHandler<AppBindings> {
	return async (c, next) => {
		if (await isStripeBillingEnabled(c.env)) {
			return next();
		}
		return c.json(BILLING_DISABLED_BODY, 403);
	};
}

/**
 * Accepts Stripe webhooks with 200 and an empty JSON body when billing is disabled,
 * so Stripe does not retry indefinitely.
 */
export function createWebhookBillingGuard(): MiddlewareHandler<AppBindings> {
	return async (c, next) => {
		if (await isStripeBillingEnabled(c.env)) {
			return next();
		}
		return c.json({ received: true, ignored: true });
	};
}
