/**
 * Capa de presentación C.R.O.W.N.
 *
 * Adapta el motor canónico (`crown.ts`) a una forma plana y estable para la
 * interfaz del terminal. No es un motor de seguridad: solo traduce la decisión
 * ya evaluada a telemetría visual.
 */
import {
  MODULES,
  buildSystemPrompt as buildCanonicalPrompt,
  getModuleWeights,
  routeRequest,
  type CrownWeights,
  type ModuleId,
} from "./crown";

export { MODULES };
export type { ModuleId };

export const MODULE_ORDER: ModuleId[] = ["CROWN", "ISA", "SOPHIA", "ORION", "ARGUS"];

export type PresetId = "prime" | "empathic" | "strategic" | "executor" | "sentinel";

export interface Preset {
  id: PresetId;
  name: string;
  tagline: string;
  temperature: number;
  bias: ModuleId;
  directive: string;
}

export const PRESETS: Preset[] = [
  {
    id: "prime",
    name: "Isabella Prime",
    tagline: "Equilibrio canónico entre presencia, análisis y gobernanza.",
    temperature: 0.7,
    bias: "CROWN",
    directive: "Mantén el equilibrio entre calidez, rigor analítico y control de riesgo.",
  },
  {
    id: "empathic",
    name: "Presencia Empática",
    tagline: "ISA al frente: acompañamiento sensible y claridad humana.",
    temperature: 0.85,
    bias: "ISA",
    directive:
      "Prioriza la sensibilidad comunicativa y el acompañamiento, sin manipulación afectiva.",
  },
  {
    id: "strategic",
    name: "Dialéctica Estratégica",
    tagline: "SOPHIA al frente: epistemología, contraste y profundidad.",
    temperature: 0.55,
    bias: "SOPHIA",
    directive:
      "Prioriza el razonamiento estructurado, el contraste de hipótesis y la incertidumbre explícita.",
  },
  {
    id: "executor",
    name: "Ejecución Operativa",
    tagline: "ORION al frente: planes, artefactos y precisión técnica.",
    temperature: 0.4,
    bias: "ORION",
    directive: "Prioriza planes accionables, precisión técnica y entregables verificables.",
  },
  {
    id: "sentinel",
    name: "Centinela ARGUS",
    tagline: "ARGUS al frente: riesgo, privacidad y veto de seguridad.",
    temperature: 0.3,
    bias: "ARGUS",
    directive:
      "Prioriza la evaluación de riesgo, la privacidad y la escalación a supervisión humana.",
  },
];

export type UiPolicy = "allowed" | "requires_approval" | "denied";

export interface RoutingDecision {
  traceId: string;
  requestId: string;
  primary: ModuleId;
  supporting: ModuleId[];
  weights: CrownWeights;
  policy: UiPolicy;
  policyReason: string;
  rulesChecked: string[];
  risk: string;
  emotionalTone: string;
  rationale: string;
  governanceScore: number;
  epistemicCertainty: number;
  latencyMs: number;
  memoryScopes: string[];
  allowedTools: string[];
  responseMode: string;
  systemPrompt: string;
  createdAt: string;
}

const TONE: Record<ModuleId, string> = {
  CROWN: "Sobria",
  ISA: "Cálida",
  SOPHIA: "Reflexiva",
  ORION: "Precisa",
  ARGUS: "Vigilante",
};

const RISK_SCORE: Record<string, number> = {
  none: 0.98,
  low: 0.93,
  medium: 0.8,
  high: 0.62,
  critical: 0.45,
};

function toUiPolicy(status: string): UiPolicy {
  if (status === "denied") return "denied";
  if (status === "requires_human_approval" || status === "requires_more_information") {
    return "requires_approval";
  }
  return "allowed";
}

export function route(input: string, preset: Preset): RoutingDecision {
  const started = Date.now();
  const { decision, systemPrompt } = routeRequest(input);
  const weights = getModuleWeights(decision);

  // El preset solo inclina la presentación, nunca la política.
  weights[preset.bias] = Math.max(weights[preset.bias], 0.9);

  const risk = decision.policy.risk;

  return {
    traceId: decision.traceId,
    requestId: decision.requestId,
    primary: decision.primary,
    supporting: decision.supporting,
    weights,
    policy: toUiPolicy(decision.policy.status),
    policyReason: decision.policy.reasons[0] ?? "Sin observaciones de política para este ciclo.",
    rulesChecked: decision.policy.rulesChecked,
    risk,
    emotionalTone: TONE[decision.primary],
    rationale: `Intención ${decision.intent.category} · acción ${decision.intent.action} · apoyo ${decision.supporting.join(", ") || "ninguno"}`,
    governanceScore: RISK_SCORE[risk] ?? 0.8,
    epistemicCertainty: decision.intent.confidence,
    latencyMs: Math.max(1, Date.now() - started),
    memoryScopes: decision.memoryScopes,
    allowedTools: decision.allowedTools,
    responseMode: decision.responseMode,
    systemPrompt,
    createdAt: decision.createdAt,
  };
}

export function buildSystemPrompt(decision: RoutingDecision, preset: Preset): string {
  return [decision.systemPrompt, `Modo de presencia: ${preset.name}. ${preset.directive}`].join(
    "\n\n",
  );
}

export { buildCanonicalPrompt };
