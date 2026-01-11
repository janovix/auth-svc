import { describe, expect, it } from "vitest";
import {
	themeSchema,
	dateFormatSchema,
	languageCodeSchema,
	timezoneSchema,
	paymentMethodSchema,
	updateOrganizationSettingsSchema,
	updateUserSettingsSchema,
	browserHintsSchema,
	resolvedSettingsQuerySchema,
} from "./schemas";

describe("Settings Domain Schemas", () => {
	describe("themeSchema", () => {
		it("validates valid themes", () => {
			expect(() => themeSchema.parse("light")).not.toThrow();
			expect(() => themeSchema.parse("dark")).not.toThrow();
			expect(() => themeSchema.parse("system")).not.toThrow();
		});

		it("rejects invalid themes", () => {
			expect(() => themeSchema.parse("invalid")).toThrow();
			expect(() => themeSchema.parse("LIGHT")).toThrow(); // uppercase
			expect(() => themeSchema.parse("")).toThrow();
		});
	});

	describe("dateFormatSchema", () => {
		it("validates valid date formats", () => {
			expect(() => dateFormatSchema.parse("MM/DD/YYYY")).not.toThrow();
			expect(() => dateFormatSchema.parse("DD/MM/YYYY")).not.toThrow();
			expect(() => dateFormatSchema.parse("YYYY-MM-DD")).not.toThrow();
			expect(() => dateFormatSchema.parse("DD.MM.YYYY")).not.toThrow();
		});

		it("rejects invalid date formats", () => {
			expect(() => dateFormatSchema.parse("MM-DD-YYYY")).toThrow();
			expect(() => dateFormatSchema.parse("invalid")).toThrow();
		});
	});

	describe("languageCodeSchema", () => {
		it("validates valid language codes", () => {
			expect(() => languageCodeSchema.parse("en")).not.toThrow();
			expect(() => languageCodeSchema.parse("es")).not.toThrow();
		});

		it("rejects invalid language codes", () => {
			expect(() => languageCodeSchema.parse("fr")).toThrow();
			expect(() => languageCodeSchema.parse("EN")).toThrow(); // uppercase
			expect(() => languageCodeSchema.parse("")).toThrow();
		});
	});

	describe("timezoneSchema", () => {
		it("validates valid IANA timezones", () => {
			expect(() => timezoneSchema.parse("America/New_York")).not.toThrow();
			expect(() => timezoneSchema.parse("Europe/London")).not.toThrow();
			expect(() => timezoneSchema.parse("Asia/Tokyo")).not.toThrow();
			expect(() => timezoneSchema.parse("UTC")).not.toThrow();
			expect(() => timezoneSchema.parse("GMT")).not.toThrow();
		});

		it("rejects invalid timezone formats", () => {
			expect(() => timezoneSchema.parse("invalid")).toThrow();
			expect(() => timezoneSchema.parse("America")).toThrow(); // missing slash
			expect(() => timezoneSchema.parse("")).toThrow();
		});

		it("rejects timezones with invalid characters", () => {
			expect(() => timezoneSchema.parse("America/New-York")).toThrow(); // hyphen instead of underscore
		});
	});

	describe("paymentMethodSchema", () => {
		it("validates valid payment method", () => {
			const paymentMethod = {
				id: "123e4567-e89b-12d3-a456-426614174000",
				type: "card",
				label: "Visa ending in 1234",
				last4: "1234",
				isDefault: true,
			};

			expect(() => paymentMethodSchema.parse(paymentMethod)).not.toThrow();
		});

		it("validates payment method without optional fields", () => {
			const paymentMethod = {
				id: "123e4567-e89b-12d3-a456-426614174000",
				type: "bank_account",
				label: "Checking Account",
			};

			expect(() => paymentMethodSchema.parse(paymentMethod)).not.toThrow();
		});

		it("validates all payment types", () => {
			expect(() =>
				paymentMethodSchema.parse({
					id: "123e4567-e89b-12d3-a456-426614174000",
					type: "card",
					label: "Card",
				}),
			).not.toThrow();
			expect(() =>
				paymentMethodSchema.parse({
					id: "123e4567-e89b-12d3-a456-426614174001",
					type: "bank_account",
					label: "Bank",
				}),
			).not.toThrow();
			expect(() =>
				paymentMethodSchema.parse({
					id: "123e4567-e89b-12d3-a456-426614174002",
					type: "paypal",
					label: "PayPal",
				}),
			).not.toThrow();
		});

		it("rejects invalid UUID", () => {
			const paymentMethod = {
				id: "invalid-uuid",
				type: "card",
				label: "Card",
			};

			expect(() => paymentMethodSchema.parse(paymentMethod)).toThrow();
		});

		it("rejects invalid payment type", () => {
			const paymentMethod = {
				id: "123e4567-e89b-12d3-a456-426614174000",
				type: "crypto",
				label: "Crypto",
			};

			expect(() => paymentMethodSchema.parse(paymentMethod)).toThrow();
		});

		it("validates last4 length", () => {
			const paymentMethod = {
				id: "123e4567-e89b-12d3-a456-426614174000",
				type: "card",
				label: "Card",
				last4: "12345", // too long
			};

			expect(() => paymentMethodSchema.parse(paymentMethod)).toThrow();
		});

		it("validates label length", () => {
			const paymentMethod = {
				id: "123e4567-e89b-12d3-a456-426614174000",
				type: "card",
				label: "a".repeat(101), // too long
			};

			expect(() => paymentMethodSchema.parse(paymentMethod)).toThrow();
		});
	});

	describe("updateOrganizationSettingsSchema", () => {
		it("validates empty update", () => {
			expect(() => updateOrganizationSettingsSchema.parse({})).not.toThrow();
		});

		it("validates partial update", () => {
			const update = {
				theme: "dark",
				timezone: "America/New_York",
			};

			expect(() =>
				updateOrganizationSettingsSchema.parse(update),
			).not.toThrow();
		});

		it("validates full update", () => {
			const update = {
				theme: "light",
				timezone: "Europe/London",
				language: "en",
				dateFormat: "MM/DD/YYYY",
				avatarUrl: "https://example.com/avatar.png",
				metadata: { key: "value" },
			};

			expect(() =>
				updateOrganizationSettingsSchema.parse(update),
			).not.toThrow();
		});

		it("validates null avatarUrl", () => {
			const update = {
				avatarUrl: null,
			};

			expect(() =>
				updateOrganizationSettingsSchema.parse(update),
			).not.toThrow();
		});

		it("rejects invalid URL for avatarUrl", () => {
			const update = {
				avatarUrl: "not-a-url",
			};

			expect(() => updateOrganizationSettingsSchema.parse(update)).toThrow();
		});

		it("rejects invalid theme", () => {
			const update = {
				theme: "invalid",
			};

			expect(() => updateOrganizationSettingsSchema.parse(update)).toThrow();
		});
	});

	describe("updateUserSettingsSchema", () => {
		it("validates empty update", () => {
			expect(() => updateUserSettingsSchema.parse({})).not.toThrow();
		});

		it("validates nullable fields", () => {
			const update = {
				theme: null,
				timezone: null,
				language: null,
				dateFormat: null,
				avatarUrl: null,
			};

			expect(() => updateUserSettingsSchema.parse(update)).not.toThrow();
		});

		it("validates with payment methods", () => {
			const update = {
				paymentMethods: [
					{
						id: "123e4567-e89b-12d3-a456-426614174000",
						type: "card",
						label: "Visa",
						last4: "1234",
					},
				],
			};

			expect(() => updateUserSettingsSchema.parse(update)).not.toThrow();
		});

		it("validates empty payment methods array", () => {
			const update = {
				paymentMethods: [],
			};

			expect(() => updateUserSettingsSchema.parse(update)).not.toThrow();
		});
	});

	describe("browserHintsSchema", () => {
		it("validates empty hints", () => {
			expect(() => browserHintsSchema.parse({})).not.toThrow();
		});

		it("validates partial hints", () => {
			const hints = {
				language: "en",
			};

			expect(() => browserHintsSchema.parse(hints)).not.toThrow();
		});

		it("validates full hints", () => {
			const hints = {
				language: "es",
				timezone: "America/New_York",
				theme: "dark",
			};

			expect(() => browserHintsSchema.parse(hints)).not.toThrow();
		});

		it("rejects invalid theme", () => {
			const hints = {
				theme: "invalid",
			};

			expect(() => browserHintsSchema.parse(hints)).toThrow();
		});
	});

	describe("resolvedSettingsQuerySchema", () => {
		it("validates minimal query with userId", () => {
			const query = {
				userId: "123e4567-e89b-12d3-a456-426614174000",
			};

			expect(() => resolvedSettingsQuerySchema.parse(query)).not.toThrow();
		});

		it("validates query with all fields", () => {
			const query = {
				userId: "123e4567-e89b-12d3-a456-426614174000",
				orgId: "123e4567-e89b-12d3-a456-426614174001",
				headers: "eyJhY2NlcHQtbGFuZ3VhZ2UiOiJlbiJ9", // base64 encoded JSON
			};

			expect(() => resolvedSettingsQuerySchema.parse(query)).not.toThrow();
		});

		it("rejects missing userId", () => {
			expect(() => resolvedSettingsQuerySchema.parse({})).toThrow();
		});

		it("rejects invalid UUID for userId", () => {
			const query = {
				userId: "invalid-uuid",
			};

			expect(() => resolvedSettingsQuerySchema.parse(query)).toThrow();
		});

		it("rejects invalid UUID for orgId", () => {
			const query = {
				userId: "123e4567-e89b-12d3-a456-426614174000",
				orgId: "invalid-uuid",
			};

			expect(() => resolvedSettingsQuerySchema.parse(query)).toThrow();
		});
	});
});
