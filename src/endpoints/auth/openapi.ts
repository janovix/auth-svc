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

export class AuthJwksEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Authentication"],
		summary: "Get JSON Web Key Set (JWKS) for JWT verification",
		description:
			"Public endpoint that returns the JSON Web Key Set used to verify JWTs issued by this service. This endpoint is publicly accessible.",
		operationId: "auth-jwks",
		responses: {
			"200": {
				description: "JWKS data",
				...contentJson(
					z.object({
						keys: z.array(
							z.object({
								kty: z.string(),
								use: z.string().optional(),
								kid: z.string().optional(),
								alg: z.string().optional(),
								crv: z.string().optional(),
								x: z.string().optional(),
								y: z.string().optional(),
								n: z.string().optional(),
								e: z.string().optional(),
							}),
						),
					}),
				),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by Better Auth");
	}
}

export class AuthForgotPasswordEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Authentication"],
		summary: "Request password reset",
		description:
			"Sends a password reset email to the specified address. Requires Turnstile verification for bot protection.",
		operationId: "auth-forgot-password",
		request: {
			body: contentJson(
				z.object({
					email: z
						.string()
						.email()
						.describe("Email address to send reset link"),
					turnstileToken: z
						.string()
						.describe("Cloudflare Turnstile verification token"),
				}),
			),
		},
		responses: {
			"200": {
				description: "Password reset email sent",
				...contentJson(SuccessResponseSchema),
			},
			"400": {
				description: "Bad request (missing or invalid turnstile token)",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by Better Auth");
	}
}

export class AuthResetPasswordEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Authentication"],
		summary: "Reset password with token",
		operationId: "auth-reset-password",
		request: {
			body: contentJson(
				z.object({
					token: z.string(),
					password: z.string().min(8),
				}),
			),
		},
		responses: {
			"200": {
				description: "Password reset successful",
				...contentJson(SuccessResponseSchema),
			},
			"400": {
				description: "Invalid or expired token",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by Better Auth");
	}
}
