import pkg from "../package.json";

const { version } = pkg;

/**
 * OpenAPI 3.1 Specification for Auth Service API
 * Single consolidated spec for documentation and client generation.
 */
export const openAPISpec = {
	openapi: "3.1.0",
	info: {
		title: "auth-svc",
		version,
		description:
			"Authentication and authorization service providing sign-up/sign-in flows, session management, organization membership, subscription billing, API key management, and usage-rights enforcement for the Janovix platform.",
		contact: {
			name: "API Support",
			email: "hostmaster@algenium.systems",
		},
	},
	tags: [
		{ name: "Health", description: "Liveness and readiness checks" },
		{
			name: "Authentication",
			description: "Sign up, sign in, sign out, session",
		},
		{ name: "Settings", description: "User and organization settings" },
		{
			name: "AML Settings",
			description: "AML compliance settings (proxied to aml-svc)",
		},
		{ name: "Audit", description: "Audit log management" },
		{ name: "Subscription", description: "Subscription status and usage" },
		{ name: "API Keys", description: "Organization API keys" },
		{ name: "Usage Rights", description: "Entitlement checks and metering" },
		{ name: "Upload", description: "Avatar and file uploads" },
		{ name: "Admin", description: "Platform admin endpoints" },
		{ name: "Dummy", description: "Example endpoint" },
	],
	paths: {
		"/healthz": {
			get: {
				tags: ["Health"],
				summary: "Health check",
				responses: {
					"200": {
						description: "Service is healthy",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: { ok: { type: "boolean" } },
								},
							},
						},
					},
				},
			},
		},
		"/api/auth/sign-up": {
			post: {
				tags: ["Authentication"],
				summary: "Sign up a new user",
				operationId: "auth-sign-up",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									email: { type: "string", format: "email" },
									password: { type: "string", minLength: 8 },
									name: { type: "string" },
								},
								required: ["email", "password"],
							},
						},
					},
				},
				responses: {
					"200": { description: "User created successfully" },
					"400": { description: "Bad request" },
				},
			},
		},
		"/api/auth/sign-in": {
			post: {
				tags: ["Authentication"],
				summary: "Sign in a user",
				operationId: "auth-sign-in",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									email: { type: "string", format: "email" },
									password: { type: "string" },
								},
								required: ["email", "password"],
							},
						},
					},
				},
				responses: {
					"200": { description: "Sign in successful" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/auth/sign-out": {
			post: {
				tags: ["Authentication"],
				summary: "Sign out the current user",
				operationId: "auth-sign-out",
				responses: { "200": { description: "Sign out successful" } },
			},
		},
		"/api/auth/session": {
			get: {
				tags: ["Authentication"],
				summary: "Get current session",
				operationId: "auth-session",
				responses: {
					"200": { description: "Current session data" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/settings/user": {
			get: {
				tags: ["Settings"],
				summary: "Get current user's settings",
				operationId: "settings-get-user",
				responses: {
					"200": { description: "User settings" },
					"401": { description: "Unauthorized" },
				},
			},
			patch: {
				tags: ["Settings"],
				summary: "Update current user's settings",
				operationId: "settings-update-user",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									theme: { type: "string", enum: ["light", "dark", "system"] },
									timezone: { type: "string" },
									language: { type: "string", enum: ["en", "es"] },
									dateFormat: { type: "string" },
									avatarUrl: { type: "string", format: "uri" },
								},
							},
						},
					},
				},
				responses: {
					"200": { description: "Updated user settings" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/settings/organization/{orgId}": {
			get: {
				tags: ["Settings"],
				summary: "Get organization default settings",
				operationId: "settings-get-organization",
				parameters: [
					{
						name: "orgId",
						in: "path",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				responses: {
					"200": { description: "Organization settings" },
					"401": { description: "Unauthorized" },
				},
			},
			patch: {
				tags: ["Settings"],
				summary: "Update organization settings (admin only)",
				operationId: "settings-update-organization",
				parameters: [
					{
						name: "orgId",
						in: "path",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									theme: { type: "string" },
									timezone: { type: "string" },
									language: { type: "string" },
									dateFormat: { type: "string" },
									avatarUrl: { type: "string", format: "uri" },
								},
							},
						},
					},
				},
				responses: {
					"200": { description: "Updated organization settings" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden - Admin access required" },
				},
			},
		},
		"/api/settings/organization/{orgId}/membership": {
			get: {
				tags: ["Settings"],
				summary: "Get user's membership/role in organization",
				operationId: "settings-get-organization-membership",
				parameters: [
					{
						name: "orgId",
						in: "path",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				responses: {
					"200": { description: "User's membership information" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/settings/resolved": {
			get: {
				tags: ["Settings"],
				summary: "Get merged settings",
				operationId: "settings-get-resolved",
				parameters: [
					{
						name: "headers",
						in: "query",
						description: "Base64-encoded JSON of browser headers",
						schema: { type: "string" },
					},
				],
				responses: {
					"200": { description: "Resolved settings with sources" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/settings/aml-compliance/{orgId}": {
			get: {
				tags: ["AML Settings"],
				summary: "Get AML compliance settings",
				operationId: "aml-settings-get",
				parameters: [
					{
						name: "orgId",
						in: "path",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				responses: {
					"200": { description: "AML compliance settings" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden" },
					"404": { description: "Settings not found" },
					"503": { description: "AML service not available" },
				},
			},
			put: {
				tags: ["AML Settings"],
				summary: "Create or update AML compliance settings",
				operationId: "aml-settings-put",
				parameters: [
					{
						name: "orgId",
						in: "path",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									rfc: { type: "string", nullable: true },
									vulnerableActivity: { type: "boolean" },
								},
							},
						},
					},
				},
				responses: {
					"200": { description: "AML compliance settings updated" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden" },
					"400": { description: "Bad request" },
					"503": { description: "AML service not available" },
				},
			},
			patch: {
				tags: ["AML Settings"],
				summary: "Partial update AML compliance settings",
				operationId: "aml-settings-patch",
				parameters: [
					{
						name: "orgId",
						in: "path",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									rfc: { type: "string", nullable: true },
									vulnerableActivity: { type: "boolean" },
								},
							},
						},
					},
				},
				responses: {
					"200": { description: "AML compliance settings updated" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden" },
					"400": { description: "Bad request" },
					"503": { description: "AML service not available" },
				},
			},
		},
		"/api/settings/aml-compliance/{orgId}/self-service": {
			patch: {
				tags: ["AML Settings"],
				summary: "Partial update KYC self-service settings",
				operationId: "aml-settings-self-service-patch",
				parameters: [
					{
						name: "orgId",
						in: "path",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									selfServiceMode: {
										type: "string",
										enum: ["disabled", "manual", "automatic"],
									},
									selfServiceExpiryHours: {
										type: "integer",
										minimum: 1,
										maximum: 720,
									},
									selfServiceRequiredSections: {
										type: "array",
										items: { type: "string" },
									},
								},
							},
						},
					},
				},
				responses: {
					"200": { description: "KYC self-service settings updated" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden" },
					"400": { description: "Bad request" },
					"503": { description: "AML service not available" },
				},
			},
		},
		"/api/audit": {
			get: {
				tags: ["Audit"],
				summary: "List audit logs with filters and pagination (admin only)",
				operationId: "audit-list",
				parameters: [
					{ name: "eventType", in: "query", schema: { type: "string" } },
					{ name: "entityType", in: "query", schema: { type: "string" } },
					{ name: "entityId", in: "query", schema: { type: "string" } },
					{
						name: "actorUserId",
						in: "query",
						schema: { type: "string", format: "uuid" },
					},
					{
						name: "actorOrganizationId",
						in: "query",
						schema: { type: "string", format: "uuid" },
					},
					{ name: "sourceService", in: "query", schema: { type: "string" } },
					{
						name: "startDate",
						in: "query",
						schema: { type: "string", format: "date-time" },
					},
					{
						name: "endDate",
						in: "query",
						schema: { type: "string", format: "date-time" },
					},
					{ name: "search", in: "query", schema: { type: "string" } },
					{
						name: "page",
						in: "query",
						schema: { type: "integer", default: 1 },
					},
					{
						name: "limit",
						in: "query",
						schema: { type: "integer", default: 20 },
					},
				],
				responses: {
					"200": { description: "Paginated list of audit logs" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden - Admin access required" },
				},
			},
		},
		"/api/audit/verify": {
			get: {
				tags: ["Audit"],
				summary: "Verify audit log chain integrity (admin only)",
				operationId: "audit-verify",
				parameters: [
					{
						name: "startId",
						in: "query",
						schema: { type: "string", format: "uuid" },
					},
					{
						name: "endId",
						in: "query",
						schema: { type: "string", format: "uuid" },
					},
					{
						name: "limit",
						in: "query",
						schema: { type: "integer", default: 1000 },
					},
				],
				responses: {
					"200": { description: "Chain integrity verification result" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden - Admin access required" },
				},
			},
		},
		"/api/audit/{id}": {
			get: {
				tags: ["Audit"],
				summary: "Get single audit log entry (admin only)",
				operationId: "audit-get",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				responses: {
					"200": { description: "Audit log entry" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden - Admin access required" },
					"404": { description: "Audit log not found" },
				},
			},
		},
		"/api/audit/export": {
			post: {
				tags: ["Audit"],
				summary: "Export audit logs as JSON or CSV (admin only)",
				operationId: "audit-export",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									format: {
										type: "string",
										enum: ["json", "csv"],
										default: "json",
									},
									filters: {
										type: "object",
										properties: {
											eventType: { type: "string" },
											entityType: { type: "string" },
											entityId: { type: "string" },
											actorUserId: { type: "string", format: "uuid" },
											actorOrganizationId: { type: "string", format: "uuid" },
											sourceService: { type: "string" },
											startDate: { type: "string", format: "date-time" },
											endDate: { type: "string", format: "date-time" },
										},
									},
								},
							},
						},
					},
				},
				responses: {
					"200": { description: "Exported audit logs file" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden - Admin access required" },
				},
			},
		},
		"/api/subscription/status": {
			get: {
				tags: ["Subscription"],
				summary: "Get subscription status",
				operationId: "subscriptionStatus",
				parameters: [
					{
						name: "resolveFromOrg",
						in: "query",
						schema: { type: "string", enum: ["true", "false"] },
					},
				],
				responses: {
					"200": { description: "Subscription status" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/subscription/can-create-org": {
			get: {
				tags: ["Subscription"],
				summary: "Check if can create organization",
				operationId: "subscriptionCanCreateOrg",
				responses: {
					"200": { description: "Check result" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/subscription/usage": {
			get: {
				tags: ["Subscription"],
				summary: "Get usage",
				operationId: "subscriptionUsage",
				responses: {
					"200": { description: "Usage data" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/subscription/features": {
			get: {
				tags: ["Subscription"],
				summary: "Get feature flags",
				operationId: "subscriptionFeatures",
				parameters: [
					{
						name: "resolveFromOrg",
						in: "query",
						schema: { type: "string", enum: ["true", "false"] },
					},
				],
				responses: {
					"200": { description: "Feature flags" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/api-keys": {
			get: {
				tags: ["API Keys"],
				summary: "List API keys",
				operationId: "apiKeysList",
				responses: {
					"200": { description: "List of API keys" },
					"401": { description: "Unauthorized" },
					"409": { description: "No active organization selected" },
				},
			},
			post: {
				tags: ["API Keys"],
				summary: "Create API key",
				operationId: "apiKeysCreate",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: { name: { type: "string" } },
								required: ["name"],
							},
						},
					},
				},
				responses: {
					"201": { description: "API key created" },
					"401": { description: "Unauthorized" },
					"409": { description: "No active organization or plan limit" },
				},
			},
		},
		"/api/api-keys/{id}/rotate": {
			post: {
				tags: ["API Keys"],
				summary: "Rotate API key",
				operationId: "apiKeysRotate",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": { description: "Key rotated" },
					"401": { description: "Unauthorized" },
					"404": { description: "API key not found" },
				},
			},
		},
		"/api/api-keys/{id}": {
			delete: {
				tags: ["API Keys"],
				summary: "Delete API key",
				operationId: "apiKeysDelete",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": { description: "API key deleted" },
					"401": { description: "Unauthorized" },
					"404": { description: "API key not found" },
				},
			},
		},
		"/api/usage-rights/check": {
			get: {
				tags: ["Usage Rights"],
				summary: "Check usage right",
				operationId: "usageRightsCheck",
				parameters: [
					{ name: "organizationId", in: "query", schema: { type: "string" } },
					{
						name: "metric",
						in: "query",
						required: true,
						schema: {
							type: "string",
							enum: [
								"reports",
								"notices",
								"alerts",
								"operations",
								"clients",
								"users",
								"watchlistQueries",
								"organizations",
							],
						},
					},
				],
				responses: {
					"200": { description: "Check result" },
					"400": { description: "Usage limit exceeded" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/usage-rights/meter": {
			post: {
				tags: ["Usage Rights"],
				summary: "Record usage",
				operationId: "usageRightsMeter",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									organizationId: { type: "string" },
									metric: {
										type: "string",
										enum: [
											"reports",
											"notices",
											"alerts",
											"operations",
											"clients",
											"users",
											"watchlistQueries",
											"organizations",
										],
									},
									quantity: { type: "number" },
								},
								required: ["metric"],
							},
						},
					},
				},
				responses: {
					"200": { description: "Usage recorded" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/usage-rights/gate": {
			post: {
				tags: ["Usage Rights"],
				summary: "Gate (check + meter)",
				operationId: "usageRightsGate",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									organizationId: { type: "string" },
									metric: {
										type: "string",
										enum: [
											"reports",
											"notices",
											"alerts",
											"operations",
											"clients",
											"users",
											"watchlistQueries",
											"organizations",
										],
									},
									quantity: { type: "number" },
								},
								required: ["metric"],
							},
						},
					},
				},
				responses: {
					"200": { description: "Gate passed" },
					"400": { description: "Gate failed - limit exceeded" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/usage-rights/entitlement": {
			get: {
				tags: ["Usage Rights"],
				summary: "Get entitlement",
				operationId: "usageRightsEntitlement",
				parameters: [
					{ name: "organizationId", in: "query", schema: { type: "string" } },
				],
				responses: {
					"200": { description: "Entitlement data" },
					"401": { description: "Unauthorized" },
				},
			},
		},
		"/api/upload/avatar/prepare": {
			post: {
				tags: ["Upload"],
				summary: "Prepare an avatar upload",
				operationId: "upload-prepare-avatar",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									contentType: {
										type: "string",
										enum: [
											"image/jpeg",
											"image/jpg",
											"image/png",
											"image/gif",
											"image/webp",
										],
									},
									contentLength: { type: "integer", maximum: 5 * 1024 * 1024 },
								},
								required: ["contentType", "contentLength"],
							},
						},
					},
				},
				responses: {
					"200": { description: "Upload prepared successfully" },
					"400": { description: "Invalid input" },
					"401": { description: "Unauthorized" },
					"503": { description: "Service unavailable" },
				},
			},
		},
		"/api/upload/avatar": {
			post: {
				tags: ["Upload"],
				summary: "Upload an avatar image",
				operationId: "upload-avatar",
				requestBody: {
					content: {
						"multipart/form-data": {
							schema: {
								type: "object",
								properties: {
									file: { type: "string", format: "binary" },
									key: { type: "string" },
								},
							},
						},
					},
				},
				responses: {
					"200": { description: "Avatar uploaded successfully" },
					"400": { description: "Invalid input" },
					"401": { description: "Unauthorized" },
					"500": { description: "Upload failed" },
					"503": { description: "Service unavailable" },
				},
			},
		},
		"/api/upload/avatar/{key}": {
			delete: {
				tags: ["Upload"],
				summary: "Delete an avatar image",
				operationId: "upload-delete-avatar",
				parameters: [
					{
						name: "key",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": { description: "Avatar deleted successfully" },
					"400": { description: "Invalid key" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden" },
					"500": { description: "Delete failed" },
					"503": { description: "Service unavailable" },
				},
			},
		},
		"/api/admin/stats": {
			get: {
				tags: ["Admin"],
				summary: "Get platform-wide statistics",
				operationId: "adminGetStats",
				security: [{ BearerAuth: [] }],
				responses: {
					"200": { description: "Platform statistics" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden - admin role required" },
					"500": { description: "Internal server error" },
				},
			},
		},
		"/api/admin/kv/flush": {
			delete: {
				tags: ["Admin"],
				summary: "Flush all KV cache entries",
				operationId: "adminKvFlush",
				security: [{ BearerAuth: [] }],
				responses: {
					"200": { description: "KV cache flushed successfully" },
					"401": { description: "Unauthorized" },
					"403": { description: "Forbidden - admin role required" },
					"503": { description: "Service unavailable" },
				},
			},
		},
		"/api/admin/users/{userId}/promote": {
			post: {
				tags: ["Admin"],
				summary: "Promote visitor to user",
				operationId: "adminPromoteUser",
				security: [{ BearerAuth: [] }],
				parameters: [
					{
						name: "userId",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": { description: "User promoted successfully" },
					"400": { description: "Bad request" },
					"403": { description: "Forbidden" },
					"404": { description: "User not found" },
					"500": { description: "Internal server error" },
				},
			},
		},
		"/dummy/{slug}": {
			post: {
				tags: ["Dummy"],
				summary: "Example endpoint",
				operationId: "example-endpoint",
				parameters: [
					{
						name: "slug",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: { name: { type: "string" } },
								required: ["name"],
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Returns the log details",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										success: { type: "boolean" },
										result: {
											type: "object",
											properties: {
												msg: { type: "string" },
												slug: { type: "string" },
												name: { type: "string" },
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	components: {
		securitySchemes: {
			BearerAuth: {
				type: "http",
				scheme: "bearer",
				bearerFormat: "JWT",
			},
		},
	},
};
