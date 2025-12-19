/**
 * Mandrill API integration for sending transactional emails.
 * Documentation: https://mailchimp.com/developer/transactional/api/
 */

const MANDRILL_API_BASE = "https://mandrillapp.com/api/1.0";

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
	const url = `${MANDRILL_API_BASE}/messages/send-template`;

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
		},
	};

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Mandrill API error (${response.status}): ${errorText}`);
	}

	const result = (await response.json()) as MandrillSendResponse[];

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
 * Sends a password reset email using Mandrill template.
 *
 * @param apiKey - Mandrill API key
 * @param toEmail - Recipient email address
 * @param userName - User's name for personalization
 * @param resetUrl - Password reset URL with token
 * @param templateName - Mandrill template name (default: janovix-auth-password-recovery-template)
 * @returns Promise that resolves when email is sent (void to avoid timing attacks)
 */
export async function sendPasswordResetEmail(
	apiKey: string,
	toEmail: string,
	userName: string,
	resetUrl: string,
	templateName = "janovix-auth-password-recovery-template",
): Promise<void> {
	// Don't await - fire and forget to prevent timing attacks
	// On serverless platforms, use waitUntil if available
	void sendMandrillTemplate(apiKey, {
		to: [{ email: toEmail, type: "to" }],
		from_email: "noreply@janovix.ai",
		from_name: "Janovix",
		subject: "Restablecer tu contraseña - Janovix",
		template_name: templateName,
		global_merge_vars: [
			{ name: "env", content: userName },
			{ name: "recover_url", content: resetUrl },
		],
	}).catch((error) => {
		// Log error but don't throw - we don't want to expose email sending failures
		console.error("Failed to send password reset email:", error);
	});
}
