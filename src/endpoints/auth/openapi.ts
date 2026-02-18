import { contentJson, OpenAPIRoute } from "chanfana";
import { AppContext } from "../../types";
import { z } from "zod";

/**
 * Better Auth endpoints documentation for OpenAPI
 * These endpoints are handled by Better Auth internally, but documented here for API reference
 */

const ErrorResponseSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	errors: z
		.array(
			z.object({
				code: z.number(),
				message: z.string(),
			}),
		)
		.optional(),
});

const SuccessResponseSchema = z.object({
	success: z.boolean(),
	data: z.any().optional(),
});

export class AuthSignUpEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Authentication"],
		summary: "Sign up a new user",
		operationId: "auth-sign-up",
		request: {
			body: contentJson(
				z.object({
					email: z.string().email(),
					password: z.string().min(8),
					name: z.string().optional(),
				}),
			),
		},
		responses: {
			"200": {
				description: "User created successfully",
				...contentJson(SuccessResponseSchema),
			},
			"400": {
				description: "Bad request",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		// This is just for OpenAPI documentation
		// Actual implementation is handled by Better Auth
		throw new Error("This endpoint is handled by Better Auth");
	}
}

export class AuthSignInEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Authentication"],
		summary: "Sign in a user",
		operationId: "auth-sign-in",
		request: {
			body: contentJson(
				z.object({
					email: z.string().email(),
					password: z.string(),
				}),
			),
		},
		responses: {
			"200": {
				description: "Sign in successful",
				...contentJson(SuccessResponseSchema),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by Better Auth");
	}
}

export class AuthSignOutEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Authentication"],
		summary: "Sign out the current user",
		operationId: "auth-sign-out",
		responses: {
			"200": {
				description: "Sign out successful",
				...contentJson(SuccessResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by Better Auth");
	}
}

export class AuthSessionEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Authentication"],
		summary: "Get current session",
		operationId: "auth-session",
		responses: {
			"200": {
				description: "Current session data",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z
							.object({
								user: z
									.object({
										id: z.string(),
										email: z.string(),
										name: z.string().optional(),
										emailVerified: z.boolean(),
									})
									.optional(),
								session: z
									.object({
										id: z.string(),
										expiresAt: z.string(),
									})
									.optional(),
							})
							.optional(),
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
		throw new Error("This endpoint is handled by Better Auth");
	}
}
