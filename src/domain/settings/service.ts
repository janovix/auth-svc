/**
 * Settings service for business logic
 */
import { SettingsRepository } from "./repository";
import type {
	OrganizationSettings,
	UserSettings,
	ResolvedSettings,
	BrowserHints,
	UpdateOrganizationSettingsInput,
	UpdateUserSettingsInput,
	Theme,
	LanguageCode,
	DateFormat,
	ClockFormat,
} from "./types";

/**
 * Default settings values
 */
const DEFAULTS = {
	theme: "system" as Theme,
	timezone: "UTC",
	language: "en" as LanguageCode,
	dateFormat: "MM/DD/YYYY" as DateFormat,
	clockFormat: "12h" as ClockFormat,
} as const;

/**
 * Supported languages with their Accept-Language patterns
 */
const LANGUAGE_MAP: Record<string, LanguageCode> = {
	en: "en",
	"en-us": "en",
	"en-gb": "en",
	es: "es",
	"es-mx": "es",
	"es-es": "es",
};

/**
 * Parse Accept-Language header to get preferred language
 */
function parseAcceptLanguage(header: string | undefined): LanguageCode | null {
	if (!header) return null;

	// Parse Accept-Language: en-US,en;q=0.9,es;q=0.8
	const languages = header
		.toLowerCase()
		.split(",")
		.map((lang) => {
			const [code, quality] = lang.trim().split(";q=");
			return {
				code: code.trim(),
				quality: quality ? parseFloat(quality) : 1.0,
			};
		})
		.sort((a, b) => b.quality - a.quality);

	for (const { code } of languages) {
		const normalized = LANGUAGE_MAP[code];
		if (normalized) {
			return normalized;
		}
		// Try base language (e.g., "en" from "en-CA")
		const base = code.split("-")[0];
		const baseNormalized = LANGUAGE_MAP[base];
		if (baseNormalized) {
			return baseNormalized;
		}
	}

	return null;
}

/**
 * Validate IANA timezone string
 */
function isValidTimezone(tz: string): boolean {
	try {
		// Use Intl to validate timezone
		Intl.DateTimeFormat(undefined, { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

export class SettingsService {
	private repository: SettingsRepository;

	constructor(db: D1Database) {
		this.repository = new SettingsRepository(db);
	}

	/**
	 * Get organization settings
	 */
	async getOrganizationSettings(
		organizationId: string,
	): Promise<OrganizationSettings | null> {
		return this.repository.getOrganizationSettings(organizationId);
	}

	/**
	 * Get or create organization settings (returns defaults if not exists)
	 */
	async getOrCreateOrganizationSettings(
		organizationId: string,
	): Promise<OrganizationSettings> {
		const existing =
			await this.repository.getOrganizationSettings(organizationId);
		if (existing) {
			return existing;
		}

		const id = crypto.randomUUID();
		return this.repository.createOrganizationSettings(id, organizationId, {});
	}

	/**
	 * Update organization settings
	 */
	async updateOrganizationSettings(
		organizationId: string,
		input: UpdateOrganizationSettingsInput,
	): Promise<OrganizationSettings> {
		const id = crypto.randomUUID();
		return this.repository.upsertOrganizationSettings(
			id,
			organizationId,
			input,
		);
	}

	/**
	 * Get user settings
	 */
	async getUserSettings(userId: string): Promise<UserSettings | null> {
		return this.repository.getUserSettings(userId);
	}

	/**
	 * Get or create user settings (returns empty settings if not exists)
	 */
	async getOrCreateUserSettings(userId: string): Promise<UserSettings> {
		const existing = await this.repository.getUserSettings(userId);
		if (existing) {
			return existing;
		}

		const id = crypto.randomUUID();
		return this.repository.createUserSettings(id, userId, {});
	}

	/**
	 * Update user settings
	 */
	async updateUserSettings(
		userId: string,
		input: UpdateUserSettingsInput,
	): Promise<UserSettings> {
		const id = crypto.randomUUID();
		return this.repository.upsertUserSettings(id, userId, input);
	}

	/**
	 * Resolve settings with smart defaults
	 *
	 * Priority (highest to lowest):
	 * 1. User explicit setting (if set)
	 * 2. Organization default (if user belongs to org)
	 * 3. Browser headers (Accept-Language, timezone from JS)
	 * 4. System defaults
	 */
	async resolveSettings(
		userId: string,
		organizationId?: string,
		browserHints?: BrowserHints,
	): Promise<ResolvedSettings> {
		// Fetch user and org settings in parallel
		const [userSettings, orgSettings] = await Promise.all([
			this.repository.getUserSettings(userId),
			organizationId
				? this.repository.getOrganizationSettings(organizationId)
				: Promise.resolve(null),
		]);

		// Resolve theme
		let theme: Theme = DEFAULTS.theme;
		let themeSource: ResolvedSettings["sources"]["theme"] = "default";

		if (userSettings?.theme) {
			theme = userSettings.theme;
			themeSource = "user";
		} else if (orgSettings?.theme) {
			theme = orgSettings.theme;
			themeSource = "organization";
		} else if (browserHints?.theme) {
			theme = browserHints.theme;
			themeSource = "browser";
		}

		// Resolve timezone
		let timezone: string = DEFAULTS.timezone;
		let timezoneSource: ResolvedSettings["sources"]["timezone"] = "default";

		if (userSettings?.timezone) {
			timezone = userSettings.timezone;
			timezoneSource = "user";
		} else if (orgSettings?.timezone) {
			timezone = orgSettings.timezone;
			timezoneSource = "organization";
		} else if (
			browserHints?.timezone &&
			isValidTimezone(browserHints.timezone)
		) {
			timezone = browserHints.timezone;
			timezoneSource = "browser";
		}

		// Resolve language
		let language: LanguageCode = DEFAULTS.language;
		let languageSource: ResolvedSettings["sources"]["language"] = "default";

		if (userSettings?.language) {
			language = userSettings.language;
			languageSource = "user";
		} else if (orgSettings?.language) {
			language = orgSettings.language;
			languageSource = "organization";
		} else if (browserHints?.language) {
			const parsed = parseAcceptLanguage(browserHints.language);
			if (parsed) {
				language = parsed;
				languageSource = "browser";
			}
		}

		// Resolve date format (no browser hint for this)
		let dateFormat: DateFormat = DEFAULTS.dateFormat;
		let dateFormatSource: ResolvedSettings["sources"]["dateFormat"] = "default";

		if (userSettings?.dateFormat) {
			dateFormat = userSettings.dateFormat;
			dateFormatSource = "user";
		} else if (orgSettings?.dateFormat) {
			dateFormat = orgSettings.dateFormat;
			dateFormatSource = "organization";
		}

		// Resolve clock format (no browser hint for this)
		let clockFormat: ClockFormat = DEFAULTS.clockFormat;
		let clockFormatSource: ResolvedSettings["sources"]["clockFormat"] =
			"default";

		if (userSettings?.clockFormat) {
			clockFormat = userSettings.clockFormat;
			clockFormatSource = "user";
		} else if (orgSettings?.clockFormat) {
			clockFormat = orgSettings.clockFormat;
			clockFormatSource = "organization";
		}

		// Avatar URL - user takes precedence
		const avatarUrl = userSettings?.avatarUrl ?? orgSettings?.avatarUrl ?? null;

		// Payment methods from user only
		const paymentMethods = userSettings?.paymentMethods ?? [];

		return {
			theme,
			timezone,
			language,
			dateFormat,
			clockFormat,
			avatarUrl,
			paymentMethods,
			sources: {
				theme: themeSource,
				timezone: timezoneSource,
				language: languageSource,
				dateFormat: dateFormatSource,
				clockFormat: clockFormatSource,
			},
		};
	}

	/**
	 * Parse browser hints from base64-encoded headers JSON
	 */
	parseBrowserHints(encodedHeaders?: string): BrowserHints {
		if (!encodedHeaders) {
			return {};
		}

		try {
			const decoded = atob(encodedHeaders);
			const headers = JSON.parse(decoded) as Record<string, string>;

			return {
				language: headers["accept-language"] || headers["Accept-Language"],
				timezone: headers["x-timezone"] || headers["X-Timezone"],
				theme:
					headers["x-preferred-theme"] || headers["X-Preferred-Theme"]
						? (headers["x-preferred-theme"] as Theme)
						: undefined,
			};
		} catch {
			return {};
		}
	}

	/**
	 * Delete user settings
	 */
	async deleteUserSettings(userId: string): Promise<boolean> {
		return this.repository.deleteUserSettings(userId);
	}

	/**
	 * Delete organization settings
	 */
	async deleteOrganizationSettings(organizationId: string): Promise<boolean> {
		return this.repository.deleteOrganizationSettings(organizationId);
	}
}
