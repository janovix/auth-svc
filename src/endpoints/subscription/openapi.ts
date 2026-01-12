/**
 * OpenAPI documentation endpoints for Subscription API
 */
import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import {
	planTierSchema,
	subscriptionStatusSchema,
	featureSchema,
	createCheckoutInputSchema,
	changePlanInputSchema,
} from "../../domain/subscription/schemas";

// Common schemas
const ErrorResponseSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
	message: z.string().optional(),
});

const UsageSchema = z.object({
	notices: z.number(),
	alerts: z.number(),
	transactions: z.number(),
	users: z.number(),
});

const SubscriptionStatusSchema = z.object({
	hasSubscription: z.boolean(),
	isEnterprise: z.boolean(),
	status: subscriptionStatusSchema,
	planTier: planTierSchema,
	planName: z.string().nullable(),
	currentPeriodStart: z.string().datetime().nullable(),
	currentPeriodEnd: z.string().datetime().nullable(),
	cancelAtPeriodEnd: z.boolean(),
	usage: UsageSchema.nullable(),
	features: z.array(featureSchema),
});

const PlanSchema = z.object({
	id: z.string(),
	name: z.string(),
	tier: planTierSchema,
	price: z.number(),
	currency: z.string(),
	interval: z.enum(["month", "year"]),
	features: z.array(featureSchema),
	limits: z.object({
		notices: z.number().nullable(),
		alerts: z.number().nullable(),
		transactions: z.number().nullable(),
		users: z.number().nullable(),
	}),
});

const InvoiceSchema = z.object({
	id: z.string(),
	amount: z.number(),
	currency: z.string(),
	status: z.string(),
	created: z.number(),
	periodStart: z.number().nullable(),
	periodEnd: z.number().nullable(),
	pdf: z.string().url().nullable(),
	hostedInvoiceUrl: z.string().url().nullable(),
});

/**
 * GET /api/subscription - Get current organization's subscription status
 */
export class GetSubscriptionStatusEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Subscription"],
		summary: "Get current organization's subscription status and usage",
		operationId: "subscription-get-status",
		responses: {
			"200": {
				description: "Subscription status",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: SubscriptionStatusSchema,
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by subscription routes");
	}
}

/**
 * GET /api/subscription/plans - Get available subscription plans
 */
export class GetSubscriptionPlansEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Subscription"],
		summary: "Get available subscription plans",
		operationId: "subscription-get-plans",
		responses: {
			"200": {
				description: "List of available plans",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.array(PlanSchema),
					}),
				),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by subscription routes");
	}
}

/**
 * POST /api/subscription/checkout - Create Stripe Checkout session
 */
export class CreateCheckoutSessionEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Subscription"],
		summary: "Create a Stripe Checkout session for subscribing to a plan",
		operationId: "subscription-create-checkout",
		request: {
			body: contentJson(createCheckoutInputSchema),
		},
		responses: {
			"200": {
				description: "Checkout session created",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.object({
							sessionId: z.string(),
							url: z.string().url(),
						}),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Owner access required",
				...contentJson(ErrorResponseSchema),
			},
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by subscription routes");
	}
}

/**
 * POST /api/subscription/change - Change subscription plan
 */
export class ChangeSubscriptionPlanEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Subscription"],
		summary: "Change (upgrade/downgrade) the current plan",
		operationId: "subscription-change-plan",
		request: {
			body: contentJson(changePlanInputSchema),
		},
		responses: {
			"200": {
				description: "Plan changed successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						message: z.string(),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Owner access required",
				...contentJson(ErrorResponseSchema),
			},
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by subscription routes");
	}
}

/**
 * POST /api/subscription/cancel - Cancel subscription
 */
export class CancelSubscriptionEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Subscription"],
		summary: "Cancel subscription at period end",
		operationId: "subscription-cancel",
		responses: {
			"200": {
				description: "Subscription cancellation scheduled",
				...contentJson(
					z.object({
						success: z.boolean(),
						message: z.string(),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Owner access required",
				...contentJson(ErrorResponseSchema),
			},
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by subscription routes");
	}
}

/**
 * POST /api/subscription/reactivate - Reactivate subscription
 */
export class ReactivateSubscriptionEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Subscription"],
		summary: "Reactivate a canceled subscription",
		operationId: "subscription-reactivate",
		responses: {
			"200": {
				description: "Subscription reactivated",
				...contentJson(
					z.object({
						success: z.boolean(),
						message: z.string(),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Owner access required",
				...contentJson(ErrorResponseSchema),
			},
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by subscription routes");
	}
}

/**
 * GET /api/subscription/invoices - Get invoice history
 */
export class GetSubscriptionInvoicesEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Subscription"],
		summary: "Get invoice history",
		operationId: "subscription-get-invoices",
		request: {
			query: z.object({
				limit: z.coerce.number().int().min(1).max(100).default(10).optional(),
			}),
		},
		responses: {
			"200": {
				description: "List of invoices",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.array(InvoiceSchema),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by subscription routes");
	}
}

/**
 * POST /api/subscription/portal - Get Stripe Customer Portal URL
 */
export class GetCustomerPortalEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Subscription"],
		summary: "Get Stripe Customer Portal URL",
		operationId: "subscription-get-portal",
		request: {
			body: contentJson(
				z.object({
					returnUrl: z.string().url("Return URL must be a valid URL"),
				}),
			),
		},
		responses: {
			"200": {
				description: "Portal session URL",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.object({
							url: z.string().url(),
						}),
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Owner access required",
				...contentJson(ErrorResponseSchema),
			},
			"404": {
				description: "No billing account found",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by subscription routes");
	}
}

/**
 * GET /api/subscription/usage - Get current usage
 */
export class GetSubscriptionUsageEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Subscription"],
		summary: "Get current usage for the billing period",
		operationId: "subscription-get-usage",
		responses: {
			"200": {
				description: "Current usage",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: UsageSchema,
					}),
				),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by subscription routes");
	}
}
