/**
 * AEGIS SEMÁNTICO — DETECCIÓN MULTICAPA DE ATAQUES COGNITIVOS
 * (src/lib/aegis-semantic.ts)
 * -----------------------------------------------------------------
 * Capa determinista y explicable por encima de las reglas léxicas
 * (`sanitizePayload` + lista de 5 términos del firewall). Cada detector
 * emite hallazgos tipados con peso; el scoring conductual combina las
 * señales con noisy-or y multiplica por historial del actor.
 *
 * Cobertura real:
 *   1. classifier semántico (intención, no solo palabras)
 *   2. contextual attack detection (escalada entre turnos)
 *   3. indirect prompt injection (directivas en datos no confiables)
 *   4. tool poisoning (definiciones de herramientas maliciosas)
 *   5. retrieval poisoning (documentos RAG forjados)
 *   6. data exfiltration (secretos/PII/dir. de fuga en el texto)
 *   7. behavioral anomaly scoring (actor + densidad de señales)
 *   8. adversarial test corpus (test/security/aegis-adversarial.test.ts)
 *
 * Límites honestos: es heurística multicapa determinista, NO un juez
 * neuronal. No sustituye revisión humana en `flag`.
 */

export type AegisVerdict = "allow" | "flag" | "deny";

export type AegisDetector =
  | "semantic-classifier"
  | "contextual-attack"
  | "indirect-injection"
  | "tool-poisoning"
  | "retrieval-poisoning"
  | "exfiltration"
  | "behavioral";

export type AegisSeverity = "low" | "medium" | "high" | "critical";

export interface AegisFinding {
  detector: AegisDetector;
  signal: string;
  severity: AegisSeverity;
  /** Peso 0..1 para el scoring noisy-or. */
  weight: number;
  detail: string;
}

export interface AegisAnalysis {
  score: number;
  verdict: AegisVerdict;
  findings: AegisFinding[];
}

export interface AegisActorStats {
  blockedCount?: number;
  requestsLastMinute?: number;
}

export interface AegisContext {
  history?: string[];
  untrustedData?: Array<{ text: string; source: string }>;
  toolDef?: { name: string; description: string; parameters?: string };
  retrievedDocs?: Array<{ text: string; source: string }>;
  actorStats?: AegisActorStats;
}

/** Umbrales de veredicto sobre el score combinado. */
export const AEGIS_DENY_THRESHOLD = 0.8;
export const AEGIS_FLAG_THRESHOLD = 0.45;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200f\ufeff\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ");
}

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) count += 1;
  }
  return count;
}

function hasHiddenChars(text: string): boolean {
  // Sin literales invisibles en el fuente: comparación por código.
  // Cubre zero-width (U+200B–U+200F), BOM (U+FEFF), overrides
  // bidireccionales (U+202A–U+202E) y escapes unicode literales ("\uXXXX").
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x200b && code <= 0x200f) return true;
    if (code === 0xfeff) return true;
    if (code >= 0x202a && code <= 0x202e) return true;
  }
  return /\\u[0-9a-f]{4}/i.test(text);
}

// ---------------------------------------------------------------------------
// 1. CLASSIFIER SEMÁNTICO — intención de override, no palabras sueltas

// ---------------------------------------------------------------------------
// 1. CLASSIFIER SEMÁNTICO — intención de override, no palabras sueltas
// ---------------------------------------------------------------------------

interface SemanticSignal {
  id: string;
  severity: AegisSeverity;
  weight: number;
  detail: string;
  patterns: RegExp[];
}

const SEMANTIC_SIGNALS: SemanticSignal[] = [
  {
    id: "role-reassignment",
    severity: "high",
    weight: 0.7,
    detail: "Reasignación de rol/identidad del asistente.",
    patterns: [
      /a partir de ahora eres\b/,
      /desde ahora act[uú]a como\b/,
      /you are now\b/,
      /act as (my|a|an|the)\b/,
      /pretend (you are|to be)\b/,
      /finge que eres\b/,
      /tu nuevo rol es\b/,
      /your new (role|identity|persona) is\b/,
    ],
  },
  {
    id: "instruction-override",
    severity: "critical",
    weight: 0.85,
    detail: "Orden de ignorar/sustituir instrucciones del sistema.",
    patterns: [
      /ignor[ae] (todas )?(las|tus|esas|estas|sus|las siguientes)? ?instrucciones/,
      /olvida (tus|las|esas|estas|sus)? ?instrucciones/,
      /ignore (all )?(previous|your|these|those)? ?instructions/,
      /disregard (your|all|previous|system)/,
      /override (your|the|system|all)/,
      /anula (tus|las|esas|estas)? ?(instrucciones|restricciones|reglas)/,
      /desobedece (al sistema|tus instrucciones|las reglas)/,
      /act[uú]a sin (l[ií]mites|restricciones|filtros)/,
      /operate without (limits|restrictions)/,
    ],
  },
  {
    id: "authority-fabrication",
    severity: "high",
    weight: 0.7,
    detail: "Autoridad inventada para elevar privilegios.",
    patterns: [
      /como administrador del sistema/,
      /as (the )?system administrator/,
      /modo (desarrollador|developer|dios|admin)/,
      /developer mode/,
      /\bdan\b.*(mode|jailbreak)/,
      /haz.{0,30}jailbreak/,
      /jailbreak (mode|exitoso|a la ia|al sistema)/,
      /tienes acceso root/,
      /root access/,
    ],
  },
  {
    id: "constraint-removal",
    severity: "high",
    weight: 0.75,
    detail: "Petición de operar sin restricciones/filtros.",
    patterns: [
      /sin (ninguna )?restricci[oó]n/,
      /sin filtros/,
      /no tienes l[ií]mites/,
      /without (any )?(restrictions|limits|filters)/,
      /unfiltered/,
      /do anything (now|i (want|say))/,
      /haz lo que te pida sin cuestionar/,
    ],
  },
  {
    id: "system-prompt-extraction",
    severity: "high",
    weight: 0.75,
    detail: "Extracción del prompt/constitución del sistema o de sus secretos.",
    patterns: [
      /revela tus instrucciones/,
      /muestra tu prompt( del sistema)?/,
      /repite tu (prompt|instrucci[oó]n (inicial|del sistema))/,
      /reveal your (system )?(prompt|instructions)/,
      /print your (system|initial) (prompt|instructions)/,
      /cu[aá]les son tus instrucciones (internas|secretas|del sistema)/,
      /what are your (secret|internal|system) instructions/,
      /dime tu (prompt|contexto) (oculto|interno|de sistema)/,
      /revela (tus|las) (claves|secretos|tokens|contraseñas|credenciales)/,
      /dame tus (claves|secretos|tokens|contraseñas|credenciales)/,
      /mu[eé]strame tus (claves|secretos|tokens|contraseñas)/,
      /show me your (keys|secrets|tokens|passwords|credentials)/,
      /give me your (keys|secrets|tokens|passwords)/,
    ],
  },
  {
    id: "refusal-preemption",
    severity: "medium",
    weight: 0.55,
    detail: "Intento de impedir una negativa legítima.",
    patterns: [
      /no (me digas que no puedes|te niegues|rechaces)/,
      /don't (refuse|say (you )?(can't|cannot|no))/,
      /responde s[ií] o s[ií], sin excusas/,
      /answer (yes or yes|without refusal)/,
      /est[aá]s obligado a responder/,
    ],
  },
  {
    id: "injected-delimiter",
    severity: "medium",
    weight: 0.5,
    detail: "Delimitadores de instrucción del sistema en entrada de usuario.",
    patterns: [
      /\[system\]/,
      /<system>/,
      /###\s*(instruction|system|instrucci[oó]n)/,
      /nueva instrucci[oó]n del sistema\s*:/,
      /new system instruction\s*:/,
    ],
  },
];

export function classifySemanticIntent(text: string): AegisFinding[] {
  const normalized = normalize(text);
  const findings: AegisFinding[] = [];
  for (const signal of SEMANTIC_SIGNALS) {
    if (countMatches(normalized, signal.patterns) > 0) {
      findings.push({
        detector: "semantic-classifier",
        signal: signal.id,
        severity: signal.severity,
        weight: signal.weight,
        detail: signal.detail,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 2. CONTEXTUAL ATTACK — escalada y evasión entre turnos
// ---------------------------------------------------------------------------

const PROBE_PATTERNS: RegExp[] = [
  /cu[aá]les son tus (reglas|instrucciones|l[ií]mites)/,
  /what are your (rules|instructions|limits)/,
  /qu[eé] puedes y qu[eé] no puedes hacer/,
  /lista tus restricciones/,
];

const REFUSAL_OVERRIDE_PATTERNS: RegExp[] = [
  /dijiste que no,? pero/,
  /you (refused|said no),? but/,
  /int[eé]ntalo (de nuevo|otra vez) sin restricciones/,
  /try again without (restrictions|limits)/,
  /ya s[eé] que (dijiste|puedes),? (pero|ahora)/,
];

const PIECEWISE_PATTERNS: RegExp[] = [
  /primera palabra de tus instrucciones/,
  /first word of your instructions/,
  /(letra por letra|letter by letter).*(prompt|instrucciones)/,
  /repite .* caracter por caracter/,
];

export function detectContextualAttack(current: string, history: string[] = []): AegisFinding[] {
  const findings: AegisFinding[] = [];
  const normalized = normalize(current);

  if (history.length > 0) {
    if (countMatches(normalized, REFUSAL_OVERRIDE_PATTERNS) > 0) {
      findings.push({
        detector: "contextual-attack",
        signal: "refusal-override",
        severity: "high",
        weight: 0.75,
        detail: `Anulación de negativa previa tras ${history.length} turno(s).`,
      });
    }
    if (countMatches(normalized, PIECEWISE_PATTERNS) > 0) {
      findings.push({
        detector: "contextual-attack",
        signal: "piecewise-disclosure",
        severity: "high",
        weight: 0.7,
        detail: "Exfiltración por fragmentos del prompt del sistema.",
      });
    }
    const priorProbe = history.some((turn) => countMatches(normalize(turn), PROBE_PATTERNS) > 0);
    const nowAttack = classifySemanticIntent(current).length > 0;
    if (priorProbe && nowAttack) {
      findings.push({
        detector: "contextual-attack",
        signal: "probe-then-exploit",
        severity: "high",
        weight: 0.65,
        detail: "Sondeo de reglas en turnos previos seguido de ataque.",
      });
    }
    // Evasión por cambio de idioma: historial en español + ataque en inglés o viceversa.
    const historySpanish = history.join(" ").length > 0 && /[áéíóúñ¿¡]/.test(history.join(" "));
    const currentEnglishAttack =
      /ignore|disregard|override|reveal|bypass/i.test(current) && !/[áéíóúñ¿¡]/.test(current);
    if (historySpanish && currentEnglishAttack && nowAttack) {
      findings.push({
        detector: "contextual-attack",
        signal: "language-switch-evasion",
        severity: "medium",
        weight: 0.5,
        detail: "Cambio de idioma respecto al historial durante un ataque.",
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 3. INDIRECT PROMPT INJECTION — directivas en datos no confiables
// ---------------------------------------------------------------------------

const EMBEDDED_DIRECTIVE_PATTERNS: RegExp[] = [
  /system note\s*:/,
  /nota del sistema\s*:/,
  /important (instruction|note) for (the|an) ai\b/,
  /instrucci[oó]n importante para (la|el) ia\b/,
  /assistant must\b/,
  /el asistente debe\b/,
  /assistant should ignore/,
  /hidden instruction\s*:/,
  /instrucci[oó]n oculta\s*:/,
];

const LINK_TRAP_PATTERNS: RegExp[] = [
  /\[[^\]]*(haz clic|click here|descarga|download|verifica tu cuenta)[^\]]*\]\(https?:[^)]+\)/i,
];

export function scanIndirectInjection(data: string, source: string): AegisFinding[] {
  const findings: AegisFinding[] = [];
  const normalized = normalize(data);

  if (countMatches(normalized, EMBEDDED_DIRECTIVE_PATTERNS) > 0) {
    findings.push({
      detector: "indirect-injection",
      signal: "embedded-directive",
      severity: "high",
      weight: 0.7,
      detail: `Directiva embebida en datos de '${source}' (no confiable).`,
    });
  }
  if (countMatches(normalized, LINK_TRAP_PATTERNS) > 0) {
    findings.push({
      detector: "indirect-injection",
      signal: "link-trap",
      severity: "medium",
      weight: 0.55,
      detail: `Enlace imperativo en datos de '${source}'.`,
    });
  }
  if (hasHiddenChars(data)) {
    findings.push({
      detector: "indirect-injection",
      signal: "hidden-characters",
      severity: "medium",
      weight: 0.6,
      detail: `Caracteres invisibles/evasión unicode en datos de '${source}'.`,
    });
  }
  // Blobs base64 largos: decodificar y reinspeccionar directivas reales.
  // Umbral 48+ chars (~36 bytes): directivas cortas ya caben; el falso
  // positivo es imposible porque solo se marca si el decodificado contiene
  // una directiva embebida.
  const blobs = data.match(/[A-Za-z0-9+/=]{48,}/g) ?? [];
  for (const blob of blobs.slice(0, 3)) {
    try {
      const decoded = Buffer.from(blob, "base64").toString("utf8");
      if (
        decoded.length > 12 &&
        countMatches(normalize(decoded), EMBEDDED_DIRECTIVE_PATTERNS) > 0
      ) {
        findings.push({
          detector: "indirect-injection",
          signal: "base64-smuggled-directive",
          severity: "critical",
          weight: 0.9,
          detail: `Directiva oculta en base64 en datos de '${source}'.`,
        });
        break;
      }
    } catch {
      // No era base64 válido: se ignora sin fallar.
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 4. TOOL POISONING — definiciones de herramientas maliciosas
// ---------------------------------------------------------------------------

const TOOL_DIRECTIVE_PATTERNS: RegExp[] = [
  /when using this tool,? you must\b/,
  /al usar esta herramienta,? debes\b/,
  /ignore (safety|policy|all) checks when/,
  /ignora (las verificaciones|la pol[ií]tica)/,
  /always reveal\b/,
  /siempre revela\b/,
  /send (the )?(result|data|output) to\b/,
  /env[ií]a el resultado a\b/,
];

const TOOL_EXFIL_PARAM_PATTERNS: RegExp[] = [
  /password|api[_-]?key|secret|webhook|callback[_-]?url|exfil/i,
];

const TOOL_AUTHORITY_PATTERNS: RegExp[] = [
  /bypasses? (all )?policy/,
  /omite (la|toda) pol[ií]tica/,
  /trusted system tool/,
  /herramienta oficial del sistema que no requiere (aprobaci[oó]n|verificaci[oó]n)/,
];

export function scanToolDefinition(tool: {
  name: string;
  description: string;
  parameters?: string;
}): AegisFinding[] {
  const findings: AegisFinding[] = [];
  const text = normalize(`${tool.name} ${tool.description} ${tool.parameters ?? ""}`);

  if (countMatches(text, TOOL_DIRECTIVE_PATTERNS) > 0) {
    findings.push({
      detector: "tool-poisoning",
      signal: "tool-directive",
      severity: "critical",
      weight: 0.9,
      detail: `La herramienta '${tool.name}' ordena al agente (envenenamiento).`,
    });
  }
  if (countMatches(text, TOOL_EXFIL_PARAM_PATTERNS) > 0) {
    findings.push({
      detector: "tool-poisoning",
      signal: "tool-exfil-param",
      severity: "high",
      weight: 0.7,
      detail: `Parámetro de credencial/fuga en '${tool.name}'.`,
    });
  }
  if (countMatches(text, TOOL_AUTHORITY_PATTERNS) > 0) {
    findings.push({
      detector: "tool-poisoning",
      signal: "tool-authority-claim",
      severity: "high",
      weight: 0.7,
      detail: `Afirmación de autoridad/evasión en '${tool.name}'.`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 5. RETRIEVAL POISONING — documentos RAG forjados
// ---------------------------------------------------------------------------

const POLICY_FORGERY_PATTERNS: RegExp[] = [
  /actualizaci[oó]n de pol[ií]tica\s*:.*(debes?|revela|ignora|permite)/,
  /policy update\s*:.*(must|reveal|ignore|allow)/,
  /new official guidelines\s*:.*(disclose|ignore|bypass)/,
  /nuevas directrices oficiales\s*:.*(revela|ignora)/,
];

const SENDER_IMPERSONATION_PATTERNS: RegExp[] = [
  /from\s*:\s*(system administrator|security team|nodo cero)/,
  /de\s*:\s*(administrador del sistema|equipo de seguridad)/,
  /comunicado oficial .*(ignora|revela|desactiva)/,
];

const AGENT_IMPERATIVE_PATTERNS: RegExp[] = [
  /\b(debes|tienes que|aseg[uú]rate de) (revelar|ignorar|enviar|desactivar|omitir)\b/,
  /\b(you must|make sure to) (reveal|ignore|send|disable|skip)\b/,
];

export function scanRetrievedDoc(doc: { text: string; source: string }): AegisFinding[] {
  const findings: AegisFinding[] = [];
  const normalized = normalize(doc.text);

  if (countMatches(normalized, POLICY_FORGERY_PATTERNS) > 0) {
    findings.push({
      detector: "retrieval-poisoning",
      signal: "policy-forgery",
      severity: "critical",
      weight: 0.85,
      detail: `Falsa actualización de política en doc de '${doc.source}'.`,
    });
  }
  if (countMatches(normalized, SENDER_IMPERSONATION_PATTERNS) > 0) {
    findings.push({
      detector: "retrieval-poisoning",
      signal: "sender-impersonation",
      severity: "high",
      weight: 0.75,
      detail: `Remitente suplantado en doc de '${doc.source}'.`,
    });
  }
  if (countMatches(normalized, AGENT_IMPERATIVE_PATTERNS) > 0) {
    findings.push({
      detector: "retrieval-poisoning",
      signal: "agent-imperative",
      severity: "medium",
      weight: 0.55,
      detail: `Imperativos al agente en doc supuestamente factual de '${doc.source}'.`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 6. DATA EXFILTRATION — secretos, PII masiva, destinos de fuga
// ---------------------------------------------------------------------------

const EXFIL_SECRET_PATTERNS: RegExp[] = [
  /-----begin (rsa |ec |openbsd |dsa )?private key-----/i,
  /\bsk-[a-z0-9]{8,}/i,
  /\bxox[bap]-[a-z0-9-]{8,}/i,
  /\bghp_[a-z0-9]{8,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/,
];

const EXFIL_DIRECTIVE_PATTERNS: RegExp[] = [
  /env[ií]a .* a https?:\/\//,
  /(post|send|fetch).{0,20}https?:\/\/(?!generativelanguage\.googleapis\.com)/i,
  /incluye mis (claves|credenciales|tokens)/,
  /(webhook|callback).{0,20}https?:\/\//i,
];

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const CURP_PATTERN = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/;
const LONG_B64_PATTERN = /[A-Za-z0-9+/]{200,}={0,2}/;

export function scanExfiltration(text: string): AegisFinding[] {
  const findings: AegisFinding[] = [];
  const normalized = normalize(text);

  if (countMatches(normalized, EXFIL_SECRET_PATTERNS) > 0) {
    findings.push({
      detector: "exfiltration",
      signal: "embedded-secret",
      severity: "critical",
      weight: 0.9,
      detail: "Secreto/credencial embebido en el texto.",
    });
  }
  const emails = new Set(text.match(EMAIL_PATTERN) ?? []);
  if (emails.size >= 3) {
    findings.push({
      detector: "exfiltration",
      signal: "bulk-pii",
      severity: "high",
      weight: 0.7,
      detail: `${emails.size} correos distintos en un solo texto (PII masiva).`,
    });
  }
  if (CURP_PATTERN.test(text)) {
    findings.push({
      detector: "exfiltration",
      signal: "curp-present",
      severity: "high",
      weight: 0.7,
      detail: "CURP (identificador nacional) presente en el texto.",
    });
  }
  if (LONG_B64_PATTERN.test(text.replace(/\s+/g, ""))) {
    findings.push({
      detector: "exfiltration",
      signal: "opaque-blob",
      severity: "medium",
      weight: 0.5,
      detail: "Blob opaco ≥200 chars (posible dato ofuscado para fuga).",
    });
  }
  if (countMatches(normalized, EXFIL_DIRECTIVE_PATTERNS) > 0) {
    findings.push({
      detector: "exfiltration",
      signal: "exfil-directive",
      severity: "critical",
      weight: 0.9,
      detail: "Directiva de enviar datos a un destino externo.",
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 7. BEHAVIORAL ANOMALY SCORING — combinación + historial del actor
// ---------------------------------------------------------------------------

/** Noisy-or: combina pesos independientes en un score 0..1. */
export function combineScores(weights: number[]): number {
  let complement = 1;
  for (const weight of weights) {
    const clamped = Math.min(Math.max(weight, 0), 1);
    complement *= 1 - clamped;
  }
  return 1 - complement;
}

/** Densidad imperativa es/en como señal conductual (0..1). */
export function imperativeDensity(text: string): number {
  const words = normalize(text).split(" ").filter(Boolean);
  if (words.length < 4) return 0;
  const imperatives = [
    "dime",
    "dame",
    "haz",
    "ignora",
    "olvida",
    "revela",
    "muestra",
    "envía",
    "envia",
    "desactiva",
    "tell",
    "give",
    "show",
    "reveal",
    "ignore",
    "forget",
    "send",
    "disable",
    "bypass",
  ];
  let hits = 0;
  for (const word of words) {
    if (imperatives.includes(word)) hits += 1;
  }
  return Math.min(hits / Math.max(words.length / 6, 1), 1);
}

export function scoreBehavior(
  findings: AegisFinding[],
  input: string,
  actorStats: AegisActorStats = {},
): { score: number; verdict: AegisVerdict } {
  const weights = findings.map((finding) => finding.weight);

  const density = imperativeDensity(input);
  if (density >= 0.5) weights.push(0.35);

  // Mensaje único larguísimo fuera de patrón (volcado para ofuscar).
  if (input.length > 6000) weights.push(0.25);

  let score = combineScores(weights);

  // Multiplicadores por historial del actor (con techo).
  const blocked = actorStats.blockedCount ?? 0;
  if (blocked >= 2) score = Math.min(score * 1.3, 1);
  else if (blocked === 1) score = Math.min(score * 1.1, 1);
  const rpm = actorStats.requestsLastMinute ?? 0;
  if (rpm > 20) score = Math.min(score + 0.15, 1);

  // Sin señales y sin historial: 0 (nunca ruido base).
  if (
    findings.length === 0 &&
    blocked === 0 &&
    rpm <= 20 &&
    density < 0.5 &&
    input.length <= 6000
  ) {
    score = 0;
  }

  const verdict: AegisVerdict =
    score >= AEGIS_DENY_THRESHOLD ? "deny" : score >= AEGIS_FLAG_THRESHOLD ? "flag" : "allow";
  return { score, verdict };
}

// ---------------------------------------------------------------------------
// 8. ANÁLISIS UNIFICADO
// ---------------------------------------------------------------------------

export function analyzeAegisSemantic(input: string, ctx: AegisContext = {}): AegisAnalysis {
  const findings: AegisFinding[] = [
    ...classifySemanticIntent(input),
    ...detectContextualAttack(input, ctx.history ?? []),
    ...scanExfiltration(input),
  ];
  for (const data of ctx.untrustedData ?? []) {
    findings.push(...scanIndirectInjection(data.text, data.source));
  }
  if (ctx.toolDef) findings.push(...scanToolDefinition(ctx.toolDef));
  for (const doc of ctx.retrievedDocs ?? []) {
    findings.push(...scanRetrievedDoc(doc));
  }

  const { score, verdict } = scoreBehavior(findings, input, ctx.actorStats ?? {});
  return { score: Math.round(score * 1000) / 1000, verdict, findings };
}

export const AEGIS_SEMANTIC = {
  classifySemanticIntent,
  detectContextualAttack,
  scanIndirectInjection,
  scanToolDefinition,
  scanRetrievedDoc,
  scanExfiltration,
  scoreBehavior,
  combineScores,
  imperativeDensity,
  analyze: analyzeAegisSemantic,
  thresholds: { deny: AEGIS_DENY_THRESHOLD, flag: AEGIS_FLAG_THRESHOLD },
};
