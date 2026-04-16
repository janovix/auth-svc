import { normalizeLanguage, type LanguageCode } from "../lib/i18n";

/**
 * Resolved language for a user by email (sign-in / verification OTP).
 * Falls back to "en" when the user does not exist yet (e.g. sign-up).
 */
export async function getLanguageForUserEmail(
	db: D1Database,
	email: string,
): Promise<LanguageCode> {
	const row = await db
		.prepare(
			`SELECT COALESCE(us.language, 'en') AS lang
			 FROM users u
			 LEFT JOIN user_settings us ON us.user_id = u.id
			 WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(?))
			 LIMIT 1`,
		)
		.bind(email)
		.first<{ lang: string | null }>();

	return normalizeLanguage(row?.lang ?? undefined);
}

/**
 * Resolved language for a user by id (e.g. promotion email).
 */
export async function getLanguageForUserId(
	db: D1Database,
	userId: string,
): Promise<LanguageCode> {
	const row = await db
		.prepare(
			`SELECT COALESCE(us.language, 'en') AS lang
			 FROM user_settings us
			 WHERE us.user_id = ?
			 LIMIT 1`,
		)
		.bind(userId)
		.first<{ lang: string | null }>();

	return normalizeLanguage(row?.lang ?? undefined);
}

/**
 * Organization default language from organization_settings.
 */
export async function getOrganizationLanguageFromDb(
	db: D1Database,
	organizationId: string,
): Promise<LanguageCode> {
	const row = await db
		.prepare(
			`SELECT language FROM organization_settings WHERE organization_id = ? LIMIT 1`,
		)
		.bind(organizationId)
		.first<{ language: string | null }>();

	return normalizeLanguage(row?.language ?? undefined);
}
