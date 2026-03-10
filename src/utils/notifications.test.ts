import { describe, it, expect, vi } from "vitest";
import {
	sendNotification,
	sendOrgNotification,
	sendUserNotification,
	type SendNotificationInput,
} from "./notifications";
import type { NotificationsRpc } from "../types/bindings";

const makeNotifyMock = () =>
	vi.fn<NotificationsRpc["notify"]>().mockResolvedValue({
		notificationId: "notif-abc",
		delivered: { realtime: true, email: "none" },
	});

const makeMockService = (notifyMock = makeNotifyMock()): NotificationsRpc => ({
	notify: notifyMock,
	sendEmail: vi.fn().mockResolvedValue({ success: true }),
});

const baseInput: SendNotificationInput = {
	tenantId: "org-1",
	target: { kind: "org" },
	type: "test.event",
	title: "Test Title",
	body: "Test body",
	sourceService: "auth-svc",
};

describe("sendNotification", () => {
	it("returns error result when service binding is undefined", async () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = await sendNotification(undefined, baseInput);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Notifications service not configured");
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it("calls notify with correct payload and returns success", async () => {
		const notifyMock = makeNotifyMock();
		const service = makeMockService(notifyMock);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = await sendNotification(service, baseInput);

		expect(result.success).toBe(true);
		expect(result.notificationId).toBe("notif-abc");
		expect(notifyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: "org-1",
				type: "test.event",
				title: "Test Title",
				body: "Test body",
				sourceService: "auth-svc",
				severity: "info",
				sendEmail: false,
			}),
		);
		consoleSpy.mockRestore();
	});

	it("uses provided severity and sendEmail overrides", async () => {
		const notifyMock = makeNotifyMock();
		const service = makeMockService(notifyMock);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await sendNotification(service, {
			...baseInput,
			severity: "error",
			sendEmail: true,
		});

		expect(notifyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				severity: "error",
				sendEmail: true,
			}),
		);
		consoleSpy.mockRestore();
	});

	it("forwards optional fields when provided", async () => {
		const notifyMock = makeNotifyMock();
		const service = makeMockService(notifyMock);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await sendNotification(service, {
			...baseInput,
			channelSlug: "billing",
			payload: { key: "value" },
			callbackUrl: "https://example.com/cb",
			sourceEvent: "billing.updated",
		});

		expect(notifyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				channelSlug: "billing",
				payload: { key: "value" },
				callbackUrl: "https://example.com/cb",
				sourceEvent: "billing.updated",
			}),
		);
		consoleSpy.mockRestore();
	});

	it("returns error result when notify throws", async () => {
		const notifyMock = vi
			.fn<NotificationsRpc["notify"]>()
			.mockRejectedValue(new Error("RPC failure"));
		const service = makeMockService(notifyMock);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await sendNotification(service, baseInput);

		expect(result.success).toBe(false);
		expect(result.error).toBe("RPC failure");
		consoleSpy.mockRestore();
	});

	it("returns generic error message for non-Error throws", async () => {
		const notifyMock = vi
			.fn<NotificationsRpc["notify"]>()
			.mockRejectedValue("string error");
		const service = makeMockService(notifyMock);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await sendNotification(service, baseInput);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Unknown error");
		consoleSpy.mockRestore();
	});

	it("handles user target", async () => {
		const notifyMock = makeNotifyMock();
		const service = makeMockService(notifyMock);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await sendNotification(service, {
			...baseInput,
			target: { kind: "user", userId: "user-1", email: "u@ex.com" },
		});

		expect(notifyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				target: { kind: "user", userId: "user-1", email: "u@ex.com" },
			}),
		);
		consoleSpy.mockRestore();
	});
});

describe("sendOrgNotification", () => {
	it("delegates to sendNotification with org target", async () => {
		const notifyMock = makeNotifyMock();
		const service = makeMockService(notifyMock);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = await sendOrgNotification(service, "org-99", {
			type: "org.event",
			title: "Org Title",
			body: "Org body",
			sourceService: "auth-svc",
		});

		expect(result.success).toBe(true);
		expect(notifyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: "org-99",
				target: { kind: "org" },
			}),
		);
		consoleSpy.mockRestore();
	});

	it("returns error when service is undefined", async () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await sendOrgNotification(undefined, "org-1", {
			type: "test",
			title: "T",
			body: "B",
			sourceService: "auth-svc",
		});

		expect(result.success).toBe(false);
		consoleSpy.mockRestore();
	});
});

describe("sendUserNotification", () => {
	it("delegates to sendNotification with user target", async () => {
		const notifyMock = makeNotifyMock();
		const service = makeMockService(notifyMock);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = await sendUserNotification(
			service,
			"org-1",
			"user-42",
			{
				type: "user.event",
				title: "User Title",
				body: "User body",
				sourceService: "auth-svc",
			},
			{ email: "u@ex.com", name: "Alice" },
		);

		expect(result.success).toBe(true);
		expect(notifyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: "org-1",
				target: {
					kind: "user",
					userId: "user-42",
					email: "u@ex.com",
					name: "Alice",
				},
			}),
		);
		consoleSpy.mockRestore();
	});

	it("handles missing userInfo", async () => {
		const notifyMock = makeNotifyMock();
		const service = makeMockService(notifyMock);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await sendUserNotification(service, "org-1", "user-42", {
			type: "user.event",
			title: "T",
			body: "B",
			sourceService: "auth-svc",
		});

		expect(notifyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				target: {
					kind: "user",
					userId: "user-42",
					email: undefined,
					name: undefined,
				},
			}),
		);
		consoleSpy.mockRestore();
	});

	it("returns error when service is undefined", async () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await sendUserNotification(undefined, "org-1", "user-42", {
			type: "test",
			title: "T",
			body: "B",
			sourceService: "auth-svc",
		});

		expect(result.success).toBe(false);
		consoleSpy.mockRestore();
	});
});
