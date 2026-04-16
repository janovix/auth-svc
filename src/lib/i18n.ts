/**
 * Central message catalog for server-side email and notification copy.
 * Interpolation: {{paramName}} in strings.
 */

export type LanguageCode = "en" | "es";

export const MESSAGE_KEYS = [
	"otp.subject.email_verification",
	"otp.subject.sign_in",
	"otp.subject.default",
	"org_invite.subject",
	"org_invite.org_fallback_name",
	"promotion.subject",
	"email.view_details",
	"risk.client_high.title",
	"risk.client_high.body",
	"risk.client_changed.title",
	"risk.client_changed.body",
	"risk.client_critical.title",
	"risk.client_critical.body",
	"risk.review_due.title",
	"risk.review_due.body",
	"risk.org_changed.title",
	"risk.org_changed.body",
	"risk.audit_escalated.title",
	"risk.audit_escalated.body",
	"risk.batch_complete.title",
	"risk.batch_complete.body",
	"risk.simplified_dd.title",
	"risk.simplified_dd.body",
	"kyc.invite.subject",
	"kyc.invite.title",
	"kyc.invite.body",
	"kyc.submitted.title",
	"kyc.submitted.body",
	"kyc.expiration.notify.title_hours",
	"kyc.expiration.notify.title_days",
	"kyc.expiration.notify.body",
	"kyc.expiration.email.subject",
	"kyc.expiration.email.title",
	"kyc.expiration.email.body",
	"screening.sanctions.title",
	"screening.sanctions.body",
	"screening.pep.title",
	"screening.pep.body",
	"screening.adverse_media.title",
	"screening.adverse_media.body",
	"screening.label.beneficial_controller",
	"screening.label.client",
	"notice.deadline.title_tomorrow",
	"notice.deadline.title_days",
	"notice.deadline.body",
	"import.completed.clients.title",
	"import.completed.operations.title",
	"import.failed.clients.title",
	"import.failed.operations.title",
	"import.completed.body",
	"import.warnings",
	"import.errors",
	"import.skipped",
	"import.failed.body",
	"alert.new.title",
	"alert.new.body",
	"alert.severity.title.CRITICAL",
	"alert.severity.title.HIGH",
	"alert.severity.title.MEDIUM",
	"alert.severity.title.LOW",
	"alert.severity.adj.CRITICAL",
	"alert.severity.adj.HIGH",
	"alert.severity.adj.MEDIUM",
	"alert.severity.adj.LOW",
	"org_settings_updated.title",
	"org_settings_updated.body",
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

const MESSAGE_KEY_SET = new Set<string>(MESSAGE_KEYS);

export function isMessageKey(key: string): key is MessageKey {
	return MESSAGE_KEY_SET.has(key);
}

const en: Record<MessageKey, string> = {
	"otp.subject.email_verification": "Your verification code - Janovix",
	"otp.subject.sign_in": "Your sign-in code - Janovix",
	"otp.subject.default": "Your verification code - Janovix",
	"org_invite.subject": "Invitation to join {{organizationName}}",
	"org_invite.org_fallback_name": "your organization",
	"promotion.subject": "Your Janovix access has been activated!",
	"email.view_details": "View details: {{url}}",
	"risk.client_high.title": "Client classified as High Risk",
	"risk.client_high.body":
		"Client {{clientName}} has been classified as High Risk. Enhanced due diligence and intensified monitoring are required (Art. 18-X LFPIORPI).",
	"risk.client_changed.title": "Client risk level changed",
	"risk.client_changed.body":
		"Client {{clientName}} changed from {{previousLevel}} to {{newLevel}}.",
	"risk.client_critical.title": "Client at CRITICAL risk",
	"risk.client_critical.body":
		"Client {{clientName}} combines PEP + list match + High Risk. Immediate review required.",
	"risk.review_due.title": "Clients pending risk review",
	"risk.review_due.body":
		"There are {{clientsDueCount}} client(s) with overdue risk review.",
	"risk.org_changed.title": "Organizational risk level changed",
	"risk.org_changed.body":
		"The entity risk level changed from {{previousLevel}} to {{newLevel}}. Review implications for audit type (Art. 18-XI).",
	"risk.audit_escalated.title": "Audit type escalation required",
	"risk.audit_escalated.body":
		"The required audit type changed from {{previousAuditType}} to {{newAuditType}} due to {{riskLevel}} risk (Art. 18-XI LFPIORPI).",
	"risk.batch_complete.title": "Bulk risk assessment completed",
	"risk.batch_complete.body":
		"{{totalAssessed}} clients assessed: {{highRiskCount}} high, {{mediumRiskCount}} medium, {{lowRiskCount}} low.",
	"risk.simplified_dd.title": "Client eligible for simplified due diligence",
	"risk.simplified_dd.body":
		"Client {{clientName}} was classified as Low Risk and is eligible for simplified DD (Art. 19 LFPIORPI).",
	"kyc.invite.subject": "{{orgName}} - Complete your KYC information",
	"kyc.invite.title": "Complete your KYC information",
	"kyc.invite.body":
		"Hello {{clientName}}, you have been invited to complete your identification information for {{orgName}}. Use the link below to begin. This link expires on {{expiryDate}}.",
	"kyc.submitted.title": "KYC session submitted for review",
	"kyc.submitted.body":
		"{{clientName}} has submitted their KYC information and it is ready for your review.",
	"kyc.expiration.notify.title_hours": "KYC session expiring in {{hoursLeft}}h",
	"kyc.expiration.notify.title_days":
		"KYC session expires in {{hoursLeft}} hours",
	"kyc.expiration.notify.body":
		"The KYC session for client {{clientId}} expires on {{expiresAtUtc}} UTC. The client has not yet completed the process.",
	"kyc.expiration.email.subject": "Your KYC session is expiring",
	"kyc.expiration.email.title": "Complete your KYC information",
	"kyc.expiration.email.body":
		"Dear {{name}}, your identification session expires in approximately {{hoursLeft}} hours. Please complete the process before the link expires.",
	"screening.sanctions.title": "Watchlist match: Sanctions",
	"screening.sanctions.body":
		"{{entityLabel}} {{entityName}} matched on a sanctions list (OFAC, UNSC, or SAT 69-B).",
	"screening.pep.title": "Watchlist match: PEP",
	"screening.pep.body":
		"{{entityLabel}} {{entityName}} has been identified as a Politically Exposed Person (PEP).",
	"screening.adverse_media.title": "Watchlist match: Adverse media",
	"screening.adverse_media.body":
		"{{entityLabel}} {{entityName}} has been flagged for adverse media findings.",
	"screening.label.beneficial_controller": "Beneficial controller",
	"screening.label.client": "Client",
	"notice.deadline.title_tomorrow":
		"Due tomorrow: {{pendingAlertCount}} unreported alerts",
	"notice.deadline.title_days":
		"{{daysUntilDeadline}} days until deadline: {{pendingAlertCount}} pending alerts",
	"notice.deadline.body":
		"You have {{pendingAlertCount}} alert(s) pending inclusion in a SAT notice for period {{period}}. The submission deadline is {{deadlineStr}}. Log in to the platform to generate and submit your notice before it expires.",
	"import.completed.clients.title": "Import completed: clients",
	"import.completed.operations.title": "Import completed: operations",
	"import.failed.clients.title": "Import failed: clients",
	"import.failed.operations.title": "Import failed: operations",
	"import.completed.body":
		"{{totalRows}} row(s) processed: {{successCount}} succeeded{{warningPart}}{{errorPart}}{{skippedPart}}.",
	"import.warnings": ", {{n}} warnings",
	"import.errors": ", {{n}} errors",
	"import.skipped": ", {{n}} skipped",
	"import.failed.body":
		"The import could not be completed. Reason: {{errorMessage}}",
	"alert.new.title": "New AML alert: {{severityLabel}} severity",
	"alert.new.body":
		"A {{severityLower}} alert was detected for client {{clientDisplay}}: {{seekerName}}.",
	"alert.severity.title.CRITICAL": "Critical",
	"alert.severity.title.HIGH": "High",
	"alert.severity.title.MEDIUM": "Medium",
	"alert.severity.title.LOW": "Low",
	"alert.severity.adj.CRITICAL": "critical",
	"alert.severity.adj.HIGH": "high",
	"alert.severity.adj.MEDIUM": "medium",
	"alert.severity.adj.LOW": "low",
	"org_settings_updated.title": "Organization settings updated",
	"org_settings_updated.body":
		'Organization "{{orgName}}" settings have been updated by an administrator.',
};

const es: Record<MessageKey, string> = {
	"otp.subject.email_verification": "Tu código de verificación - Janovix",
	"otp.subject.sign_in": "Tu código de inicio de sesión - Janovix",
	"otp.subject.default": "Tu código de verificación - Janovix",
	"org_invite.subject": "Invitación a unirse a {{organizationName}}",
	"org_invite.org_fallback_name": "tu organización",
	"promotion.subject": "¡Tu acceso a Janovix ha sido activado!",
	"email.view_details": "Ver detalles: {{url}}",
	"risk.client_high.title": "Cliente clasificado como Alto Riesgo",
	"risk.client_high.body":
		"El cliente {{clientName}} ha sido clasificado como Alto Riesgo. Se requiere debida diligencia reforzada y monitoreo intensificado (Art. 18-X LFPIORPI).",
	"risk.client_changed.title": "Cambio en nivel de riesgo de cliente",
	"risk.client_changed.body":
		"El cliente {{clientName}} cambió de {{previousLevel}} a {{newLevel}}.",
	"risk.client_critical.title": "Cliente en riesgo CRITICO",
	"risk.client_critical.body":
		"El cliente {{clientName}} combina PEP + coincidencia en listas + Alto Riesgo. Requiere revisión inmediata.",
	"risk.review_due.title": "Clientes pendientes de revisión de riesgo",
	"risk.review_due.body":
		"Hay {{clientsDueCount}} cliente(s) con revisión de riesgo vencida.",
	"risk.org_changed.title": "Cambio en nivel de riesgo organizacional",
	"risk.org_changed.body":
		"El nivel de riesgo de la entidad cambió de {{previousLevel}} a {{newLevel}}. Revise las implicaciones en tipo de auditoría (Art. 18-XI).",
	"risk.audit_escalated.title": "Escalamiento de tipo de auditoría requerida",
	"risk.audit_escalated.body":
		"El tipo de auditoría requerida cambió de {{previousAuditType}} a {{newAuditType}} debido a riesgo {{riskLevel}} (Art. 18-XI LFPIORPI).",
	"risk.batch_complete.title": "Evaluación masiva de riesgo completada",
	"risk.batch_complete.body":
		"Se evaluaron {{totalAssessed}} clientes: {{highRiskCount}} alto, {{mediumRiskCount}} medio, {{lowRiskCount}} bajo.",
	"risk.simplified_dd.title":
		"Cliente elegible para debida diligencia simplificada",
	"risk.simplified_dd.body":
		"El cliente {{clientName}} fue clasificado como Bajo Riesgo y es elegible para DD simplificada (Art. 19 LFPIORPI).",
	"kyc.invite.subject": "{{orgName}} - Complete su información KYC",
	"kyc.invite.title": "Complete su información KYC",
	"kyc.invite.body":
		"Estimado(a) {{clientName}}, le invitamos a completar su información de identificación para {{orgName}}. Use el enlace siguiente para comenzar. Este enlace vence el {{expiryDate}}.",
	"kyc.submitted.title": "Sesión KYC enviada a revisión",
	"kyc.submitted.body":
		"{{clientName}} ha enviado su información KYC y está lista para su revisión.",
	"kyc.expiration.notify.title_hours":
		"Sesión KYC por expirar en {{hoursLeft}}h",
	"kyc.expiration.notify.title_days":
		"Sesión KYC expira en {{hoursLeft}} horas",
	"kyc.expiration.notify.body":
		"La sesión KYC para el cliente {{clientId}} expira el {{expiresAtUtc}} UTC. El cliente aún no ha completado el proceso.",
	"kyc.expiration.email.subject": "Su sesión KYC está por expirar",
	"kyc.expiration.email.title": "Complete su información KYC",
	"kyc.expiration.email.body":
		"Estimado(a) {{name}}, su sesión de identificación expira en aproximadamente {{hoursLeft}} horas. Por favor complete el proceso antes de que expire el enlace.",
	"screening.sanctions.title": "Coincidencia en listas: Sanciones",
	"screening.sanctions.body":
		"{{entityLabel}} {{entityName}} coincidió en una lista de sanciones (OFAC, ONU o SAT 69-B).",
	"screening.pep.title": "Coincidencia en listas: PEP",
	"screening.pep.body":
		"{{entityLabel}} {{entityName}} ha sido identificado como Persona Políticamente Expuesta (PEP).",
	"screening.adverse_media.title": "Coincidencia en listas: Medios adversos",
	"screening.adverse_media.body":
		"{{entityLabel}} {{entityName}} fue marcado por hallazgos en medios adversos.",
	"screening.label.beneficial_controller": "Controlador beneficiario",
	"screening.label.client": "Cliente",
	"notice.deadline.title_tomorrow":
		"Vencimiento mañana: {{pendingAlertCount}} alertas sin reportar",
	"notice.deadline.title_days":
		"{{daysUntilDeadline}} días para el vencimiento: {{pendingAlertCount}} alertas pendientes",
	"notice.deadline.body":
		"Tiene {{pendingAlertCount}} alerta(s) pendiente(s) de incluir en un aviso SAT para el periodo {{period}}. La fecha límite de presentación es el {{deadlineStr}}. Ingrese a la plataforma para generar y enviar su aviso antes del vencimiento.",
	"import.completed.clients.title": "Importación completada: clientes",
	"import.completed.operations.title": "Importación completada: operaciones",
	"import.failed.clients.title": "Importación fallida: clientes",
	"import.failed.operations.title": "Importación fallida: operaciones",
	"import.completed.body":
		"Se procesaron {{totalRows}} fila(s): {{successCount}} correctas{{warningPart}}{{errorPart}}{{skippedPart}}.",
	"import.warnings": ", {{n}} advertencias",
	"import.errors": ", {{n}} errores",
	"import.skipped": ", {{n}} omitidas",
	"import.failed.body":
		"No se pudo completar la importación. Motivo: {{errorMessage}}",
	"alert.new.title": "Nueva alerta AML: severidad {{severityLabel}}",
	"alert.new.body":
		"Se detectó una alerta de severidad {{severityLower}} para el cliente {{clientDisplay}}: {{seekerName}}.",
	"alert.severity.title.CRITICAL": "Crítica",
	"alert.severity.title.HIGH": "Alta",
	"alert.severity.title.MEDIUM": "Media",
	"alert.severity.title.LOW": "Baja",
	"alert.severity.adj.CRITICAL": "crítica",
	"alert.severity.adj.HIGH": "alta",
	"alert.severity.adj.MEDIUM": "media",
	"alert.severity.adj.LOW": "baja",
	"org_settings_updated.title": "Configuración de la organización actualizada",
	"org_settings_updated.body":
		'Un administrador actualizó la configuración de la organización "{{orgName}}".',
};

export const CATALOG: Record<LanguageCode, Record<MessageKey, string>> = {
	en,
	es,
};

/**
 * Normalize arbitrary language string to supported LanguageCode.
 */
export function normalizeLanguage(
	value: string | null | undefined,
): LanguageCode {
	if (value === "es") return "es";
	return "en";
}

/**
 * Interpolate {{placeholders}} in template.
 */
export function interpolate(
	template: string,
	params?: Record<string, string | number>,
): string {
	if (!params) return template;
	return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
		const v = params[name];
		return v === undefined || v === null ? "" : String(v);
	});
}

export function t(
	lang: LanguageCode,
	key: MessageKey,
	params?: Record<string, string | number>,
): string {
	const raw = CATALOG[lang][key] ?? CATALOG.en[key] ?? key;
	return interpolate(raw, params);
}

export type EmailI18nPayload = {
	titleKey: MessageKey;
	bodyKey: MessageKey;
	titleParams?: Record<string, string | number>;
	bodyParams?: Record<string, string | number>;
};
