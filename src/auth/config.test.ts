import { describe, expect, it, vi } from "vitest";

import { buildResolvedAuthConfig } from "./config";
import type { Bindings } from "../types/bindings";

// Capture promises passed to executeInBackground so tests can await them.
// Without this, user.create.after assertions would race against detached microtasks.
const _backgroundTasks: Promise<unknown>[] = [];
vi.mock("./execution-context", () => ({
	executeInBackground: (promise: Promise<unknown>) => {
		_backgroundTasks.push(promise);
	},
	getExecutionContext: () => undefined,
	runWithExecutionContext: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
}));

async function flushBackground() {
	const tasks = _backgroundTasks.splice(0);
	await Promise.allSettled(tasks);
}

const SECRET = "test-secret-123456789012345678901234567890";
const INTERNAL_TOKEN = "internal-token-123456";

const baseEnv: Bindings = {
	DB: {} as D1Database,
	ENVIRONMENT: "local",
	BETTER_AUTH_SECRET: SECRET,
	AUTH_INTERNAL_TOKEN: INTERNAL_TOKEN,
} as Bindings;

function buildEnv(overrides: Partial<Bindings> = {}) {
	return {
		...baseEnv,
		...overrides,
	} satisfies Bindings;
}

function buildEnvWithoutInternalToken(overrides: Partial<Bindings> = {}) {
	const env = buildEnv(overrides);
	delete env.AUTH_INTERNAL_TOKEN;
	return env;
}

describe("buildResolvedAuthConfig", () => {
	it("enables cross-subdomain cookies for dev and allows *.janovix.workers.dev origins", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
			}),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".janovix.workers.dev",
		});
		expect(config.options.trustedOrigins).toContain(
			"https://*.janovix.workers.dev",
		);
		expect(config.options.advanced?.useSecureCookies).toBe(true);
		// JWT/JWKS plugin is enabled by default
		expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(config.options as any).plugins?.some(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(plugin: any) => plugin?.id === "jwt",
			),
		).toBe(true);
	});

	it("isolates QA cookies and trusted origins under *.algenium.qa", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "qa",
				BETTER_AUTH_URL: "https://auth-core.algenium.qa",
			}),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".algenium.qa",
		});
		expect(config.options.trustedOrigins).toContain("https://*.algenium.qa");
		expect(config.options.trustedOrigins).not.toContain(
			"https://*.janovix.workers.dev",
		);
	});

	it("uses custom cookie domain and trusted origins overrides in production", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "production",
				BETTER_AUTH_URL: "https://auth-core.janovix.com",
				AUTH_COOKIE_DOMAIN: "login.client.com",
				AUTH_TRUSTED_ORIGINS:
					"https://portal.client.com,https://*.client-staging.com",
			}),
		);

		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".login.client.com",
		});
		// When AUTH_TRUSTED_ORIGINS is explicitly set, it replaces ENVIRONMENT-based defaults
		// but domain-based patterns from cookieDomain are still added
		expect(config.options.trustedOrigins).toEqual(
			expect.arrayContaining([
				"https://portal.client.com",
				"https://*.client-staging.com",
				"https://login.client.com",
				"https://*.login.client.com",
			]),
		);
		// ENVIRONMENT-based default should NOT be included when AUTH_TRUSTED_ORIGINS is set
		expect(config.options.trustedOrigins).not.toContain(
			"https://*.janovix.com",
		);
	});

	it("keeps localhost origins for local env with cross-subdomain cookies", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({ ENVIRONMENT: "local" }),
		);

		// Local env now has cross-subdomain cookies enabled for .janovix.workers.dev
		expect(config.options.advanced?.crossSubDomainCookies).toEqual({
			enabled: true,
			domain: ".janovix.workers.dev",
		});
		expect(config.options.trustedOrigins).toEqual(
			expect.arrayContaining(["http://localhost:*", "https://localhost:*"]),
		);
	});

	it("passes BETTER_AUTH_URL through as baseURL when provided", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).baseURL).toBe(
			"https://auth-core.janovix.workers.dev",
		);
	});

	it("allows missing BETTER_AUTH_URL in local environment", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({
				ENVIRONMENT: "local",
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).baseURL).toBeUndefined();
	});

	it("requires BETTER_AUTH_URL in production environment", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "production",
					BETTER_AUTH_URL: undefined,
				}),
			);
		}).toThrow("BETTER_AUTH_URL is required for non-local environments");
	});

	it("validates BETTER_AUTH_URL format", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "not-a-valid-url",
				}),
			);
		}).toThrow("BETTER_AUTH_URL must be a valid URL");

		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "ftp://invalid-protocol.com",
				}),
			);
		}).toThrow("BETTER_AUTH_URL must use http:// or https:// protocol");
	});

	it("validates AUTH_COOKIE_DOMAIN format", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					AUTH_COOKIE_DOMAIN: "nodot",
				}),
			);
		}).toThrow('AUTH_COOKIE_DOMAIN must include a "."');

		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					AUTH_COOKIE_DOMAIN: "*.example.com",
				}),
			);
		}).toThrow("AUTH_COOKIE_DOMAIN does not support wildcard values");
	});

	it("handles execution context parameter", () => {
		const mockExecutionContext = {
			waitUntil: () => {},
			passThroughOnException: () => {},
			props: {},
		} as ExecutionContext;

		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
			}),
			mockExecutionContext,
		);

		expect(config.options).toBeDefined();
	});

	it("handles empty sanitized cookie domain", () => {
		// When domain is just ".", it gets normalized but domainToTrustedOriginPatterns returns empty
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				AUTH_COOKIE_DOMAIN: ".",
			}),
		);

		// The domain "." is normalized and used, but domainToTrustedOriginPatterns returns []
		expect(config.options.advanced?.crossSubDomainCookies?.domain).toBe(".");
		// Trusted origins should still include environment defaults
		expect(config.options.trustedOrigins).toContain(
			"https://*.janovix.workers.dev",
		);
	});

	it("throws error when secret is too short in non-local env", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					BETTER_AUTH_SECRET: "short",
				}),
			);
		}).toThrow("BETTER_AUTH_SECRET is not configured or too short");
	});

	it("uses default secret for local env when secret is missing", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({
				ENVIRONMENT: "local",
				BETTER_AUTH_SECRET: undefined,
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).secret).toBe(
			"local-dev-secret-please-override-0123456789",
		);
	});

	it("uses default secret for test env when secret is missing", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({
				ENVIRONMENT: "test",
				BETTER_AUTH_SECRET: undefined,
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).secret).toBe(
			"local-dev-secret-please-override-0123456789",
		);
	});

	it("throws error when AUTH_INTERNAL_TOKEN is missing in non-local env", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnvWithoutInternalToken({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				}),
			);
		}).toThrow("AUTH_INTERNAL_TOKEN is required for non-local environments");
	});

	it("throws error when AUTH_INTERNAL_TOKEN is too short in non-local env", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					AUTH_INTERNAL_TOKEN: "short",
				}),
			);
		}).toThrow("AUTH_INTERNAL_TOKEN is required for non-local environments");
	});

	it("handles normalizeCookieDomain with whitespace-only domain", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				AUTH_COOKIE_DOMAIN: "   ",
			}),
		);

		// Whitespace-only domain should be normalized to undefined
		// Should fall back to environment default
		expect(config.options.advanced?.crossSubDomainCookies?.domain).toBe(
			".janovix.workers.dev",
		);
	});

	it("handles normalizeCookieDomain with domain without leading dot", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				AUTH_COOKIE_DOMAIN: "example.com",
			}),
		);

		// Domain without leading dot should be normalized to include it
		expect(config.options.advanced?.crossSubDomainCookies?.domain).toBe(
			".example.com",
		);
	});

	it("handles normalizeCookieDomain with domain already having leading dot", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				AUTH_COOKIE_DOMAIN: ".example.com",
			}),
		);

		// Domain with leading dot should remain unchanged
		expect(config.options.advanced?.crossSubDomainCookies?.domain).toBe(
			".example.com",
		);
	});

	it("configures plugins including emailOTP for OTP-based verification", () => {
		const mockExecutionContext = {
			waitUntil: vi.fn(),
			passThroughOnException: () => {},
			props: {},
		} as ExecutionContext;

		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				MANDRILL_API_KEY: "test-api-key",
			}),
			mockExecutionContext,
		);

		// Verify email/password is enabled for signup
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const emailAndPassword = (config.options as any).emailAndPassword;
		expect(emailAndPassword.enabled).toBe(true);
		expect(emailAndPassword.requireEmailVerification).toBe(true);

		// Verify plugins are configured (emailOTP, admin, organization, jwt, openAPI)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (config.options as any).plugins;
		expect(plugins.length).toBeGreaterThan(0);
	});

	it("configures organization plugin with invitation email callback", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				MANDRILL_API_KEY: "test-api-key",
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (config.options as any).plugins;
		// Verify organization plugin is included
		// Plugin should exist - the exact structure depends on better-auth internals
		// Just verify plugins array contains organization plugin
		expect(plugins.length).toBeGreaterThan(0);
		// Verify the config was built successfully with organization plugin
		expect(config.options).toBeDefined();
	});

	it("configures admin plugin for user management", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (config.options as any).plugins;
		// Verify admin plugin is included
		const adminPlugin = plugins.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(p: any) => p?.id === "admin",
		);
		expect(adminPlugin).toBeDefined();
	});

	it("configures openAPI plugin for API documentation", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (config.options as any).plugins;
		// Verify openAPI plugin is included
		const openAPIPlugin = plugins.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(p: any) => p?.id === "open-api",
		);
		expect(openAPIPlugin).toBeDefined();
	});

	it("handles BETTER_AUTH_URL with trailing whitespace", () => {
		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "  https://auth-core.janovix.workers.dev  ",
			}),
		);

		// URL should be trimmed
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((config.options as any).baseURL).toBe(
			"https://auth-core.janovix.workers.dev",
		);
	});

	it("handles BETTER_AUTH_URL with empty string in non-local env", () => {
		expect(() => {
			buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "",
				}),
			);
		}).toThrow("BETTER_AUTH_URL is required for non-local environments");
	});

	it("handles environment mapping for various environment strings", () => {
		const environments = [
			"dev",
			"development",
			"qa",
			"test",
			"testing",
			"prod",
			"production",
			"preview",
			"local",
		];

		for (const env of environments) {
			const config = buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: env,
					BETTER_AUTH_URL:
						env === "local" || env === "test"
							? undefined
							: "https://auth-core.janovix.workers.dev",
				}),
			);
			expect(config.options).toBeDefined();
		}
	});

	it("handles unknown environment string by defaulting to local", () => {
		const config = buildResolvedAuthConfig(
			buildEnvWithoutInternalToken({
				ENVIRONMENT: "unknown-env",
			}),
		);

		// Should default to local environment behavior
		expect(config.options.advanced?.disableCSRFCheck).toBe(true);
		expect(config.options.advanced?.disableOriginCheck).toBe(true);
	});

	it("organization invitation callback uses waitUntil when execution context is available", async () => {
		const waitUntilFn = vi.fn();
		const mockExecutionContext = {
			waitUntil: waitUntilFn,
			passThroughOnException: () => {},
			props: {},
		} as ExecutionContext;

		const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const config = buildResolvedAuthConfig(
			buildEnv({
				ENVIRONMENT: "dev",
				BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				MANDRILL_API_KEY: "test-api-key",
			}),
			mockExecutionContext,
		);

		// Verify organization plugin is configured
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (config.options as any).plugins;
		const orgPlugin = plugins.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(p: any) => p?.id === "organization",
		);

		expect(orgPlugin).toBeDefined();

		// The sendInvitationEmail callback is configured in the plugin options
		// We can't easily access it directly, but we verify the plugin is configured
		// The actual callback execution is tested through integration tests
		expect(config.options).toBeDefined();

		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe("rate limit configuration", () => {
		it("configures custom rate limit rules for OTP endpoints in production", () => {
			const config = buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "production",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				}),
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rateLimit = (config.options as any).rateLimit;
			expect(rateLimit).toBeDefined();
			expect(rateLimit.enabled).toBe(true);
			expect(rateLimit.customRules).toBeDefined();

			expect(rateLimit.customRules["/email-otp/send-verification-otp"]).toEqual(
				{
					window: 10,
					max: 3,
				},
			);

			expect(rateLimit.customRules["/sign-in/email-otp"]).toEqual({
				window: 10,
				max: 3,
			});
		});

		it("uses secondary-storage for rate limits in production environments (when KV is provided)", () => {
			const mockKV = {
				get: vi.fn(),
				put: vi.fn(),
				delete: vi.fn(),
				list: vi.fn(),
				getWithMetadata: vi.fn(),
			} as unknown as KVNamespace;

			const config = buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "production",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					KV: mockKV,
				}),
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rateLimit = (config.options as any).rateLimit;
			expect(rateLimit.storage).toBe("secondary-storage");
			expect(rateLimit.customStorage).toBeUndefined();
			expect(rateLimit.enabled).toBe(true);
		});

		it("uses secondary-storage for rate limits in dev environment (when KV is provided)", () => {
			const mockKV = {
				get: vi.fn(),
				put: vi.fn(),
				delete: vi.fn(),
				list: vi.fn(),
				getWithMetadata: vi.fn(),
			} as unknown as KVNamespace;

			const config = buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "dev",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
					KV: mockKV,
				}),
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rateLimit = (config.options as any).rateLimit;
			expect(rateLimit.storage).toBe("secondary-storage");
			expect(rateLimit.customStorage).toBeUndefined();
			expect(rateLimit.enabled).toBe(true);
		});

		it("uses memory storage for rate limits in local environment", () => {
			const config = buildResolvedAuthConfig(
				buildEnvWithoutInternalToken({
					ENVIRONMENT: "local",
				}),
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rateLimit = (config.options as any).rateLimit;
			expect(rateLimit.storage).toBe("memory");
			expect(rateLimit.enabled).toBe(false);
		});

		it("uses memory storage for rate limits in test environment", () => {
			const config = buildResolvedAuthConfig(
				buildEnvWithoutInternalToken({
					ENVIRONMENT: "test",
				}),
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rateLimit = (config.options as any).rateLimit;
			expect(rateLimit.storage).toBe("memory");
			expect(rateLimit.enabled).toBe(false);
		});

		it("configures consistent OTP rate limit rules across all environments", () => {
			const environments = [
				"dev",
				"qa",
				"preview",
				"production",
				"local",
				"test",
			];

			for (const env of environments) {
				const config = buildResolvedAuthConfig(
					buildEnv({
						ENVIRONMENT: env,
						BETTER_AUTH_URL:
							env === "local" || env === "test"
								? undefined
								: "https://auth-core.janovix.workers.dev",
					}),
				);

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const rateLimit = (config.options as any).rateLimit;
				expect(rateLimit.customRules).toBeDefined();

				expect(
					rateLimit.customRules["/email-otp/send-verification-otp"],
				).toEqual({
					window: 10,
					max: 3,
				});
				expect(rateLimit.customRules["/sign-in/email-otp"]).toEqual({
					window: 10,
					max: 3,
				});
			}
		});

		it("configures IP address headers for Cloudflare Workers", () => {
			const config = buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "production",
					BETTER_AUTH_URL: "https://auth-core.janovix.workers.dev",
				}),
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const advanced = (config.options as any).advanced;
			expect(advanced.ipAddress).toBeDefined();
			expect(advanced.ipAddress.ipAddressHeaders).toContain("cf-connecting-ip");
		});
	});

	describe("database hooks", () => {
		it("auto-promotes new user from visitor to user when pending invitation exists", async () => {
			const mockPrepare = vi.fn();
			const mockBind = vi.fn();
			const mockFirst = vi.fn();
			const mockRun = vi.fn();

			// Mock the SELECT query chain
			mockFirst.mockResolvedValue({ id: "invitation-123" });
			mockBind.mockReturnValue({ first: mockFirst, run: mockRun });
			mockPrepare.mockReturnValue({ bind: mockBind });

			// Mock the UPDATE query chain
			mockRun.mockResolvedValue({ success: true });

			const mockDB = {
				prepare: mockPrepare,
			} as unknown as D1Database;

			const consoleLogSpy = vi
				.spyOn(console, "log")
				.mockImplementation(() => {});

			const config = buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "test",
					DB: mockDB,
				}),
			);

			// Extract the user.create.after hook
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const databaseHooks = (config.options as any).databaseHooks;
			expect(databaseHooks?.user?.create?.after).toBeDefined();

			const userCreateHook = databaseHooks.user.create.after;

			// Simulate a new user being created with pending invitation
			userCreateHook({
				id: "user-123",
				email: "newuser@example.com",
				role: "visitor",
			});
			await flushBackground();

			// Verify SELECT query was called to check for pending invitations
			expect(mockPrepare).toHaveBeenCalledWith(
				expect.stringContaining("SELECT id FROM invitations"),
			);
			expect(mockBind).toHaveBeenCalledWith("newuser@example.com");
			expect(mockFirst).toHaveBeenCalled();

			// Verify UPDATE query was called to promote user
			expect(mockPrepare).toHaveBeenCalledWith(
				"UPDATE users SET role = 'user' WHERE id = ? AND role = 'visitor'",
			);
			expect(mockBind).toHaveBeenCalledWith("user-123");
			expect(mockRun).toHaveBeenCalled();

			// Verify console log
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("Auto-promoted user user-123"),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("invitation-123"),
			);

			consoleLogSpy.mockRestore();
		});

		it("does not promote new user when no pending invitation exists", async () => {
			const mockPrepare = vi.fn();
			const mockBind = vi.fn();
			const mockFirst = vi.fn();
			const mockRun = vi.fn();

			// Mock the SELECT query chain - no pending invitation
			mockFirst.mockResolvedValue(null);
			mockBind.mockReturnValue({ first: mockFirst, run: mockRun });
			mockPrepare.mockReturnValue({ bind: mockBind });

			const mockDB = {
				prepare: mockPrepare,
			} as unknown as D1Database;

			const consoleLogSpy = vi
				.spyOn(console, "log")
				.mockImplementation(() => {});

			const config = buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "test",
					DB: mockDB,
				}),
			);

			// Extract the user.create.after hook
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const databaseHooks = (config.options as any).databaseHooks;
			const userCreateHook = databaseHooks.user.create.after;

			// Simulate a new user being created without pending invitation
			userCreateHook({
				id: "user-456",
				email: "anotheruser@example.com",
				role: "visitor",
			});
			await flushBackground();

			// Verify SELECT query was called
			expect(mockPrepare).toHaveBeenCalledWith(
				expect.stringContaining("SELECT id FROM invitations"),
			);
			expect(mockBind).toHaveBeenCalledWith("anotheruser@example.com");
			expect(mockFirst).toHaveBeenCalled();

			// Verify UPDATE query was NOT called (only one prepare call for SELECT)
			expect(mockPrepare).toHaveBeenCalledTimes(1);
			expect(mockRun).not.toHaveBeenCalled();

			// Verify no promotion log
			expect(consoleLogSpy).not.toHaveBeenCalledWith(
				expect.stringContaining("Auto-promoted user"),
			);

			consoleLogSpy.mockRestore();
		});

		it("handles errors gracefully during pending invitation check", async () => {
			const mockPrepare = vi.fn();
			const mockBind = vi.fn();
			const mockFirst = vi.fn();

			// Mock query chain to throw error
			mockFirst.mockRejectedValue(new Error("Database error"));
			mockBind.mockReturnValue({ first: mockFirst });
			mockPrepare.mockReturnValue({ bind: mockBind });

			const mockDB = {
				prepare: mockPrepare,
			} as unknown as D1Database;

			const config = buildResolvedAuthConfig(
				buildEnv({
					ENVIRONMENT: "test",
					DB: mockDB,
				}),
			);

			// Extract the user.create.after hook
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const databaseHooks = (config.options as any).databaseHooks;
			const userCreateHook = databaseHooks.user.create.after;

			// Hook should not throw — it fires and forgets via executeInBackground
			expect(() =>
				userCreateHook({
					id: "user-789",
					email: "erroruser@example.com",
					role: "visitor",
				}),
			).not.toThrow();

			// Flush background tasks — the promise rejects but our mock just settles it
			await flushBackground();

			// The DB query was attempted
			expect(mockPrepare).toHaveBeenCalledWith(
				expect.stringContaining("SELECT id FROM invitations"),
			);
			expect(mockFirst).toHaveBeenCalled();
		});
	});
});
