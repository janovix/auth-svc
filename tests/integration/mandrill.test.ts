import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	sendMandrillTemplate,
	sendPasswordResetEmail,
	sendVerificationEmail,
	sendOrganizationInvitationEmail,
	type MandrillMessage,
	type MandrillSendResponse,
} from "../../src/utils/mandrill";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Mandrill Email Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	describe("sendMandrillTemplate", () => {
		const apiKey = "test-api-key";
		const message: MandrillMessage = {
			to: [{ email: "[email protected]", type: "to" }],
			from_email: "[email protected]",
			from_name: "Test Sender",
			subject: "Test Subject",
			template_name: "test-template",
			global_merge_vars: [
				{ name: "var1", content: "value1" },
				{ name: "var2", content: "value2" },
			],
		};

		it("sends email successfully", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: "[email protected]",
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			const result = await sendMandrillTemplate(apiKey, message);

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledWith(
				"https://mandrillapp.com/api/1.0/messages/send-template.json",
				expect.objectContaining({
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
				}),
			);

			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
			expect(callBody.key).toBe(apiKey);
			expect(callBody.template_name).toBe("test-template");
			expect(callBody.message.to).toEqual(message.to);
			expect(callBody.message.global_merge_vars).toEqual(
				message.global_merge_vars,
			);

			expect(result).toEqual(mockResponse);
		});

		it("handles API errors", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				text: async () => "Invalid API key",
			});

			await expect(sendMandrillTemplate(apiKey, message)).rejects.toThrow(
				"Mandrill API error (400): Invalid API key",
			);
		});

		it("handles invalid JSON response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => "invalid json response",
			});

			await expect(sendMandrillTemplate(apiKey, message)).rejects.toThrow(
				"Mandrill API returned invalid JSON (200): invalid json response",
			);
		});

		it("handles message without global_merge_vars", async () => {
			const messageWithoutVars: MandrillMessage = {
				to: [{ email: "[email protected]", type: "to" }],
				from_email: "[email protected]",
				subject: "Test",
				template_name: "test-template",
			};

			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: "[email protected]",
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
			});

			await sendMandrillTemplate(apiKey, messageWithoutVars);
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it("handles non-Error exceptions in sendPasswordResetEmail", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error");
			mockFetch.mockRejectedValueOnce("String error");

			await sendPasswordResetEmail(apiKey, "[email protected]", "User", "url");

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[Mandrill] Failed to send password reset email",
				expect.objectContaining({
					toEmail: "[email protected]",
					error: "String error",
				}),
			);

			consoleErrorSpy.mockRestore();
		});

		it("handles non-Error exceptions in sendVerificationEmail", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error");
			mockFetch.mockRejectedValueOnce({ message: "Object error" });

			await sendVerificationEmail(apiKey, "[email protected]", "User", "url");

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[Mandrill] Failed to send verification email",
				expect.objectContaining({
					toEmail: "[email protected]",
					error: expect.any(String),
				}),
			);

			consoleErrorSpy.mockRestore();
		});

		it("handles rejected emails", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: "[email protected]",
					status: "rejected",
					reject_reason: "Invalid recipient",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			await expect(sendMandrillTemplate(apiKey, message)).rejects.toThrow(
				"Mandrill send failed: [email protected]: Invalid recipient",
			);
		});

		it("handles invalid email status", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: "[email protected]",
					status: "invalid",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			await expect(sendMandrillTemplate(apiKey, message)).rejects.toThrow(
				"Mandrill send failed: [email protected]: invalid",
			);
		});

		it("handles multiple recipients with mixed statuses", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id-1",
					email: "[email protected]",
					status: "sent",
				},
				{
					_id: "test-id-2",
					email: "[email protected]",
					status: "rejected",
					reject_reason: "Bounced",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			await expect(sendMandrillTemplate(apiKey, message)).rejects.toThrow(
				"Mandrill send failed: [email protected]: Bounced",
			);
		});
	});

	describe("sendPasswordResetEmail", () => {
		const apiKey = "test-api-key";
		const toEmail = "[email protected]";
		const userName = "John Doe";
		const resetUrl = "https://example.com/reset?token=abc123";

		it("sends password reset email with correct template variables", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: toEmail,
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			// Function returns void, so we need to wait a bit for the promise to resolve
			await sendPasswordResetEmail(apiKey, toEmail, userName, resetUrl);

			// Wait for the async operation to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);

			expect(callBody.template_name).toBe(
				"janovix-auth-password-recovery-template",
			);
			expect(callBody.message.to).toEqual([{ email: toEmail, type: "to" }]);
			expect(callBody.message.from_email).toBe("noreply@janovix.algenium.dev");
			expect(callBody.message.from_name).toBe("Janovix");
			expect(callBody.message.subject).toBe(
				"Restablecer tu contraseña - Janovix",
			);
			expect(callBody.message.global_merge_vars).toEqual([
				{ name: "env", content: userName },
				{ name: "recover_url", content: resetUrl },
			]);
		});

		it("uses custom template name when provided", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: toEmail,
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			const customTemplate = "custom-template";
			await sendPasswordResetEmail(
				apiKey,
				toEmail,
				userName,
				resetUrl,
				customTemplate,
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
			expect(callBody.template_name).toBe(customTemplate);
		});

		it("handles errors gracefully without throwing", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error");
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			// Should not throw
			await sendPasswordResetEmail(apiKey, toEmail, userName, resetUrl);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[Mandrill] Failed to send password reset email",
				expect.objectContaining({
					toEmail,
					error: "Network error",
				}),
			);

			consoleErrorSpy.mockRestore();
		});

		it("uses email as userName fallback", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: toEmail,
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			await sendPasswordResetEmail(apiKey, toEmail, "", resetUrl);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
			expect(callBody.message.global_merge_vars).toEqual([
				{ name: "env", content: "" },
				{ name: "recover_url", content: resetUrl },
			]);
		});
	});

	describe("sendVerificationEmail", () => {
		const apiKey = "test-api-key";
		const toEmail = "[email protected]";
		const userName = "John Doe";
		const verificationUrl = "https://example.com/verify?token=abc123";

		it("sends verification email with correct template variables", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: toEmail,
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			await sendVerificationEmail(apiKey, toEmail, userName, verificationUrl);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);

			expect(callBody.template_name).toBe(
				"janovix-auth-email-verification-template",
			);
			expect(callBody.message.to).toEqual([{ email: toEmail, type: "to" }]);
			expect(callBody.message.from_email).toBe("noreply@janovix.algenium.dev");
			expect(callBody.message.from_name).toBe("Janovix");
			expect(callBody.message.subject).toBe(
				"Verifica tu correo electrónico - Janovix",
			);
			expect(callBody.message.global_merge_vars).toEqual([
				{ name: "env", content: userName },
				{ name: "url", content: verificationUrl },
			]);
		});

		it("uses custom template name when provided", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: toEmail,
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			const customTemplate = "custom-verification-template";
			await sendVerificationEmail(
				apiKey,
				toEmail,
				userName,
				verificationUrl,
				customTemplate,
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
			expect(callBody.template_name).toBe(customTemplate);
		});

		it("handles errors gracefully without throwing", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error");
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			await sendVerificationEmail(apiKey, toEmail, userName, verificationUrl);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[Mandrill] Failed to send verification email",
				expect.objectContaining({
					toEmail,
					error: "Network error",
				}),
			);

			consoleErrorSpy.mockRestore();
		});

		it("uses email as userName fallback", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: toEmail,
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			await sendVerificationEmail(apiKey, toEmail, "", verificationUrl);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
			expect(callBody.message.global_merge_vars).toEqual([
				{ name: "env", content: "" },
				{ name: "url", content: verificationUrl },
			]);
		});
	});

	describe("sendOrganizationInvitationEmail", () => {
		const apiKey = "test-api-key";
		const invitation = {
			email: "[email protected]",
			inviteUrl: "https://example.com/invite?token=abc123",
			organizationName: "Test Organization",
			inviterName: "John Doe",
			role: "member" as const,
		};

		it("sends organization invitation email with correct template variables", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: invitation.email,
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			const consoleLogSpy = vi
				.spyOn(console, "log")
				.mockImplementation(() => {});

			await sendOrganizationInvitationEmail(apiKey, invitation);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);

			expect(callBody.template_name).toBe("janovix-org-invitation-template");
			expect(callBody.message.to).toEqual([
				{ email: invitation.email, type: "to" },
			]);
			expect(callBody.message.from_email).toBe("noreply@janovix.algenium.dev");
			expect(callBody.message.from_name).toBe("Janovix");
			expect(callBody.message.subject).toBe(
				`Invitation to join ${invitation.organizationName}`,
			);
			expect(callBody.message.global_merge_vars).toEqual([
				{ name: "org_name", content: invitation.organizationName },
				{ name: "inviter_name", content: invitation.inviterName },
				{ name: "invite_url", content: invitation.inviteUrl },
				{ name: "role", content: invitation.role },
			]);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				"[Mandrill] Organization invitation email sent successfully",
				{
					toEmail: invitation.email,
					organizationName: invitation.organizationName,
				},
			);

			consoleLogSpy.mockRestore();
		});

		it("uses default role when role is not provided", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: invitation.email,
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			const invitationWithoutRole = {
				...invitation,
				role: undefined,
			};

			await sendOrganizationInvitationEmail(apiKey, invitationWithoutRole);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
			const roleVar = callBody.message.global_merge_vars.find(
				(v: { name: string; content: string }) => v.name === "role",
			);
			expect(roleVar.content).toBe("member");
		});

		it("uses custom template name when provided", async () => {
			const mockResponse: MandrillSendResponse[] = [
				{
					_id: "test-id",
					email: invitation.email,
					status: "sent",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => JSON.stringify(mockResponse),
				json: async () => mockResponse,
			});

			const customTemplate = "custom-org-invitation-template";
			await sendOrganizationInvitationEmail(apiKey, invitation, customTemplate);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
			expect(callBody.template_name).toBe(customTemplate);
		});

		it("handles errors gracefully without throwing", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error");
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			await sendOrganizationInvitationEmail(apiKey, invitation);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[Mandrill] Failed to send org invitation email",
				{
					toEmail: invitation.email,
					organizationName: invitation.organizationName,
					templateName: "janovix-org-invitation-template",
					error: "Network error",
				},
			);

			consoleErrorSpy.mockRestore();
		});

		it("handles non-Error exceptions gracefully", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error");
			mockFetch.mockRejectedValueOnce("String error");

			await sendOrganizationInvitationEmail(apiKey, invitation);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[Mandrill] Failed to send org invitation email",
				{
					toEmail: invitation.email,
					organizationName: invitation.organizationName,
					templateName: "janovix-org-invitation-template",
					error: "String error",
				},
			);

			consoleErrorSpy.mockRestore();
		});
	});
});
