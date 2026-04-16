/**
 * Notifications utility — reusable functions for dispatching notifications
 * via the notifications-svc RPC entrypoint (Cloudflare Service Binding).
 */

import type { EmailI18nPayload, LanguageCode } from "../lib/i18n";
import type { NotificationsRpc } from "../types/bindings";

/**
 * Notification target — either organization-wide or a specific user.
 */
export type NotificationTarget =
	| { kind: "org" }
	| { kind: "user"; userId: string; email?: string; name?: string };

/**
 * Notification severity levels.
 */
export type NotificationSeverity = "info" | "warn" | "error";

/**
 * Input for sending a notification.
 */
export interface SendNotificationInput {
	tenantId: string;
	target: NotificationTarget;
	channelSlug?: string;
	type: string;
	title: string;
	body: string;
	payload?: Record<string, unknown>;
	severity?: NotificationSeverity;
	callbackUrl?: string;
	sendEmail?: boolean;
	emailI18n?: EmailI18nPayload;
	emailLocale?: LanguageCode;
	sourceService: string;
	sourceEvent?: string;
}

/**
 * Result of sending a notification.
 */
export interface SendNotificationResult {
	success: boolean;
	notificationId?: string;
	error?: string;
}

/**
 * Send a notification via the notifications-svc RPC entrypoint.
 *
 * @param notificationsService - The `NOTIFICATIONS_SERVICE` binding from env
 * @param input - Notification details
 * @returns Result with success status and notification ID or error
 *
 * @example
 * ```typescript
 * await sendNotification(c.env.NOTIFICATIONS_SERVICE, {
 *   tenantId: orgId,
 *   target: { kind: "org" },
 *   channelSlug: "system",
 *   type: "organization.updated",
 *   title: "Organization Settings Updated",
 *   body: "Your organization settings have been updated.",
 *   sourceService: "auth-svc",
 *   sourceEvent: "internal_organizations.patch",
 * });
 * ```
 */
export async function sendNotification(
	notificationsService: NotificationsRpc | undefined,
	input: SendNotificationInput,
): Promise<SendNotificationResult> {
	if (!notificationsService) {
		console.warn("[Notifications] NOTIFICATIONS_SERVICE binding not available");
		return {
			success: false,
			error: "Notifications service not configured",
		};
	}

	try {
		console.log(
			`[Notifications] Sending notification: ${input.type} to ${input.target.kind} in tenant ${input.tenantId}`,
		);

		const result = await notificationsService.notify({
			tenantId: input.tenantId,
			target: input.target,
			channelSlug: input.channelSlug,
			type: input.type,
			title: input.title,
			body: input.body,
			payload: input.payload,
			severity: input.severity ?? "info",
			callbackUrl: input.callbackUrl,
			sendEmail: input.sendEmail ?? false,
			emailI18n: input.emailI18n,
			emailLocale: input.emailLocale,
			sourceService: input.sourceService,
			sourceEvent: input.sourceEvent,
		});

		if (
			result == null ||
			typeof result.notificationId !== "string" ||
			result.notificationId === ""
		) {
			return {
				success: false,
				error: "Invalid RPC response",
			};
		}

		console.log(
			`[Notifications] Dispatch ok tenantId=${input.tenantId} channelSlug=${input.channelSlug ?? "(default)"} type=${input.type} notificationId=${result.notificationId}`,
		);

		return {
			success: true,
			notificationId: result.notificationId,
		};
	} catch (error) {
		console.error("[Notifications] Failed to send notification:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Send an organization-wide notification
 *
 * @param notificationsService - The NOTIFICATIONS_SERVICE binding from env
 * @param orgId - Organization ID (tenant ID)
 * @param notification - Notification details
 * @returns Result with success status and notification ID or error
 *
 * @example
 * ```typescript
 * await sendOrgNotification(c.env.NOTIFICATIONS_SERVICE, orgId, {
 *   channelSlug: "system",
 *   type: "organization.updated",
 *   title: "Settings Updated",
 *   body: "Your organization settings have been changed.",
 *   sourceService: "auth-svc",
 * });
 * ```
 */
export async function sendOrgNotification(
	notificationsService: NotificationsRpc | undefined,
	orgId: string,
	notification: Omit<SendNotificationInput, "tenantId" | "target">,
): Promise<SendNotificationResult> {
	return sendNotification(notificationsService, {
		...notification,
		tenantId: orgId,
		target: { kind: "org" },
	});
}

/**
 * Send a notification to a specific user
 *
 * @param notificationsService - The NOTIFICATIONS_SERVICE binding from env
 * @param orgId - Organization ID (tenant ID)
 * @param userId - User ID
 * @param notification - Notification details
 * @param userInfo - Optional user email and name for email delivery
 * @returns Result with success status and notification ID or error
 *
 * @example
 * ```typescript
 * await sendUserNotification(
 *   c.env.NOTIFICATIONS_SERVICE,
 *   orgId,
 *   userId,
 *   {
 *     channelSlug: "billing",
 *     type: "subscription.expired",
 *     title: "Subscription Expired",
 *     body: "Your subscription has expired. Please renew.",
 *     sourceService: "auth-svc",
 *     sendEmail: true,
 *   },
 *   { email: "user@example.com", name: "John Doe" }
 * );
 * ```
 */
export async function sendUserNotification(
	notificationsService: NotificationsRpc | undefined,
	orgId: string,
	userId: string,
	notification: Omit<SendNotificationInput, "tenantId" | "target">,
	userInfo?: { email?: string; name?: string },
): Promise<SendNotificationResult> {
	return sendNotification(notificationsService, {
		...notification,
		tenantId: orgId,
		target: {
			kind: "user",
			userId,
			email: userInfo?.email,
			name: userInfo?.name,
		},
	});
}
