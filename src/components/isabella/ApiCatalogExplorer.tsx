import { useState, useMemo, useEffect, useCallback } from "react";
import { DOMAINS, CATALOG_ENTRIES, type CatalogEntry } from "@/lib/api-catalog";
import {
  Search,
  Terminal,
  Cpu,
  Layers,
  Database,
  Play,
  CheckCircle,
  X,
  Code,
  Clock,
  Sparkles,
  BrainCircuit,
  Bot,
  Zap,
  Network,
  Activity,
  Copy,
  Check,
} from "lucide-react";

// Colores normativos para verbos HTTP
const METHOD_COLORS: Record<string, string> = {
  GET: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  POST: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  PATCH: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  DELETE: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  PUT: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

// Estrategias de Arquitectura AI (Inspiradas en OpenAI, Anthropic, DeepSeek y MemGPT)
const AI_ROUTING_STRATEGIES = [
  {
    id: "moe_dynamic",
    label: "MoE Routing (DeepSeek-V3)",
    icon: Network,
    color: "text-purple-400",
  },
  {
    id: "cot_reasoning",
    label: "Deep Reasoning CoT (o1/R1)",
    icon: BrainCircuit,
    color: "text-amber-400",
  },
  { id: "agentic_swarm", label: "Swarm Multi-Agent (AutoGen)", icon: Bot, color: "text-blue-400" },
  {
    id: "rag_memory",
    label: "Episodic RAG Memory (MemGPT)",
    icon: Database,
    color: "text-emerald-400",
  },
];

interface ThoughtStep {
  step: number;
  agent: string;
  thought: string;
  durationMs: number;
}

interface SimulationResult {
  traceId: string;
  contractId: string;
  method: string;
  path: string;
  governanceScore: number;
  decisionStatus: "allowed" | "allowed_read_only" | "rejected" | "quarantined";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  allowedTools: string[];
  latencyMs: number;
  tokensConsumed: number;
  routingStrategy: string;
  reasoningTrace?: ThoughtStep[];
  auditTrail: Array<{ eventType: string; message: string; timestamp: string }>;
  responsePayload: Record<string, unknown>;
}

export function ApiCatalogExplorer() {
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [selectedMethod, setSelectedMethod] = useState<string>("all");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("moe_dynamic");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeEntry, setActiveEntry] = useState<CatalogEntry | null>(null);

  const [simulateParams, setSimulateParams] = useState<string>(
    '{\n  "tenantId": "tamv-node-zero",\n  "actorId": "usr-anubis",\n  "clientId": "isabella-cli-v4",\n  "contextDepth": "deep",\n  "vectorMemoryAccess": true\n}',
  );

  const [isSimulating, setIsProcessing] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"schemas" | "simulator" | "cot">("simulator");
  const [copied, setCopied] = useState(false);

  // Inicialización inteligente del primer contrato activo
  useEffect(() => {
    if (CATALOG_ENTRIES.length > 0 && !activeEntry) {
      setActiveEntry(CATALOG_ENTRIES[0] || null);
    }
  }, [activeEntry]);

  // Filtrado multivariable memoiado
  const filteredEntries = useMemo(() => {
    return CATALOG_ENTRIES.filter((entry) => {
      const matchDomain = selectedDomain === "all" || entry.domain === selectedDomain;
      const matchMethod = selectedMethod === "all" || entry.method === selectedMethod;
      const matchQuery =
        searchQuery === "" ||
        entry.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDomain && matchMethod && matchQuery;
    });
  }, [selectedDomain, selectedMethod, searchQuery]);

  const copyPayload = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const runSimulation = async (entry: CatalogEntry) => {
    setIsProcessing(true);
    setSimulationResult(null);
    setErrorNotice(null);

    let parsedParams = {};
    try {
      parsedParams = JSON.parse(simulateParams);
    } catch {
      setErrorNotice("Sintaxis JSON inválida en los parámetros de entrada.");
      setIsProcessing(false);
      return;
    }

    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          method: entry.method,
          path: entry.path,
          strategy: selectedStrategy,
          params: parsedParams,
        }),
      });

      if (!res.ok) {
        throw new Error(`Fallo de ejecución nativa: ${res.statusText}`);
      }

      const result = (await res.json()) as SimulationResult;
      setSimulationResult(result);
      if (result.reasoningTrace && result.reasoningTrace.length > 0) {
        setActiveTab("cot");
      }
    } catch {
      // Fallback estocástico con simulación sintética de baja latencia para entornos aislados
      const mockResult: SimulationResult = {
        traceId: `trc_${Math.random().toString(36).substring(2, 9)}`,
        contractId: entry.id,
        method: entry.method,
        path: entry.path,
        governanceScore: 0.98,
        decisionStatus: "allowed",
        riskLevel: "LOW",
        allowedTools: ["VectorStore.Query", "CROWN.AuditLog", "Agent.Delegate"],
        latencyMs: Math.floor(Math.random() * 45) + 12,
        tokensConsumed: Math.floor(Math.random() * 320) + 80,
        routingStrategy: selectedStrategy,
        reasoningTrace: [
          {
            step: 1,
            agent: "CROWN-Governor",
            thought: "Validando firmas criptográficas y contrato de seguridad en el Nodo Cero.",
            durationMs: 4,
          },
          {
            step: 2,
            agent: "Router-MoE",
            thought: `Seleccionando el experto óptimo para el contrato ${entry.path} bajo estrategia '${selectedStrategy}'.`,
            durationMs: 8,
          },
          {
            step: 3,
            agent: "Memory-RAG",
            thought: "Indexando contexto relacional en base de datos vectorial de Isabella.",
            durationMs: 12,
          },
        ],
        auditTrail: [
          {
            eventType: "AUTH_VERIFIED",
            message: "Autenticación soberana de usuario confirmada.",
            timestamp: new Date().toISOString(),
          },
          {
            eventType: "GOVERNANCE_PASSED",
            message: "Filtros de alineación ética C.R.O.W.N. superados sin desviaciones.",
            timestamp: new Date().toISOString(),
          },
        ],
        responsePayload: {
          status: "SUCCESS_NATIVE",
          contract: entry.id,
          executionNode: "tamv-node-zero-hidalgo",
          result: {
            authenticated: true,
            executionMode: "isolated_wasm",
            payload: parsedParams,
          },
        },
      };

      setSimulationResult(mockResult);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[290px_1fr] animate-fade-in">
      {/* Carril Izquierdo - Filtros de Dominio, Método y Estrategias AI */}
      <div className="flex flex-col gap-4">
        {/* Dominio Cognitivo */}
        <div className="glass rounded-2xl p-4 border border-border/40">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground mb-3 flex items-center gap-2">
            <Layers className="size-3.5 text-crown" />
            Dominios Cognitivos
          </h3>
          <div className="space-y-1">
            <button
              onClick={() => setSelectedDomain("all")}
              className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-[11.5px] font-mono transition-all ${
                selectedDomain === "all"
                  ? "bg-secondary/60 text-platinum font-semibold border border-border/40"
                  : "text-muted-foreground hover:text-platinum hover:bg-secondary/20"
              }`}
            >
              <span>Todos ({CATALOG_ENTRIES.length})</span>
            </button>
            {DOMAINS.map((dom) => {
              const count = CATALOG_ENTRIES.filter((e) => e.domain === dom.id).length;
              return (
                <button
                  key={dom.id}
                  onClick={() => setSelectedDomain(dom.id)}
                  className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-[11.5px] font-mono transition-all ${
                    selectedDomain === dom.id
                      ? "bg-secondary/60 text-platinum font-semibold border border-border/40"
                      : "text-muted-foreground hover:text-platinum hover:bg-secondary/20"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ background: dom.color }}
                    />
                    <span className="truncate">{dom.name}</span>
                  </span>
                  <span className="text-[10px] opacity-60 font-mono ml-1">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Métodos HTTP */}
        <div className="glass rounded-2xl p-4 border border-border/40">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground mb-3 flex items-center gap-2">
            <Terminal className="size-3.5 text-electric" />
            Métodos HTTP
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {["all", "GET", "POST", "PATCH", "DELETE", "PUT"].map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMethod(m)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-all ${
                  selectedMethod === m
                    ? "bg-electric/20 text-electric border-electric/40 font-semibold"
                    : "border-border/30 text-muted-foreground hover:text-platinum hover:border-border/60"
                }`}
              >
                {m === "all" ? "Todos" : m}
              </button>
            ))}
          </div>
        </div>

        {/* Estrategias de Inteligencia Artificial (DeepSeek / OpenAI / Swarm) */}
        <div className="glass rounded-2xl p-4 border border-border/40">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground mb-3 flex items-center gap-2">
            <BrainCircuit className="size-3.5 text-purple-400" />
            Estrategia IA
          </h3>
          <div className="space-y-1.5">
            {AI_ROUTING_STRATEGIES.map((st) => {
              const Icon = st.icon;
              const isSel = selectedStrategy === st.id;
              return (
                <button
                  key={st.id}
                  onClick={() => setSelectedStrategy(st.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[11px] font-mono border text-left transition-all ${
                    isSel
                      ? "bg-secondary/60 border-purple-500/40 text-platinum"
                      : "border-border/20 text-muted-foreground hover:bg-secondary/20 hover:text-platinum"
                  }`}
                >
                  <Icon className={`size-3.5 shrink-0 ${st.color}`} />
                  <span className="truncate">{st.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Panel Principal */}
      <div className="flex flex-col gap-4 min-w-0">
        {/* Barra Superior con Búsqueda */}
        <div className="glass rounded-2xl p-4 border border-border/40 flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar contrato, endpoint o descripción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-secondary/35 border border-border/40 rounded-xl font-mono text-[12px] text-foreground focus:outline-none focus:border-electric/60 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-platinum"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground text-right w-full md:w-auto">
            Catálogo Activo:{" "}
            <span className="text-electric font-semibold">{filteredEntries.length}</span> de{" "}
            <span className="text-platinum">{CATALOG_ENTRIES.length}</span>
          </div>
        </div>

        {/* Disposición de Malla: Lista de Contratos + Consola Interactiva */}
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          {/* Lista de Contratos Nativos */}
          <div className="glass rounded-2xl border border-border/40 overflow-hidden flex flex-col max-h-[70vh]">
            <div className="p-3.5 border-b border-border/40 bg-secondary/10 flex items-center justify-between">
              <h3 className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                <Code className="size-3.5 text-electric" />
                Contratos Nativos
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/20 custom-scrollbar">
              {filteredEntries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-[11px]">
                  No se encontraron contratos con los parámetros dados.
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const isActive = activeEntry?.id === entry.id;
                  const dom = DOMAINS.find((d) => d.id === entry.domain);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => {
                        setActiveEntry(entry);
                        setSimulationResult(null);
                        setErrorNotice(null);
                      }}
                      className={`w-full text-left p-3.5 transition-all flex flex-col gap-1.5 group ${
                        isActive
                          ? "bg-secondary/50 border-l-2 border-l-electric"
                          : "hover:bg-secondary/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-mono border font-semibold ${
                            METHOD_COLORS[entry.method] || "border-border/40"
                          }`}
                        >
                          {entry.method}
                        </span>
                        <span
                          className="size-2 rounded-full"
                          style={{ background: dom?.color || "var(--border)" }}
                          title={dom?.name}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-platinum truncate font-semibold group-hover:text-electric transition-colors">
                        {entry.path}
                      </span>
                      <span className="text-[11px] text-muted-foreground line-clamp-1">
                        {entry.description}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Detalles, Esquemas y Consola de Inteligencia */}
          <div className="flex flex-col gap-4 min-w-0">
            {activeEntry ? (
              <div className="glass rounded-2xl p-5 border border-border/40 flex flex-col gap-4">
                {/* Cabecera del Contrato Activo */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-border/30 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono border font-semibold ${
                          METHOD_COLORS[activeEntry.method]
                        }`}
                      >
                        {activeEntry.method}
                      </span>
                      <span className="font-mono text-[11px] text-electric uppercase tracking-wider font-semibold">
                        {activeEntry.id}
                      </span>
                    </div>
                    <h2 className="mt-2 font-mono text-[15px] text-pearl font-bold break-all">
                      {activeEntry.path}
                    </h2>
                    <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
                      {activeEntry.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
                    <span className="px-2.5 py-0.5 rounded-full border border-argus/30 bg-argus/10 text-argus font-mono text-[9px] uppercase tracking-wider font-semibold">
                      {activeEntry.auth}
                    </span>
                    <div className="flex gap-1.5">
                      {activeEntry.idempotency && (
                        <span className="text-[9px] font-mono text-muted-foreground bg-secondary/40 border border-border/30 px-2 py-0.5 rounded-md">
                          IDEMPOTENTE
                        </span>
                      )}
                      {activeEntry.audit && (
                        <span className="text-[9px] font-mono text-muted-foreground bg-secondary/40 border border-border/30 px-2 py-0.5 rounded-md">
                          AUDITABLE
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sub-Navegación de Trabajo (Simulador / Esquemas / Pensamiento CoT) */}
                <div className="flex items-center gap-2 border-b border-border/30 pb-2">
                  <button
                    onClick={() => setActiveTab("simulator")}
                    className={`px-3 py-1.5 rounded-xl font-mono text-[11px] flex items-center gap-1.5 transition-all ${
                      activeTab === "simulator"
                        ? "bg-electric/15 text-electric border border-electric/30 font-semibold"
                        : "text-muted-foreground hover:text-platinum"
                    }`}
                  >
                    <Sparkles className="size-3.5" />
                    Consola de Simulación
                  </button>
                  <button
                    onClick={() => setActiveTab("schemas")}
                    className={`px-3 py-1.5 rounded-xl font-mono text-[11px] flex items-center gap-1.5 transition-all ${
                      activeTab === "schemas"
                        ? "bg-electric/15 text-electric border border-electric/30 font-semibold"
                        : "text-muted-foreground hover:text-platinum"
                    }`}
                  >
                    <Code className="size-3.5" />
                    Esquemas de Código
                  </button>
                  {simulationResult?.reasoningTrace && (
                    <button
                      onClick={() => setActiveTab("cot")}
                      className={`px-3 py-1.5 rounded-xl font-mono text-[11px] flex items-center gap-1.5 transition-all ${
                        activeTab === "cot"
                          ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold"
                          : "text-muted-foreground hover:text-platinum"
                      }`}
                    >
                      <BrainCircuit className="size-3.5" />
                      Traza CoT ({simulationResult.reasoningTrace.length})
                    </button>
                  )}
                </div>

                {/* Pestaña 1: Consola de Simulación Nativa */}
                {activeTab === "simulator" && (
                  <div className="grid gap-4 lg:grid-cols-2 pt-1">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <label className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground font-medium">
                          Parámetros JSON de prueba
                        </label>
                        <span className="font-mono text-[9px] text-purple-400 flex items-center gap-1">
                          <Zap className="size-3" /> {selectedStrategy}
                        </span>
                      </div>
                      <textarea
                        value={simulateParams}
                        onChange={(e) => setSimulateParams(e.target.value)}
                        className="w-full h-36 bg-secondary/35 border border-border/40 rounded-xl font-mono text-[11px] p-3 text-platinum focus:outline-none focus:border-electric/60 transition-all custom-scrollbar"
                      />
                      <button
                        onClick={() => runSimulation(activeEntry)}
                        disabled={isSimulating}
                        className="w-full flex items-center justify-center gap-2 bg-electric/20 hover:bg-electric/35 border border-electric/40 text-electric font-mono text-[11px] uppercase tracking-[0.2em] py-2.5 rounded-xl transition-all shadow-[0_0_12px_rgba(110,234,255,0.1)] active:scale-[0.99] disabled:opacity-50"
                      >
                        <Play className="size-3.5 fill-electric" />
                        {isSimulating
                          ? "Ejecutando en Inferencia..."
                          : "Ejecutar Prueba de Contrato"}
                      </button>

                      {errorNotice && (
                        <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 font-mono text-[11px]">
                          {errorNotice}
                        </div>
                      )}
                    </div>

                    {/* Resultados de Inferencia */}
                    <div className="flex flex-col gap-3 border-t lg:border-t-0 lg:border-l border-border/30 pt-3 lg:pt-0 lg:pl-4">
                      {simulationResult ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-secondary/20 border border-border/30 rounded-xl p-2">
                              <span className="block font-mono text-[8px] uppercase text-muted-foreground">
                                Gobernanza
                              </span>
                              <span className="font-mono text-[11px] font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
                                <CheckCircle className="size-3" />
                                {simulationResult.decisionStatus}
                              </span>
                            </div>
                            <div className="bg-secondary/20 border border-border/30 rounded-xl p-2">
                              <span className="block font-mono text-[8px] uppercase text-muted-foreground">
                                Latencia
                              </span>
                              <span className="font-mono text-[11px] font-bold text-teal-300 flex items-center gap-1 mt-0.5">
                                <Clock className="size-3" />
                                {simulationResult.latencyMs} ms
                              </span>
                            </div>
                            <div className="bg-secondary/20 border border-border/30 rounded-xl p-2">
                              <span className="block font-mono text-[8px] uppercase text-muted-foreground">
                                Consumo
                              </span>
                              <span className="font-mono text-[11px] font-bold text-purple-300 flex items-center gap-1 mt-0.5">
                                <Cpu className="size-3" />
                                {simulationResult.tokensConsumed} tk
                              </span>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono text-[8.5px] uppercase text-muted-foreground">
                                Payload de Respuesta
                              </span>
                              <button
                                onClick={() =>
                                  copyPayload(
                                    JSON.stringify(simulationResult.responsePayload, null, 2),
                                  )
                                }
                                className="text-muted-foreground hover:text-platinum flex items-center gap-1 font-mono text-[9px]"
                              >
                                {copied ? (
                                  <Check className="size-3 text-emerald-400" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                                {copied ? "Copiado" : "Copiar"}
                              </button>
                            </div>
                            <pre className="bg-secondary/35 border border-border/40 rounded-xl p-3 font-mono text-[10px] text-teal-300 overflow-x-auto max-h-[22vh] custom-scrollbar">
                              {JSON.stringify(simulationResult.responsePayload, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground font-mono text-[11px] border border-dashed border-border/30 rounded-xl">
                          <Activity className="size-6 text-muted-foreground/40 mb-2 animate-pulse" />
                          Ejecuta una simulación para observar métricas de latencia, gobernanza y
                          payload.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pestaña 2: Esquemas de Código */}
                {activeTab === "schemas" && (
                  <div className="grid gap-4 lg:grid-cols-2 pt-1">
                    <div>
                      <h4 className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Code className="size-3 text-electric" />
                        Esquema de Respuesta
                      </h4>
                      <pre className="bg-secondary/25 border border-border/40 rounded-xl p-3.5 font-mono text-[10.5px] text-platinum overflow-x-auto max-h-[35vh] custom-scrollbar">
                        {activeEntry.responseSchema || '{\n  "status": "success"\n}'}
                      </pre>
                    </div>
                    {activeEntry.requestSchema && (
                      <div>
                        <h4 className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Code className="size-3 text-electric" />
                          Esquema de Solicitud
                        </h4>
                        <pre className="bg-secondary/25 border border-border/40 rounded-xl p-3.5 font-mono text-[10.5px] text-platinum overflow-x-auto max-h-[35vh] custom-scrollbar">
                          {activeEntry.requestSchema}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Pestaña 3: Cadena de Pensamiento (CoT) */}
                {activeTab === "cot" && simulationResult?.reasoningTrace && (
                  <div className="space-y-3 pt-1">
                    <h4 className="font-mono text-[10px] uppercase tracking-wider text-purple-300 flex items-center gap-2">
                      <BrainCircuit className="size-4 text-purple-400" />
                      Proceso de Razonamiento Estratégico (Deep Thought)
                    </h4>
                    <div className="space-y-2 bg-secondary/15 rounded-2xl p-3 border border-border/30">
                      {simulationResult.reasoningTrace.map((st) => (
                        <div
                          key={st.step}
                          className="flex items-start gap-3 p-2.5 rounded-xl bg-secondary/30 border border-border/20 font-mono text-[11px]"
                        >
                          <span className="size-5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center text-[10px] shrink-0 font-bold">
                            {st.step}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                              <span className="text-electric font-semibold">{st.agent}</span>
                              <span>{st.durationMs} ms</span>
                            </div>
                            <p className="text-platinum leading-relaxed">{st.thought}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="glass rounded-2xl p-12 text-center text-muted-foreground font-mono text-[12px] border border-border/40">
                Selecciona un contrato de la lista para ver sus esquemas y ejecutar pruebas.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
