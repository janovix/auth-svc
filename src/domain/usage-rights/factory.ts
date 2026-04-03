/**
 * Construct UsageRightsService with pricing, overage settings, and optional Stripe.
 */

import Stripe from "stripe";
import type { Bindings } from "../../types/bindings";
import { OverageRepository } from "../overage/repository";
import { PricingRepository } from "../pricing/repository";
import { SubscriptionRepository, SubscriptionService } from "../subscription";
import { UsageRightsRepository } from "./repository";
import { UsageRightsService } from "./service";

export function createUsageRightsServiceFromEnv(
	env: Bindings,
): UsageRightsService {
	const db = env.DB;
	const pricingRepo = new PricingRepository(db);
	const stripe = env.STRIPE_SECRET_KEY
		? new Stripe(env.STRIPE_SECRET_KEY, { timeout: 15_000 })
		: null;
	const subscriptionService = new SubscriptionService(
		new SubscriptionRepository(db),
		stripe,
		pricingRepo,
	);
	return new UsageRightsService(
		new UsageRightsRepository(db),
		pricingRepo,
		new OverageRepository(db),
		subscriptionService,
	);
}
