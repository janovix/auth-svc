/**
 * Notification Service Client for Auth Service
 *
 * Provides email sending capabilities for better-auth flows like
 * email verification, password reset, and magic links.
 */

/**
 * Auth notification types
 */
export type AuthNotificationType =
	| "email_verification"
	| "password_reset"
	| "magic_link"
	| "security";

/**
 * Auth notification payload
 */
export interface AuthNotificationPayload {
	type: AuthNotificationType;
	email: string;
	userId?: string;
	actionUrl: string;
	expiresIn?: string;
	appName?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Notification result
 */
export interface NotificationResult {
	success: boolean;
	error?: string;
	messageId?: string;
}

/**
 * Client for the notification service
 */
export class NotificationServiceClient {
	constructor(private fetcher: Fetcher | undefined) {}

	/**
	 * Checks if the notification service is available
	 */
	isAvailable(): boolean {
		return this.fetcher !== undefined;
	}

	/**
	 * Sends an auth notification (email verification, password reset, etc.)
	 */
	async sendAuthNotification(
		payload: AuthNotificationPayload,
	): Promise<NotificationResult> {
		if (!this.fetcher) {
			console.warn("Notification service not bound, email not sent");
			return { success: false, error: "Notification service not available" };
		}

		try {
			const response = await this.fetcher.fetch(
				new Request("https://internal/send-auth", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				}),
			);

			if (!response.ok) {
				const error = await response.text();
				console.error(
					`Notification service error: ${response.status} - ${error}`,
				);
				return { success: false, error: `Service error: ${response.status}` };
			}

			return (await response.json()) as NotificationResult;
		} catch (error) {
			const err = error as Error;
			console.error("Error calling notification service:", err);
			return { success: false, error: err.message };
		}
	}

	/**
	 * Sends an email verification notification
	 */
	async sendEmailVerification(
		email: string,
		verificationUrl: string,
		options?: { userId?: string; appName?: string },
	): Promise<NotificationResult> {
		return this.sendAuthNotification({
			type: "email_verification",
			email,
			actionUrl: verificationUrl,
			userId: options?.userId,
			appName: options?.appName,
			expiresIn: "24 hours",
		});
	}

	/**
	 * Sends a password reset notification
	 */
	async sendPasswordReset(
		email: string,
		resetUrl: string,
		options?: { userId?: string; appName?: string },
	): Promise<NotificationResult> {
		return this.sendAuthNotification({
			type: "password_reset",
			email,
			actionUrl: resetUrl,
			userId: options?.userId,
			appName: options?.appName,
			expiresIn: "1 hour",
		});
	}

	/**
	 * Sends a magic link notification
	 */
	async sendMagicLink(
		email: string,
		magicLinkUrl: string,
		options?: { userId?: string; appName?: string },
	): Promise<NotificationResult> {
		return this.sendAuthNotification({
			type: "magic_link",
			email,
			actionUrl: magicLinkUrl,
			userId: options?.userId,
			appName: options?.appName,
			expiresIn: "15 minutes",
		});
	}

	/**
	 * Sends a security notification
	 */
	async sendSecurityNotification(
		email: string,
		userId: string,
		message: string,
		options?: { appName?: string; metadata?: Record<string, unknown> },
	): Promise<NotificationResult> {
		return this.sendAuthNotification({
			type: "security",
			email,
			userId,
			actionUrl: "#",
			appName: options?.appName,
			metadata: {
				message,
				...options?.metadata,
			},
		});
	}
}

/**
 * Creates a better-auth compatible email sender using the notification service
 */
export function createEmailSender(
	notificationService: NotificationServiceClient,
	appName: string = "Janovix",
) {
	return {
		/**
		 * Sends an email (better-auth compatible interface)
		 */
		async sendVerificationEmail(
			email: string,
			verificationUrl: string,
			_token: string, // Token is included in the URL already
		): Promise<void> {
			const result = await notificationService.sendEmailVerification(
				email,
				verificationUrl,
				{ appName },
			);

			if (!result.success) {
				console.error(
					`Failed to send verification email to ${email}: ${result.error}`,
				);
				// Don't throw - auth flow should continue even if email fails
			}
		},

		/**
		 * Sends a password reset email (better-auth compatible interface)
		 */
		async sendResetPasswordEmail(
			email: string,
			resetUrl: string,
			_token: string,
		): Promise<void> {
			const result = await notificationService.sendPasswordReset(
				email,
				resetUrl,
				{
					appName,
				},
			);

			if (!result.success) {
				console.error(
					`Failed to send password reset email to ${email}: ${result.error}`,
				);
			}
		},
	};
}
