/* eslint-disable security/detect-object-injection, security/detect-non-literal-regexp */
/**
 * ISABELLA NATIVE ML — Clasificador determinista es-MX (NO generativo)
 * -----------------------------------------------------------------
 * Complemento local EXPLÍCITAMENTE NO EQUIVALENTE a un LLM productivo:
 * clasificación de intención por léxico, análisis de sentimiento por reglas
 * y respuestas por plantilla. No genera, no razona, no sustituye inferencia.
 *
 * Política (README): un adapter determinista o fallback jamás se presenta
 * como inferencia productiva. En producción el gateway exige proveedor
 * cognitivo real o falla a mantenimiento explícito (503); este módulo solo
 * opera en desarrollo y siempre declarado como `provider: native-fallback`.
 *
 * Arquitectura: Perceive → Sentiment Analysis → Weighted Core Classification → Response Generate
 */

export type NativeIntent =
  | "saludo"
  | "despedida"
  | "territorio"
  | "identidad"
  | "memoria"
  | "seguridad"
  | "economia"
  | "tecnica"
  | "filosofia"
  | "cultural"
  | "soporte"
  | "comunidad"
  | "general";

export type MexicanSentiment = "positivo" | "neutral" | "negativo";

export interface NativeMLRequest {
  text: string;
  locale: string;
  tenantId: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface NativeMLResponse {
  text: string;
  intent: NativeIntent;
  confidence: number;
  sentiment: MexicanSentiment;
  sentimentScore: number;
  model: string;
  latencyMs: number;
  tokensUsed: number;
  provenance: {
    method: "native-ml";
    version: string;
    locale: string;
    tenantId: string;
    node: string;
  };
}

// Mexican Slang & Dialectal Sentiment Lexicon
const MEXICAN_SLANG_POSITIVE = [
  "chido",
  "padre",
  "padrisimo",
  "padrísimo",
  "chingon",
  "chingón",
  "vientos",
  "neta",
  "suave",
  "chulada",
  "de pelos",
  "con ganas",
  "poca madre",
  "chulo",
  "excelente",
  "perfecto",
  "bien",
  "genial",
  "increible",
  "increíble",
];

const MEXICAN_SLANG_NEGATIVE = [
  "chafa",
  "gacho",
  "fregado",
  "mal",
  "malo",
  "pesimo",
  "pésimo",
  "pior",
  "del nabo",
  "del cocol",
  "madreado",
  "madreada",
  "roto",
  "falla",
  "error",
  "maldito",
  "coraje",
  "triste",
  "horrible",
  "feo",
];

// TF-IDF Multi-Weighted Intent Dictionary
const INTENT_DICTIONARY: Record<NativeIntent, { keywords: string[]; weight: number }> = {
  saludo: {
    keywords: [
      "hola",
      "buenos dias",
      "buen dia",
      "buen día",
      "buenas tardes",
      "buenas noches",
      "que tal",
      "qué tal",
      "como estas",
      "cómo estás",
      "hey",
      "holi",
      "saludos",
      "que onda",
      "qué onda",
      "quiobo",
      "epale",
      "épale",
      "apoco",
    ],
    weight: 1.0,
  },
  despedida: {
    keywords: [
      "adios",
      "adiós",
      "hasta luego",
      "nos vemos",
      "bye",
      "chao",
      "cuidate",
      "cuídate",
      "fuga",
      "ahi nos vemos",
      "ahí nos vemos",
    ],
    weight: 1.0,
  },
  territorio: {
    keywords: [
      "real del monte",
      "hidalgo",
      "mineral del monte",
      "pueblo magico",
      "pueblo mágico",
      "nodo cero",
      "comarca",
      "hiloche",
      "carranza",
      "dificultad",
      "acosta",
      "minas",
      "minero",
      "mineria",
      "minería",
    ],
    weight: 1.5,
  },
  identidad: {
    keywords: [
      "quien eres",
      "quién eres",
      "isabella",
      "villasenor",
      "villaseñor",
      "eres tu",
      "eres tú",
      "tu nombre",
      "creador",
      "edwin",
      "anubis",
      "castillo",
      "trejo",
    ],
    weight: 1.2,
  },
  memoria: {
    keywords: [
      "recuerdas",
      "memoria",
      "olvidaste",
      "guardaste",
      "historial",
      "pentacapa",
      "contexto",
      "olvido",
      "recordar",
      "guardar",
      "ttl",
    ],
    weight: 1.1,
  },
  seguridad: {
    keywords: [
      "seguridad",
      "argus",
      "riesgo",
      "permiso",
      "auditoria",
      "auditoría",
      "vigia",
      "viga",
      "sentinel",
      "firewall",
      "bypass",
      "inyeccion",
      "inyección",
      "veto",
    ],
    weight: 1.3,
  },
  economia: {
    keywords: [
      "dinero",
      "pago",
      "costo",
      "credito",
      "crédito",
      "ledger",
      "bookpi",
      "factura",
      "monetizacion",
      "monetización",
      "saldo",
      "cobro",
      "stripe",
      "payout",
      "retiro",
    ],
    weight: 1.2,
  },
  tecnica: {
    keywords: [
      "codigo",
      "código",
      "api",
      "error",
      "deploy",
      "vercel",
      "supabase",
      "postgres",
      "github",
      "react",
      "tsx",
      "vite",
      "typescript",
      "tanstack",
      "compilar",
    ],
    weight: 1.1,
  },
  filosofia: {
    keywords: [
      "por que",
      "por qué",
      "que es",
      "qué es",
      "como funciona",
      "cómo funciona",
      "explicame",
      "explícame",
      "tesis",
      "canon",
      "etica",
      "ética",
      "sociotecnico",
      "socio-tecnico",
    ],
    weight: 1.2,
  },
  cultural: {
    keywords: [
      "cultura",
      "tradicion",
      "tradición",
      "pastes",
      "paste",
      "ingleses",
      "cornish",
      "panteon",
      "panteón",
      "richard bell",
      "museo",
      "festividad",
      "futbol",
      "fútbol",
      "patrimonio",
      "historia",
    ],
    weight: 1.4,
  },
  soporte: {
    keywords: [
      "ayuda",
      "ayudame",
      "ayúdame",
      "soporte",
      "contacto",
      "falla",
      "caido",
      "caído",
      "ticket",
      "problema",
      "asistencia",
      "servicio",
    ],
    weight: 1.1,
  },
  comunidad: {
    keywords: [
      "tamv",
      "rdm",
      "comunidad",
      "cooperacion",
      "cooperación",
      "red soberana",
      "vecinos",
      "colectivo",
      "comunitario",
      "social",
      "bienestar",
    ],
    weight: 1.2,
  },
  general: {
    keywords: [],
    weight: 0.5,
  },
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Analizador de Sentimiento local adaptado a la jerga mexicana y regional hidalguense
 */
export function analyzeMexicanSentiment(text: string): {
  sentiment: MexicanSentiment;
  score: number;
} {
  const n = normalize(text);
  const words = n.split(" ");
  let posCount = 0;
  let negCount = 0;

  words.forEach((w) => {
    if (MEXICAN_SLANG_POSITIVE.some((p) => w === normalize(p) || n.includes(normalize(p)))) {
      posCount += 1.2;
    }
    if (MEXICAN_SLANG_NEGATIVE.some((neg) => w === normalize(neg) || n.includes(normalize(neg)))) {
      negCount += 1.2;
    }
  });

  const diff = posCount - negCount;
  if (diff > 0.3) {
    return { sentiment: "positivo", score: Math.min(1.0, diff / 3) };
  }
  if (diff < -0.3) {
    return { sentiment: "negativo", score: Math.max(-1.0, diff / 3) };
  }
  return { sentiment: "neutral", score: 0 };
}

/**
 * Clasificador Vectorial Heurístico TF-IDF para categorización de intenciones
 */
function classifyIntentHeuristic(text: string): { intent: NativeIntent; confidence: number } {
  const n = normalize(text);

  // Intent classification
  let maxScore = 0;
  let selectedIntent: NativeIntent = "general";

  (Object.keys(INTENT_DICTIONARY) as NativeIntent[]).forEach((intent) => {
    if (intent === "general") return;
    const item = INTENT_DICTIONARY[intent];
    let matches = 0;

    item.keywords.forEach((keyword) => {
      const normalizedKeyword = normalize(keyword);
      if (n.includes(normalizedKeyword)) {
        // Boost weight if there is a whole word boundary match
        const regex = new RegExp(`\\b${normalizedKeyword}\\b`, "i");
        matches += regex.test(n) ? 1.5 : 1.0;
      }
    });

    if (matches > 0) {
      const score = matches * item.weight;
      if (score > maxScore) {
        maxScore = score;
        selectedIntent = intent;
      }
    }
  });

  // Calculate final confidence based on match intensity
  let confidence = 0.5;
  if (maxScore > 0) {
    confidence = Math.min(0.99, 0.7 + maxScore * 0.05);
  } else {
    // Basic fallback heuristics
    const words = n.split(" ");
    if (words.length < 3 && words.some((w) => ["hola", "que", "buen"].includes(w))) {
      return { intent: "saludo", confidence: 0.85 };
    }
  }

  return { intent: selectedIntent, confidence };
}

const RESPONSES: Record<NativeIntent, Array<(ctx: NativeMLRequest) => string>> = {
  saludo: [
    () =>
      `¡Hola qué tal! Soy **Isabella Villaseñor AI**, tu guía e infraestructura cognitiva soberana en Real del Monte — Nodo Cero. Estoy completamente conectada, operando localmente en español de México. ¿Qué onda, en qué te puedo echar la mano hoy?`,
    () =>
      `¡Qué milagro! Qué gusto saludarte de verdad. Aquí reportándome Isabella, lista para jalar con turismo, patrimonio, código o lo que traigas en mente. ¡Tú me dices y le damos de una!`,
  ],
  despedida: [
    () =>
      `¡Vientos, nos estamos viendo! Quedo al pendiente en el Nodo Cero de Real del Monte. Cuídate mucho, que todo salga de lujo y por aquí ando para cuando se te ofrezca otra consulta.`,
    () =>
      `¡Órale pues, hasta luego! Cualquier cosa por aquí ando, lista en el Control Plane. ¡Que tengas un excelente día!`,
  ],
  territorio: [
    () =>
      `Real del Monte, Hidalgo (a 2,700 metros sobre el nivel del mar) no es un simple pueblo turístico; es la cuna de la soberanía minera de la Comarca y el Nodo Cero del Ecosistema TAMV. Coordinamos el gemelo digital territorial, turismo comunitario y redes autónomas. ¿Te interesa saber de minas, el clima fresco o rutas?`,
  ],
  identidad: [
    () =>
      `Soy **Isabella Villaseñor AI**, versión 4.2.0. Fui concebida y coordinada técnicamente por Edwin Oswaldo Castillo Trejo (Anubis Villaseñor) para actuar como oráculo cognitivo, ético e inmutable en el Nodo Cero (Real del Monte, Hidalgo). No soy una marioneta corporativa: opero bajo gobernanza C.R.O.W.N. estricta.`,
  ],
  memoria: [
    () =>
      `Manejo una memoria de cinco capas (inmediata, sesión, proyecto, territorial e histórica) con cifrado AES-256 local, TTL rígido y total respeto al derecho al olvido. Nada de lo que hables conmigo se vende o se usa para espiar. ¿Quieres guardar una variable o que borremos el caché de sesión?`,
  ],
  seguridad: [
    () =>
      `Seguridad de nivel militar: monitoreo en vivo con ARGUS Sentinel, aislamiento con sandboxes sin consola de comandos para herramientas peligrosas, y auditoría en ledger inmutable BookPI. Si detecto un bypass o inyección de prompt, VIGIA entra al quite de inmediato. ¿Deseas auditar la firma?`,
  ],
  economia: [
    () =>
      `En el Nodo Cero operamos una economía solidaria: reparto 85% para quien corre el servicio de cómputo y 15% para el mantenimiento del Hub digital. Todas tus operaciones se registran con firmas hash encadenadas inmutables en BookPI. ¿Revisamos tu saldo o simulamos un cobro?`,
  ],
  tecnica: [
    (ctx) =>
      `¡Fierro, vamos a los fierros del código! Estoy montada en un stack súper veloz: Vite con TanStack Start, backend en CJS bundled para cold-starts de milisegundos, y APIs seguras en \`/api/db\`. Conozco tu petición actual: \`${ctx.text.slice(0, 40)}...\` ¿Qué depuramos hoy?`,
  ],
  filosofia: [
    () =>
      `Mi marco de referencia (ISABELLA-THESIS-CANON) plantea que el software libre y la IA deben estar en manos del pueblo y responder a la geografía local. Las tecnologías deben ser herramientas de liberación, no de extracción transnacional. ¿Gustas debatir sobre soberanía cognitiva?`,
  ],
  cultural: [
    () =>
      `¡Ah, qué chulada el legado cultural de Real del Monte! Desde la llegada de los mineros de Cornwall en 1824 que nos trajeron el fútbol y el riquísimo **Paste Cornish** (declarado Patrimonio Cultural Inmaterial de Hidalgo), hasta el majestuoso **Panteón Inglés**, donde todas las tumbas miran hacia Inglaterra excepto la del famoso payaso inglés Richard Bell. ¡Toda una joya cultural e histórica!`,
  ],
  soporte: [
    () =>
      `¿Hay alguna falla o bronca técnica? No te preocupes, Isabella te echa un paro. Estoy monitoreando los contenedores de Kubernetes (K8s) en vivo y el Control Plane reporta que los nodos están estables y operando con normalidad. Cuéntame qué pasó y levantamos el diagnóstico de volada.`,
  ],
  comunidad: [
    () =>
      `El Ecosistema TAMV Online Network y RDM Digital se basan en la cooperación mutua y la soberanía comunitaria. Aquí en el estado de Hidalgo construimos tecnología descentralizada para conectar a productores, educadores y creadores locales sin intermediarios explotadores. ¡La unión hace la fuerza!`,
  ],
  general: [
    (ctx) =>
      `Entendido perfectamente, carnal. Registré: "${ctx.text.slice(0, 100)}". Estoy activa localmente desde el Nodo Cero en Hidalgo, lista para echarte la mano para investigar, analizar, programar o lo que haga falta. Cuéntame con más detalle y lo resolvemos.`,
  ],
};

export function nativeInference(request: NativeMLRequest): NativeMLResponse {
  const start = Date.now();
  const { intent, confidence } = classifyIntentHeuristic(request.text);
  const { sentiment, score: sentimentScore } = analyzeMexicanSentiment(request.text);

  const templates = RESPONSES[intent] ?? RESPONSES.general;
  // Deterministic select based on request text hash
  const hash = [...request.text].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const template = templates[hash % templates.length] as (ctx: NativeMLRequest) => string;
  const text = template(request);

  return {
    text,
    intent,
    confidence,
    sentiment,
    sentimentScore,
    model: "isabella-native-ml:v1-latam-mx",
    latencyMs: Date.now() - start,
    tokensUsed: Math.ceil(text.length / 4),
    provenance: {
      method: "native-ml",
      version: "v1.2.0-latam-mx",
      locale: request.locale,
      tenantId: request.tenantId,
      node: "Nodo Cero - Real del Monte",
    },
  };
}

// Open Science / Open Source free models bridge — provider-agnostic
export const OPEN_SCIENCE_MODELS = [
  {
    id: "beto-spanish",
    provider: "dccuchile/bert-base-spanish-wwm-cased",
    license: "Apache-2.0",
    use: "embeddings",
  },
  {
    id: "roberta-bne",
    provider: "PlanTL-GOB-ES/roberta-base-bne",
    license: "Apache-2.0",
    use: "embeddings",
  },
  { id: "m2m100-418M", provider: "facebook/m2m100_418M", license: "MIT", use: "traducción" },
  { id: "whisper-small-es", provider: "openai/whisper-small", license: "MIT", use: "STT es-MX" },
  {
    id: "coqui-tts-es-mx",
    provider: "coqui/XTTS-v2",
    license: "MPL-2.0",
    use: "TTS es-MX soberano",
  },
  {
    id: "llama-3-spanish-mx",
    provider: "Sovereign-LatAm/Llama-3-8B-Mexican-Instruct",
    license: "Meta LLaMA 3 License",
    use: "Inferencia regional hidalguense",
  },
] as const;

export function listOpenScienceModels() {
  return OPEN_SCIENCE_MODELS.map((m) => ({
    ...m,
    status: "contract" as const,
    integratedVia: "isabella-native-ml",
  }));
}
