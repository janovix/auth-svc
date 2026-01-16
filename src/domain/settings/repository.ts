/**
 * Settings repository for database operations
 */
import type {
	OrganizationSettings,
	OrganizationSettingsRow,
	UserSettings,
	UserSettingsRow,
	UpdateOrganizationSettingsInput,
	UpdateUserSettingsInput,
	PaymentMethod,
	Theme,
	LanguageCode,
	DateFormat,
	ClockFormat,
} from "./types";

/**
 * Maps organization settings database row to domain model
 */
function mapOrganizationSettingsRow(
	row: OrganizationSettingsRow,
): OrganizationSettings {
	return {
		id: row.id,
		organizationId: row.organization_id,
		theme: row.theme as Theme,
		timezone: row.timezone,
		language: row.language as LanguageCode,
		dateFormat: row.date_format as DateFormat,
		clockFormat: (row.clock_format || "12h") as ClockFormat,
		avatarUrl: row.avatar_url,
		metadata: row.metadata ? JSON.parse(row.metadata) : null,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

/**
 * Maps user settings database row to domain model
 */
function mapUserSettingsRow(row: UserSettingsRow): UserSettings {
	return {
		id: row.id,
		userId: row.user_id,
		theme: row.theme as Theme | null,
		timezone: row.timezone,
		language: row.language as LanguageCode | null,
		dateFormat: row.date_format as DateFormat | null,
		clockFormat: row.clock_format as ClockFormat | null,
		avatarUrl: row.avatar_url,
		paymentMethods: row.payment_methods
			? (JSON.parse(row.payment_methods) as PaymentMethod[])
			: [],
		metadata: row.metadata ? JSON.parse(row.metadata) : null,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

export class SettingsRepository {
	constructor(private db: D1Database) {}

	/**
	 * Get organization settings by organization ID
	 */
	async getOrganizationSettings(
		organizationId: string,
	): Promise<OrganizationSettings | null> {
		const result = await this.db
			.prepare(
				`SELECT * FROM organization_settings WHERE organization_id = ? LIMIT 1`,
			)
			.bind(organizationId)
			.first<OrganizationSettingsRow>();

		return result ? mapOrganizationSettingsRow(result) : null;
	}

	/**
	 * Create organization settings
	 */
	async createOrganizationSettings(
		id: string,
		organizationId: string,
		input: UpdateOrganizationSettingsInput = {},
	): Promise<OrganizationSettings> {
		const now = new Date().toISOString();

		await this.db
			.prepare(
				`INSERT INTO organization_settings 
				(id, organization_id, theme, timezone, language, date_format, clock_format, avatar_url, metadata, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				organizationId,
				input.theme ?? "system",
				input.timezone ?? "UTC",
				input.language ?? "en",
				input.dateFormat ?? "MM/DD/YYYY",
				input.clockFormat ?? "12h",
				input.avatarUrl ?? null,
				input.metadata ? JSON.stringify(input.metadata) : null,
				now,
				now,
			)
			.run();

		const result = await this.getOrganizationSettings(organizationId);
		if (!result) {
			throw new Error("Failed to create organization settings");
		}
		return result;
	}

	/**
	 * Update organization settings
	 */
	async updateOrganizationSettings(
		organizationId: string,
		input: UpdateOrganizationSettingsInput,
	): Promise<OrganizationSettings | null> {
		const existing = await this.getOrganizationSettings(organizationId);
		if (!existing) {
			return null;
		}

		const updates: string[] = [];
		const values: unknown[] = [];

		if (input.theme !== undefined) {
			updates.push("theme = ?");
			values.push(input.theme);
		}
		if (input.timezone !== undefined) {
			updates.push("timezone = ?");
			values.push(input.timezone);
		}
		if (input.language !== undefined) {
			updates.push("language = ?");
			values.push(input.language);
		}
		if (input.dateFormat !== undefined) {
			updates.push("date_format = ?");
			values.push(input.dateFormat);
		}
		if (input.clockFormat !== undefined) {
			updates.push("clock_format = ?");
			values.push(input.clockFormat);
		}
		if (input.avatarUrl !== undefined) {
			updates.push("avatar_url = ?");
			values.push(input.avatarUrl);
		}
		if (input.metadata !== undefined) {
			updates.push("metadata = ?");
			values.push(JSON.stringify(input.metadata));
		}

		if (updates.length === 0) {
			return existing;
		}

		updates.push("updated_at = ?");
		values.push(new Date().toISOString());
		values.push(organizationId);

		await this.db
			.prepare(
				`UPDATE organization_settings SET ${updates.join(", ")} WHERE organization_id = ?`,
			)
			.bind(...values)
			.run();

		return this.getOrganizationSettings(organizationId);
	}

	/**
	 * Get user settings by user ID
	 */
	async getUserSettings(userId: string): Promise<UserSettings | null> {
		const result = await this.db
			.prepare(`SELECT * FROM user_settings WHERE user_id = ? LIMIT 1`)
			.bind(userId)
			.first<UserSettingsRow>();

		return result ? mapUserSettingsRow(result) : null;
	}

	/**
	 * Create user settings
	 */
	async createUserSettings(
		id: string,
		userId: string,
		input: UpdateUserSettingsInput = {},
	): Promise<UserSettings> {
		const now = new Date().toISOString();

		await this.db
			.prepare(
				`INSERT INTO user_settings 
				(id, user_id, theme, timezone, language, date_format, clock_format, avatar_url, payment_methods, metadata, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				userId,
				input.theme ?? null,
				input.timezone ?? null,
				input.language ?? null,
				input.dateFormat ?? null,
				input.clockFormat ?? null,
				input.avatarUrl ?? null,
				input.paymentMethods ? JSON.stringify(input.paymentMethods) : null,
				input.metadata ? JSON.stringify(input.metadata) : null,
				now,
				now,
			)
			.run();

		const result = await this.getUserSettings(userId);
		if (!result) {
			throw new Error("Failed to create user settings");
		}
		return result;
	}

	/**
	 * Update user settings
	 */
	async updateUserSettings(
		userId: string,
		input: UpdateUserSettingsInput,
	): Promise<UserSettings | null> {
		const existing = await this.getUserSettings(userId);
		if (!existing) {
			return null;
		}

		const updates: string[] = [];
		const values: unknown[] = [];

		if (input.theme !== undefined) {
			updates.push("theme = ?");
			values.push(input.theme);
		}
		if (input.timezone !== undefined) {
			updates.push("timezone = ?");
			values.push(input.timezone);
		}
		if (input.language !== undefined) {
			updates.push("language = ?");
			values.push(input.language);
		}
		if (input.dateFormat !== undefined) {
			updates.push("date_format = ?");
			values.push(input.dateFormat);
		}
		if (input.clockFormat !== undefined) {
			updates.push("clock_format = ?");
			values.push(input.clockFormat);
		}
		if (input.avatarUrl !== undefined) {
			updates.push("avatar_url = ?");
			values.push(input.avatarUrl);
		}
		if (input.paymentMethods !== undefined) {
			updates.push("payment_methods = ?");
			values.push(JSON.stringify(input.paymentMethods));
		}
		if (input.metadata !== undefined) {
			updates.push("metadata = ?");
			values.push(JSON.stringify(input.metadata));
		}

		if (updates.length === 0) {
			return existing;
		}

		updates.push("updated_at = ?");
		values.push(new Date().toISOString());
		values.push(userId);

		await this.db
			.prepare(
				`UPDATE user_settings SET ${updates.join(", ")} WHERE user_id = ?`,
			)
			.bind(...values)
			.run();

		return this.getUserSettings(userId);
	}

	/**
	 * Upsert user settings (create if not exists, update if exists)
	 */
	async upsertUserSettings(
		id: string,
		userId: string,
		input: UpdateUserSettingsInput,
	): Promise<UserSettings> {
		const existing = await this.getUserSettings(userId);
		if (existing) {
			const updated = await this.updateUserSettings(userId, input);
			return updated!;
		}
		return this.createUserSettings(id, userId, input);
	}

	/**
	 * Upsert organization settings (create if not exists, update if exists)
	 */
	async upsertOrganizationSettings(
		id: string,
		organizationId: string,
		input: UpdateOrganizationSettingsInput,
	): Promise<OrganizationSettings> {
		const existing = await this.getOrganizationSettings(organizationId);
		if (existing) {
			const updated = await this.updateOrganizationSettings(
				organizationId,
				input,
			);
			return updated!;
		}
		return this.createOrganizationSettings(id, organizationId, input);
	}

	/**
	 * Delete user settings
	 */
	async deleteUserSettings(userId: string): Promise<boolean> {
		const result = await this.db
			.prepare(`DELETE FROM user_settings WHERE user_id = ?`)
			.bind(userId)
			.run();
		return result.meta.changes > 0;
	}

	/**
	 * Delete organization settings
	 */
	async deleteOrganizationSettings(organizationId: string): Promise<boolean> {
		const result = await this.db
			.prepare(`DELETE FROM organization_settings WHERE organization_id = ?`)
			.bind(organizationId)
			.run();
		return result.meta.changes > 0;
	}
}
