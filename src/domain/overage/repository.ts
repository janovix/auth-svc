/**
 * user_overage_settings — raw D1 (snake_case columns)
 */

import type {
	UserOverageSettingsRow,
	UpsertOverageSettingsInput,
} from "./types";

function mapRow(r: {
	id: string;
	user_id: string;
	overage_enabled: number;
	spend_limit_cents: number | null;
	spend_limit_currency: string;
	period_overage_charge_cents: number;
	created_at: string;
	updated_at: string;
}): UserOverageSettingsRow {
	return {
		id: r.id,
		userId: r.user_id,
		overageEnabled: r.overage_enabled === 1,
		spendLimitCents: r.spend_limit_cents,
		spendLimitCurrency: r.spend_limit_currency,
		periodOverageChargeCents: r.period_overage_charge_cents,
		createdAt: new Date(r.created_at),
		updatedAt: new Date(r.updated_at),
	};
}

export class OverageRepository {
	constructor(private readonly db: D1Database) {}

	async getByUserId(userId: string): Promise<UserOverageSettingsRow | null> {
		const r = await this.db
			.prepare(
				`SELECT id, user_id, overage_enabled, spend_limit_cents, spend_limit_currency,
				 period_overage_charge_cents, created_at, updated_at
				 FROM user_overage_settings WHERE user_id = ? LIMIT 1`,
			)
			.bind(userId)
			.first<{
				id: string;
				user_id: string;
				overage_enabled: number;
				spend_limit_cents: number | null;
				spend_limit_currency: string;
				period_overage_charge_cents: number;
				created_at: string;
				updated_at: string;
			}>();
		return r ? mapRow(r) : null;
	}

	async upsert(
		input: UpsertOverageSettingsInput,
	): Promise<UserOverageSettingsRow> {
		const existing = await this.getByUserId(input.userId);
		const overageEnabled =
			input.overageEnabled !== undefined
				? input.overageEnabled
				: (existing?.overageEnabled ?? false);
		const spendLimitCents =
			input.spendLimitCents !== undefined
				? input.spendLimitCents
				: (existing?.spendLimitCents ?? null);
		const spendLimitCurrency =
			input.spendLimitCurrency ?? existing?.spendLimitCurrency ?? "MXN";
		const periodCharge = existing?.periodOverageChargeCents ?? 0;

		if (existing) {
			await this.db
				.prepare(
					`UPDATE user_overage_settings SET
						overage_enabled = ?,
						spend_limit_cents = ?,
						spend_limit_currency = ?,
						updated_at = datetime('now')
					 WHERE user_id = ?`,
				)
				.bind(
					overageEnabled ? 1 : 0,
					spendLimitCents,
					spendLimitCurrency,
					input.userId,
				)
				.run();
		} else {
			await this.db
				.prepare(
					`INSERT INTO user_overage_settings (
						id, user_id, overage_enabled, spend_limit_cents, spend_limit_currency,
						period_overage_charge_cents, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
				)
				.bind(
					crypto.randomUUID(),
					input.userId,
					overageEnabled ? 1 : 0,
					spendLimitCents,
					spendLimitCurrency,
					periodCharge,
				)
				.run();
		}

		const row = await this.getByUserId(input.userId);
		if (!row) throw new Error("Failed to upsert user_overage_settings");
		return row;
	}

	async addPeriodOverageCharge(
		userId: string,
		deltaCents: number,
	): Promise<void> {
		if (deltaCents <= 0) return;
		await this.db
			.prepare(
				`INSERT INTO user_overage_settings (
					id, user_id, overage_enabled, spend_limit_cents, spend_limit_currency,
					period_overage_charge_cents, created_at, updated_at
				) VALUES (?, ?, 0, NULL, 'MXN', ?, datetime('now'), datetime('now'))
				ON CONFLICT(user_id) DO UPDATE SET
					period_overage_charge_cents = period_overage_charge_cents + excluded.period_overage_charge_cents,
					updated_at = datetime('now')`,
			)
			.bind(crypto.randomUUID(), userId, deltaCents)
			.run();
	}

	async resetPeriodOverageCharge(userId: string): Promise<void> {
		await this.db
			.prepare(
				`UPDATE user_overage_settings
				 SET period_overage_charge_cents = 0, updated_at = datetime('now')
				 WHERE user_id = ?`,
			)
			.bind(userId)
			.run();
	}
}
