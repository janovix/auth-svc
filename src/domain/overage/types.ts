/**
 * User-level metered overage preferences (Stripe subscriptions).
 */

export interface UserOverageSettingsRow {
	id: string;
	userId: string;
	overageEnabled: boolean;
	spendLimitCents: number | null;
	spendLimitCurrency: string;
	periodOverageChargeCents: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface UpsertOverageSettingsInput {
	userId: string;
	overageEnabled?: boolean;
	spendLimitCents?: number | null;
	spendLimitCurrency?: string;
}
