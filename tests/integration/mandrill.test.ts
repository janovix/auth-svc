import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	sendMandrillTemplate,
	sendOtpEmail,
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

	describe("sendOtpEmail", () => {
		const apiKey = "test-api-key";
		const toEmail = "[email protected]";
		const userName = "John Doe";
		const otp = "123456";

		it("sends OTP email with correct template variables for email-verification", async () => {
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

			const consoleLogSpy = vi
				.spyOn(console, "log")
				.mockImplementation(() => {});

			await sendOtpEmail(apiKey, toEmail, userName, otp, "email-verification");

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);

			expect(callBody.template_name).toBe("janovix-email-otp-template");
			expect(callBody.message.to).toEqual([{ email: toEmail, type: "to" }]);
			expect(callBody.message.from_email).toBe("noreply@janovix.com");
			expect(callBody.message.from_name).toBe("Janovix");
			expect(callBody.message.subject).toBe(
				"Tu código de verificación - Janovix",
			);
			expect(callBody.message.global_merge_vars).toEqual([
				{ name: "env", content: userName },
				{ name: "otp", content: otp },
				{ name: "type", content: "email-verification" },
			]);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				"[Mandrill] OTP email sent successfully",
				expect.objectContaining({
					toEmail,
					type: "email-verification",
				}),
			);

			consoleLogSpy.mockRestore();
		});

		it("sends OTP email with correct subject for sign-in", async () => {
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

			await sendOtpEmail(apiKey, toEmail, userName, otp, "sign-in");

			await new Promise((resolve) => setTimeout(resolve, 10));

			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
			expect(callBody.message.subject).toBe(
				"Tu código de inicio de sesión - Janovix",
			);
		});

		it("uses default subject for unknown OTP type", async () => {
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

			await sendOtpEmail(apiKey, toEmail, userName, otp, "unknown-type");

			await new Promise((resolve) => setTimeout(resolve, 10));

			const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
			expect(callBody.message.subject).toBe(
				"Tu código de verificación - Janovix",
			);
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

			const customTemplate = "custom-otp-template";
			await sendOtpEmail(
				apiKey,
				toEmail,
				userName,
				otp,
				"email-verification",
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
			await sendOtpEmail(apiKey, toEmail, userName, otp, "email-verification");

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[Mandrill] Failed to send OTP email",
				expect.objectContaining({
					toEmail,
					type: "email-verification",
					error: "Network error",
				}),
			);

			consoleErrorSpy.mockRestore();
		});

		it("handles non-Error exceptions gracefully", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error");
			mockFetch.mockRejectedValueOnce("String error");

			await sendOtpEmail(apiKey, toEmail, userName, otp, "sign-in");

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[Mandrill] Failed to send OTP email",
				expect.objectContaining({
					toEmail,
					type: "sign-in",
					error: "String error",
				}),
			);

			consoleErrorSpy.mockRestore();
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
			expect(callBody.message.from_email).toBe("noreply@janovix.com");
			expect(callBody.message.from_name).toBe("Janovix");
			expect(callBody.message.subject).toBe(
				`Invitación a unirse a ${invitation.organizationName}`,
			);
			expect(callBody.message.global_merge_vars).toEqual([
				{ name: "org_name", content: invitation.organizationName },
				{ name: "inviter_name", content: invitation.inviterName },
				{ name: "invite_url", content: invitation.inviteUrl },
				{ name: "role", content: invitation.role },
			]);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				"[Mandrill] Organization invitation email sent successfully",
				expect.objectContaining({
					toEmail: invitation.email,
					organizationName: invitation.organizationName,
				}),
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
				expect.objectContaining({
					toEmail: invitation.email,
					organizationName: invitation.organizationName,
					templateName: "janovix-org-invitation-template",
					error: "Network error",
				}),
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
				expect.objectContaining({
					toEmail: invitation.email,
					organizationName: invitation.organizationName,
					templateName: "janovix-org-invitation-template",
					error: "String error",
				}),
			);

			consoleErrorSpy.mockRestore();
		});
	});
});
