/**
 * Mandrill API integration for sending transactional emails.
 * Documentation: https://mailchimp.com/developer/transactional/api/
 */

import { TEMPLATE_IMAGES } from "./constants";
export type OrganizationInvitationEmail = {
	email: string;
	inviteUrl: string;
	organizationName: string;
	inviterName: string;
	role?: string;
};

const MANDRILL_API_BASE = "https://mandrillapp.com/api/1.0";

/**
 * Default timeout for Mandrill API calls in milliseconds.
 * Email sending should complete within 10 seconds; otherwise, consider it failed.
 * This prevents requests from hanging indefinitely in Cloudflare Workers.
 */
const MANDRILL_TIMEOUT_MS = 10_000;

export interface MandrillImage {
	type: string;
	name: string;
	content: string;
}

export interface MandrillMessage {
	to: Array<{ email: string; name?: string; type?: "to" }>;
	from_email: string;
	from_name?: string;
	subject: string;
	template_name?: string;
	template_content?: Array<{ name: string; content: string }>;
	global_merge_vars?: Array<{ name: string; content: string }>;
	merge_vars?: Array<{
		rcpt: string;
		vars: Array<{ name: string; content: string }>;
	}>;
	images?: MandrillImage[];
}

export interface MandrillSendResponse {
	_id: string;
	email: string;
	status: "sent" | "queued" | "rejected" | "invalid";
	reject_reason?: string;
}

/**
 * Sends an email using Mandrill's messages/send-template API.
 *
 * @param apiKey - Mandrill API key
 * @param message - Email message configuration
 * @returns Promise resolving to an array of send results
 * @throws Error if the API request fails
 */
export async function sendMandrillTemplate(
	apiKey: string,
	message: MandrillMessage,
): Promise<MandrillSendResponse[]> {
	const url = `${MANDRILL_API_BASE}/messages/send-template.json`;

	const payload = {
		key: apiKey,
		template_name: message.template_name,
		template_content: message.template_content || [],
		message: {
			to: message.to,
			from_email: message.from_email,
			from_name: message.from_name,
			subject: message.subject,
			global_merge_vars: message.global_merge_vars || [],
			merge_vars: message.merge_vars || [],
			images: message.images || [],
		},
	};

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
		// Prevent hanging in Cloudflare Workers by adding a timeout
		signal: AbortSignal.timeout(MANDRILL_TIMEOUT_MS),
	});

	const responseStatus = response.status;
	const responseText = await response.text();

	if (!response.ok) {
		throw new Error(`Mandrill API error (${responseStatus}): ${responseText}`);
	}

	let result: MandrillSendResponse[];
	try {
		result = JSON.parse(responseText) as MandrillSendResponse[];
	} catch {
		throw new Error(
			`Mandrill API returned invalid JSON (${responseStatus}): ${responseText}`,
		);
	}

	// Check for rejected or invalid emails
	const rejected = result.filter(
		(r) => r.status === "rejected" || r.status === "invalid",
	);
	if (rejected.length > 0) {
		const reasons = rejected
			.map((r) => `${r.email}: ${r.reject_reason || r.status}`)
			.join(", ");
		throw new Error(`Mandrill send failed: ${reasons}`);
	}

	return result;
}

/**
 * Sends an email verification OTP email using Mandrill template.
 *
 * @param apiKey - Mandrill API key
 * @param toEmail - Recipient email address
 * @param userName - User's name for personalization
 * @param otp - The one-time password code
 * @param type - The type of OTP (email-verification, sign-in, etc.)
 * @param templateName - Mandrill template name (default: janovix-email-otp-template)
 * @returns Promise that resolves when email is sent (use with waitUntil on serverless)
 */
export async function sendOtpEmail(
	apiKey: string,
	toEmail: string,
	userName: string,
	otp: string,
	type: string,
	templateName = "janovix-email-otp-template",
): Promise<void> {
	// Determine subject based on OTP type
	const subjectMap: Record<string, string> = {
		"email-verification": "Tu código de verificación - Janovix",
		"sign-in": "Tu código de inicio de sesión - Janovix",
		"forget-password": "Tu código de recuperación - Janovix",
	};
	const subject = subjectMap[type] || "Tu código de verificación - Janovix";

	try {
		const result = await sendMandrillTemplate(apiKey, {
			to: [{ email: toEmail, type: "to" }],
			from_email: "noreply@janovix.com",
			from_name: "Janovix",
			subject,
			template_name: templateName,
			global_merge_vars: [
				{ name: "env", content: userName },
				{ name: "otp", content: otp },
				{ name: "type", content: type },
			],
			images: TEMPLATE_IMAGES,
		});
		console.log("[Mandrill] OTP email sent successfully", {
			toEmail,
			type,
			messageIds: result.map((r) => r._id),
			statuses: result.map((r) => r.status),
		});
	} catch (error) {
		// Determine if this was a timeout error
		const isTimeout =
			error instanceof Error &&
			(error.name === "TimeoutError" || error.name === "AbortError");

		// Log error but don't throw - we don't want to expose email sending failures
		console.error("[Mandrill] Failed to send OTP email", {
			toEmail,
			type,
			templateName,
			isTimeout,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		// Don't rethrow - allow the promise to resolve to prevent exposing failures
	}
}

/**
 * Sends an organization invitation email using Mandrill template.
 *
 * @param apiKey - Mandrill API key
 * @param invitation - Invitation email payload (org name, inviter, link)
 * @param templateName - Mandrill template name (default: janovix-org-invitation-template)
 */
export async function sendOrganizationInvitationEmail(
	apiKey: string,
	invitation: OrganizationInvitationEmail,
	templateName = "janovix-org-invitation-template",
): Promise<void> {
	try {
		const result = await sendMandrillTemplate(apiKey, {
			to: [{ email: invitation.email, type: "to" }],
			from_email: "noreply@janovix.com",
			from_name: "Janovix",
			subject: `Invitación a unirse a ${invitation.organizationName}`,
			template_name: templateName,
			global_merge_vars: [
				{ name: "org_name", content: invitation.organizationName },
				{ name: "inviter_name", content: invitation.inviterName },
				{ name: "invite_url", content: invitation.inviteUrl },
				{ name: "role", content: invitation.role ?? "member" },
			],
			images: TEMPLATE_IMAGES,
		});
		console.log("[Mandrill] Organization invitation email sent successfully", {
			toEmail: invitation.email,
			organizationName: invitation.organizationName,
			messageIds: result.map((r) => r._id),
			statuses: result.map((r) => r.status),
		});
	} catch (error) {
		// Determine if this was a timeout error
		const isTimeout =
			error instanceof Error &&
			(error.name === "TimeoutError" || error.name === "AbortError");

		// Log error but don't throw - we don't want to expose email sending failures
		// The error is logged for debugging, but the promise resolves to prevent
		// exposing email sending failures to users
		console.error("[Mandrill] Failed to send org invitation email", {
			toEmail: invitation.email,
			organizationName: invitation.organizationName,
			templateName,
			isTimeout,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		// Don't rethrow - allow the promise to resolve to prevent exposing failures
	}
}
