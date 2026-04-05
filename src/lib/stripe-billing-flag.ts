import type { Bindings } from "../types/bindings";

export const STRIPE_BILLING_FLAG_KEY = "stripe-billing-enabled";

/**
 * Whether Stripe self-serve billing is enabled (checkout, portal, webhooks, etc.).
 * When FLAGS_SERVICE is missing or RPC fails, returns true (fail-open) so existing
 * deployments without flags-svc keep prior behavior.
 */
export async function isStripeBillingEnabled(env: Bindings): Promise<boolean> {
	const binding = env.FLAGS_SERVICE;
	if (!binding) {
		return true;
	}
	try {
		const environment =
			typeof env.ENVIRONMENT === "string" ? env.ENVIRONMENT : "production";
		return await binding.isFlagEnabled(STRIPE_BILLING_FLAG_KEY, {
			environment,
		});
	} catch (err) {
		console.warn(
			"[stripe-billing-flag] FLAGS_SERVICE.isFlagEnabled failed; defaulting to enabled",
			err,
		);
		return true;
	}
}
