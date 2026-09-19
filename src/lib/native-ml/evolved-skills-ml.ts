import { createHash } from "node:crypto";
import type { KnowledgeObservation, ConvergenceResult } from "./convergence-engine";
import { convergeKnowledge } from "./convergence-engine";
import { type SkillResult } from "../skills/contracts";

export interface EvolvedSkillMLSignal {
  prompt: string;
  matchedSkillId: string;
  skillNumber: number;
  confidence: number;
  domain:
    | "market_intelligence"
    | "web_monitoring"
    | "design_brand"
    | "deep_search"
    | "quality_engineering"
    | "devops_launch";
  featureVector: number[];
  provenanceHash: string;
}

export interface EvolvedSkillConvergenceInput {
  teacherId: string;
  skillId: string;
  result: SkillResult<Record<string, unknown>>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedTokens(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase("es-MX")
      .normalize("NFKC")
      .match(/[\p{L}\p{N}\-_]+/gu) ?? [],
  );
}

function hasAny(tokens: Set<string>, keywords: readonly string[]): number {
  return keywords.some((k) => tokens.has(k)) ? 1 : 0;
}

const SKILL_PROFILES: Array<{
  id: string;
  number: number;
  domain: EvolvedSkillMLSignal["domain"];
  keywords: string[];
  weights: number[];
  bias: number;
}> = [
  {
    id: "firecrawl-market-research",
    number: 733,
    domain: "market_intelligence",
    keywords: ["mercado", "tam", "sam", "som", "industria", "tendencia", "competencia", "market"],
    weights: [1.8, 1.6, 1.4, 1.2],
    bias: -0.8,
  },
  {
    id: "firecrawl-monitor",
    number: 734,
    domain: "web_monitoring",
    keywords: ["monitoreo", "monitor", "diff", "cambio", "alerta", "dom", "precio", "uptime"],
    weights: [1.9, 1.5, 1.3, 1.2],
    bias: -0.7,
  },
  {
    id: "ckm-brand",
    number: 735,
    domain: "design_brand",
    keywords: ["marca", "brand", "paleta", "colores", "tipografia", "wcag", "identidad", "logo"],
    weights: [2.0, 1.7, 1.5, 1.3],
    bias: -0.9,
  },
  {
    id: "ckm-banner-design",
    number: 736,
    domain: "design_brand",
    keywords: ["banner", "diseno", "16:9", "1:1", "9:16", "aspect", "ratio", "cta", "publicidad"],
    weights: [2.1, 1.6, 1.4, 1.3],
    bias: -0.8,
  },
  {
    id: "tavily-search",
    number: 737,
    domain: "deep_search",
    keywords: ["tavily", "buscar", "fuente", "factico", "web", "snippet", "evidencia", "consulta"],
    weights: [2.0, 1.8, 1.5, 1.2],
    bias: -0.7,
  },
  {
    id: "ckm-slides",
    number: 738,
    domain: "design_brand",
    keywords: [
      "slides",
      "presentacion",
      "deck",
      "pitch",
      "diapositivas",
      "conferencia",
      "pitchdeck",
    ],
    weights: [2.2, 1.7, 1.5, 1.4],
    bias: -0.9,
  },
  {
    id: "flutter-add-widget-test",
    number: 739,
    domain: "quality_engineering",
    keywords: ["flutter", "widget", "test", "widgettester", "pumpwidget", "dart", "semantics"],
    weights: [2.3, 1.9, 1.6, 1.4],
    bias: -1.0,
  },
  {
    id: "browser-testing-with-devtools",
    number: 740,
    domain: "quality_engineering",
    keywords: [
      "devtools",
      "chrome",
      "vitals",
      "lcp",
      "cls",
      "inp",
      "lighthouse",
      "consola",
      "browser",
    ],
    weights: [2.2, 1.8, 1.6, 1.3],
    bias: -0.9,
  },
  {
    id: "firecrawl-seo-audit",
    number: 741,
    domain: "web_monitoring",
    keywords: [
      "seo",
      "audit",
      "opengraph",
      "json-ld",
      "schema",
      "robots",
      "sitemap",
      "indexabilidad",
    ],
    weights: [2.1, 1.7, 1.5, 1.2],
    bias: -0.8,
  },
  {
    id: "baoyu-infographic",
    number: 742,
    domain: "design_brand",
    keywords: [
      "infografia",
      "infographic",
      "svg",
      "esquema",
      "diagrama",
      "visual",
      "flujo",
      "baoyu",
    ],
    weights: [2.2, 1.7, 1.5, 1.3],
    bias: -0.9,
  },
  {
    id: "firecrawl-knowledge-base",
    number: 743,
    domain: "deep_search",
    keywords: [
      "knowledge",
      "base",
      "rag",
      "docs",
      "documentacion",
      "markdown",
      "chunks",
      "scraping",
    ],
    weights: [2.0, 1.8, 1.6, 1.4],
    bias: -0.8,
  },
  {
    id: "ci-cd-and-automation",
    number: 744,
    domain: "devops_launch",
    keywords: ["ci", "cd", "pipeline", "github", "actions", "workflow", "automation", "deploy"],
    weights: [2.2, 1.9, 1.6, 1.4],
    bias: -0.9,
  },
  {
    id: "firecrawl-workflows",
    number: 745,
    domain: "web_monitoring",
    keywords: ["workflows", "dag", "etl", "orquestacion", "pipeline", "scraping", "webhook"],
    weights: [2.0, 1.7, 1.5, 1.3],
    bias: -0.8,
  },
  {
    id: "baoyu-markdown-to-html",
    number: 746,
    domain: "design_brand",
    keywords: ["markdown", "html", "render", "semantico", "tipografia", "mathjax", "latex"],
    weights: [2.1, 1.8, 1.5, 1.2],
    bias: -0.8,
  },
  {
    id: "firecrawl-dashboard-reporting",
    number: 747,
    domain: "market_intelligence",
    keywords: ["dashboard", "reporting", "reporte", "kpi", "metricas", "indicadores", "tablero"],
    weights: [2.0, 1.7, 1.5, 1.3],
    bias: -0.8,
  },
  {
    id: "swiftui-expert-skill",
    number: 748,
    domain: "quality_engineering",
    keywords: [
      "swiftui",
      "swift",
      "observable",
      "ios",
      "macos",
      "view",
      "navigationstack",
      "apple",
    ],
    weights: [2.3, 1.9, 1.7, 1.4],
    bias: -1.0,
  },
  {
    id: "source-driven-development",
    number: 749,
    domain: "devops_launch",
    keywords: ["spec", "source-driven", "ast", "invariante", "contrato", "schema-first", "deriva"],
    weights: [2.1, 1.8, 1.5, 1.3],
    bias: -0.9,
  },
  {
    id: "firecrawl-lead-gen",
    number: 750,
    domain: "market_intelligence",
    keywords: [
      "lead",
      "gen",
      "prospeccion",
      "b2b",
      "empresas",
      "directorio",
      "ventas",
      "calificacion",
    ],
    weights: [2.1, 1.7, 1.5, 1.2],
    bias: -0.8,
  },
  {
    id: "shipping-and-launch",
    number: 751,
    domain: "devops_launch",
    keywords: [
      "launch",
      "shipping",
      "lanzamiento",
      "checklist",
      "produccion",
      "rollback",
      "salida",
    ],
    weights: [2.2, 1.8, 1.6, 1.3],
    bias: -0.9,
  },
  {
    id: "firecrawl-lead-research",
    number: 752,
    domain: "market_intelligence",
    keywords: [
      "lead-research",
      "dossier",
      "cuenta",
      "organizacion",
      "perfil",
      "analisis",
      "prospecto",
    ],
    weights: [2.0, 1.7, 1.5, 1.3],
    bias: -0.8,
  },
  {
    id: "flutter-add-integration-test",
    number: 753,
    domain: "quality_engineering",
    keywords: ["integration", "test", "flutter", "e2e", "journey", "extremo", "integration_test"],
    weights: [2.3, 1.9, 1.6, 1.4],
    bias: -1.0,
  },
  {
    id: "firecrawl-competitive-intel",
    number: 754,
    domain: "market_intelligence",
    keywords: [
      "competitiva",
      "intel",
      "inteligencia",
      "paridad",
      "competidor",
      "contraposicionamiento",
    ],
    weights: [2.2, 1.8, 1.5, 1.3],
    bias: -0.9,
  },
];

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, x))));
}

/**
 * Predicts and routes incoming prompts to the most relevant evolved skill (733-754)
 * using deterministic feature extraction and logistic confidence scoring.
 */
export function classifyEvolvedSkillIntent(prompt: string): EvolvedSkillMLSignal {
  const tokens = normalizedTokens(prompt);
  let bestScore = -1;
  let bestProfile = SKILL_PROFILES[0]!;

  for (const profile of SKILL_PROFILES) {
    const chunkTokens = [
      profile.keywords.slice(0, 2),
      profile.keywords.slice(2, 4),
      profile.keywords.slice(4, 6),
      profile.keywords.slice(6),
    ];
    const features = chunkTokens.map((chunk) => hasAny(tokens, chunk));
    const logit =
      profile.bias + features.reduce((sum, f, idx) => sum + f * (profile.weights[idx] ?? 1.0), 0);
    const prob = sigmoid(logit);

    if (prob > bestScore) {
      bestScore = prob;
      bestProfile = profile;
    }
  }

  const featureVector = [
    hasAny(tokens, ["mercado", "tam", "competencia", "lead"]),
    hasAny(tokens, ["monitoreo", "diff", "seo", "crawl"]),
    hasAny(tokens, ["marca", "banner", "slides", "infografia", "markdown"]),
    hasAny(tokens, ["tavily", "rag", "knowledge", "buscar"]),
    hasAny(tokens, ["flutter", "widget", "devtools", "test", "swiftui"]),
    hasAny(tokens, ["ci", "cd", "launch", "spec", "pipeline"]),
  ];

  const confidence = Math.max(0.35, Math.min(0.99, bestScore));

  return {
    prompt,
    matchedSkillId: bestProfile.id,
    skillNumber: bestProfile.number,
    confidence,
    domain: bestProfile.domain,
    featureVector,
    provenanceHash: hash({ prompt, matchedId: bestProfile.id, confidence, featureVector }),
  };
}

/**
 * Converts execution output from an evolved skill into an epistemic KnowledgeObservation
 * for Isabella's multi-teacher convergence engine.
 */
export function skillResultToKnowledgeObservation(
  skillId: string,
  teacherId: string,
  result: SkillResult<Record<string, unknown>>,
): KnowledgeObservation {
  const profile = SKILL_PROFILES.find((p) => p.id === skillId) || {
    domain: "operational",
    number: 0,
  };

  const domainMap: Record<
    string,
    "factual" | "technical" | "operational" | "creative" | "security"
  > = {
    market_intelligence: "factual",
    web_monitoring: "operational",
    design_brand: "creative",
    deep_search: "factual",
    quality_engineering: "technical",
    devops_launch: "operational",
  };

  const mappedDomain = domainMap[profile.domain] || "operational";
  const confidence = result.status === "SUCCESS" ? 0.94 : 0.65;
  const freshness = 0.98;

  return {
    teacherId: teacherId || `teacher_${skillId}`,
    modelId: `evolved-skill-${skillId}-v4.2.0`,
    domain: mappedDomain,
    claim: result.summary || `Ejecución de skill ${skillId} completada con estado ${result.status}`,
    evidenceLevel: result.evidence && result.evidence.length > 0 ? "E3" : "E2",
    confidence,
    freshness,
    provenanceHash: hash({ skillId, summary: result.summary, data: result.data }),
  };
}

/**
 * Executes multi-skill epistemic convergence across observations gathered from evolved skills.
 */
export function convergeEvolvedSkillResults(
  observations: readonly KnowledgeObservation[],
): ConvergenceResult {
  // No se fabrica evidencia para forzar consenso. La convergencia requiere observaciones reales e independientes.
  return convergeKnowledge(observations);
}
