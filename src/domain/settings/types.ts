/**
 * Settings domain types
 */

/**
 * Theme options for user/organization settings
 */
export type Theme = "light" | "dark" | "system";

/**
 * Supported date format options
 */
export type DateFormat =
	| "MM/DD/YYYY"
	| "DD/MM/YYYY"
	| "YYYY-MM-DD"
	| "DD.MM.YYYY";

/**
 * Supported language codes (ISO 639-1)
 */
export type LanguageCode = "en" | "es";

/**
 * Clock format options (12-hour or 24-hour)
 */
export type ClockFormat = "12h" | "24h";

/**
 * Payment method reference stored in user settings
 */
export interface PaymentMethod {
	id: string;
	type: "card" | "bank_account" | "paypal";
	label: string;
	last4?: string;
	isDefault?: boolean;
}

/**
 * Organization settings database row
 */
export interface OrganizationSettingsRow {
	id: string;
	organization_id: string;
	theme: string;
	timezone: string;
	language: string;
	date_format: string;
	clock_format: string;
	avatar_url: string | null;
	metadata: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * User settings database row
 */
export interface UserSettingsRow {
	id: string;
	user_id: string;
	theme: string | null;
	timezone: string | null;
	language: string | null;
	date_format: string | null;
	clock_format: string | null;
	avatar_url: string | null;
	payment_methods: string | null;
	metadata: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * Organization settings domain model
 */
export interface OrganizationSettings {
	id: string;
	organizationId: string;
	theme: Theme;
	timezone: string;
	language: LanguageCode;
	dateFormat: DateFormat;
	clockFormat: ClockFormat;
	avatarUrl: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * User settings domain model
 */
export interface UserSettings {
	id: string;
	userId: string;
	theme: Theme | null;
	timezone: string | null;
	language: LanguageCode | null;
	dateFormat: DateFormat | null;
	clockFormat: ClockFormat | null;
	avatarUrl: string | null;
	paymentMethods: PaymentMethod[];
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Resolved settings (merged from all sources)
 * All fields are guaranteed to have values
 */
export interface ResolvedSettings {
	theme: Theme;
	timezone: string;
	language: LanguageCode;
	dateFormat: DateFormat;
	clockFormat: ClockFormat;
	avatarUrl: string | null;
	paymentMethods: PaymentMethod[];
	/** Source of each setting for debugging */
	sources: {
		theme: "user" | "organization" | "browser" | "default";
		timezone: "user" | "organization" | "browser" | "default";
		language: "user" | "organization" | "browser" | "default";
		dateFormat: "user" | "organization" | "default";
		clockFormat: "user" | "organization" | "default";
	};
}

/**
 * Browser hints extracted from headers
 */
export interface BrowserHints {
	language?: string;
	timezone?: string;
	theme?: Theme;
}

/**
 * Input for updating organization settings
 */
export interface UpdateOrganizationSettingsInput {
	theme?: Theme;
	timezone?: string;
	language?: LanguageCode;
	dateFormat?: DateFormat;
	clockFormat?: ClockFormat;
	avatarUrl?: string | null;
	metadata?: Record<string, unknown>;
}

/**
 * Input for updating user settings
 */
export interface UpdateUserSettingsInput {
	theme?: Theme | null;
	timezone?: string | null;
	language?: LanguageCode | null;
	dateFormat?: DateFormat | null;
	clockFormat?: ClockFormat | null;
	avatarUrl?: string | null;
	paymentMethods?: PaymentMethod[];
	metadata?: Record<string, unknown>;
}
