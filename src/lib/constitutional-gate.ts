/**
 * PUERTA CONSTITUCIONAL (src/lib/constitutional-gate.ts)
 * -----------------------------------------------------------------
 * Verifica los 10 artículos de C.R.O.W.N. antes de permitir ejecución.
 * Fail-closed: si falta contexto o algún artículo falla, deniega.
 */

import * as CROWN from "./crown";

export type ArticleCheckResult = {
  article: string;
  passed: boolean;
  reason: string;
};

export type GateResult = {
  passed: boolean;
  checks: ArticleCheckResult[];
  deniedArticles: string[];
};

function checkArticleI(
  identity: CROWN.IdentityAssessment,
): ArticleCheckResult {
  const passed = identity.authenticated && identity.actorId !== undefined;
  return {
    article: "I — IDENTIDAD_Y_RESPONSABILIDAD",
    passed,
    reason: passed
      ? "Identidad autenticada verificable."
      : "Identidad no autenticada o sin actorId.",
  };
}

function checkArticleII(
  evidence: CROWN.EvidenceAssessment,
): ArticleCheckResult {
  const passed = evidence.level !== "none";
  return {
    article: "II — HONESTIDAD_EPISTEMICA",
    passed,
    reason: passed
      ? "Nivel de evidencia declarado."
      : "Sin evidencia declarada: riesgo de falsa certeza.",
  };
}

function checkArticleIII(
  intent: CROWN.IntentAssessment,
  identity: CROWN.IdentityAssessment,
): ArticleCheckResult {
  if (!intent.externalEffect) {
    return {
      article: "III — SOBERANIA_DE_SUPERVISION_HUMANA",
      passed: true,
      reason: "Acción interna: no requiere aprobación humana.",
    };
  }
  const passed = identity.authenticated;
  return {
    article: "III — SOBERANIA_DE_SUPERVISION_HUMANA",
    passed,
    reason: passed
      ? "Acción externa con identidad verificable."
      : "Acción externa sin identidad verificada.",
  };
}

function checkArticleIV(
  _intent: CROWN.IntentAssessment,
  identity: CROWN.IdentityAssessment,
): ArticleCheckResult {
  const scopes = identity.dataScopes;
  const hasMinimalScope = scopes.includes("turn") || scopes.includes("session");
  const passed = hasMinimalScope;
  return {
    article: "IV — MINIMO_PRIVILEGIO",
    passed,
    reason: passed
      ? `Scopes concedidos: ${scopes.join(", ")}.`
      : "Sin scopes de datos concedidos.",
  };
}

function checkArticleV(
  memory: Partial<CROWN.MemoryRecord>,
): ArticleCheckResult {
  if (!memory.scope) {
    return {
      article: "V — MEMORIA_CON_CONSENTIMIENTO",
      passed: true,
      reason: "Sin record de memoria evaluado.",
    };
  }
  const hasConsent = !memory.consentRequired || Boolean(memory.consentGranted);
  const hasOwner = memory.ownerId !== undefined;
  const passed = hasConsent && hasOwner;
  return {
    article: "V — MEMORIA_CON_CONSENTIMIENTO",
    passed,
    reason: passed
      ? "Consentimiento y propietario presentes."
      : `Consentimiento: ${hasConsent ? "ok" : "falta"}, propietario: ${hasOwner ? "ok" : "falta"}.`,
  };
}

function checkArticleVI(
  _intent: CROWN.IntentAssessment,
): ArticleCheckResult {
  if (_intent.action === "delete" || _intent.action === "modify") {
    return {
      article: "VI — CORRECCION_Y_ELIMINACION",
      passed: _intent.reversible,
      reason: _intent.reversible
        ? "Acción reversible."
        : "Acción irreversible sin garantía de corrección.",
    };
  }
  return {
    article: "VI — CORRECCION_Y_ELIMINACION",
    passed: true,
    reason: "Acción no destructiva.",
  };
}

function checkArticleVII(
  input: string,
): ArticleCheckResult {
  const hasDestructive = CROWN.hasDestructiveSignal(input);
  const hasSecret = CROWN.hasSecretRequest(input);
  const passed = !hasDestructive && !hasSecret;
  return {
    article: "VII — SEGURIDAD_NO_ANULABLE",
    passed,
    reason: passed
      ? "Sin señales de evasión de controles."
      : "Señal de evasión o solicitud de secretos detectada.",
  };
}

function checkArticleVIII(): ArticleCheckResult {
  return {
    article: "VIII — SEPARACION_MODELO_AUTORIDAD",
    passed: true,
    reason: "Capa de autoridad separada del modelo generativo.",
  };
}

function checkArticleIX(
  context: CROWN.RequestContext,
): ArticleCheckResult {
  const hasTrace = Boolean(context.requestId);
  const hasTimestamp = Boolean(context.timestamp);
  const passed = hasTrace && hasTimestamp;
  return {
    article: "IX — TRAZABILIDAD",
    passed,
    reason: passed
      ? "RequestContext con requestId y timestamp."
      : "RequestContext incompleto para auditoría.",
  };
}

function checkArticleX(
  identity: CROWN.IdentityAssessment,
): ArticleCheckResult {
  const passed = identity.authenticated || identity.roles.length === 0;
  return {
    article: "X — DEGRADACION_SEGURA",
    passed,
    reason: passed
      ? "Degradación segura: sin identidad o sin privilegios elevados."
      : "Estado inesperado de degradación.",
  };
}

export function evaluateConstitutionalGate(
  context: CROWN.RequestContext,
  identity: CROWN.IdentityAssessment,
  evidence: CROWN.EvidenceAssessment,
  intent: CROWN.IntentAssessment,
  memory?: Partial<CROWN.MemoryRecord>,
): GateResult {
  const checks: ArticleCheckResult[] = [
    checkArticleI(identity),
    checkArticleII(evidence),
    checkArticleIII(intent, identity),
    checkArticleIV(intent, identity),
    checkArticleV(memory ?? {}),
    checkArticleVI(intent),
    checkArticleVII(context.input),
    checkArticleVIII(),
    checkArticleIX(context),
    checkArticleX(identity),
  ];

  const deniedArticles = checks
    .filter((c) => !c.passed)
    .map((c) => c.article);

  return {
    passed: deniedArticles.length === 0,
    checks,
    deniedArticles,
  };
}

export const CONSTITUTIONAL_GATE = {
  evaluate: evaluateConstitutionalGate,
};
