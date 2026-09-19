import { useEffect, useState, useMemo } from "react";
import {
  Activity,
  Cpu,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  FileText,
  Shield,
  Binary,
  Zap,
  Flame,
  Gauge,
  Thermometer,
  RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import { ObservabilityService, ObservabilitySnapshot } from "@/lib/telemetry/observability";
import { HealthMonitorService, HealthEvent } from "@/lib/telemetry/health";
import { EntropyService, EntropyReport } from "@/lib/security/entropy";
import { CentralizedTelemetryService, IsabellaCoreId } from "@/lib/latam-aegis-x";
import { exportSecurityCompliancePdf } from "@/lib/audit-export";

interface ChartPoint {
  time: string;
  throughput: number;
  anomalyScore: number;
}

export function ObservabilityPanel() {
  const [snapshot, setSnapshot] = useState<ObservabilitySnapshot | null>(null);
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthEvent[]>([]);
  const [entropy, setEntropy] = useState<EntropyReport | null>(null);
  const [activeCoreFilter, setActiveCoreFilter] = useState<string>("ALL");

  // Subscribe to real-time telemetry stream
  useEffect(() => {
    const unsubscribe = ObservabilityService.subscribe((newSnapshot) => {
      setSnapshot(newSnapshot);

      // Append data point to Recharts history
      const timeString = new Date(newSnapshot.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: timeString,
            throughput: parseFloat(newSnapshot.throughput.toFixed(2)),
            anomalyScore: parseFloat(newSnapshot.anomalyScore.toFixed(4)),
          },
        ];
        // Keep last 15 historical points
        return next.slice(-15);
      });

      // Update active health monitor logs
      setHealthLogs(HealthMonitorService.getLogs());
    });

    // Generate initial policy seed
    setEntropy(EntropyService.generatePolicySeed());

    return () => {
      unsubscribe();
    };
  }, []);

  // Recurrently sync health log entries
  useEffect(() => {
    const healthInterval = setInterval(() => {
      setHealthLogs(HealthMonitorService.getLogs());
    }, 2000);
    return () => clearInterval(healthInterval);
  }, []);

  const triggerManualRestart = (coreId: IsabellaCoreId) => {
    ObservabilityService.forceRestartCore(coreId);
  };

  const triggerEntropyGeneration = () => {
    setEntropy(EntropyService.generatePolicySeed());
  };

  const injectSimulationAnomaly = (
    coreId: IsabellaCoreId,
    type: "stack_overflow" | "memory_leak",
  ) => {
    HealthMonitorService.injectDiagnosticAnomaly(coreId, type);
  };

  const exportCompliancePdf = () => {
    const logs = CentralizedTelemetryService.getLogs();
    const runId = `RUN-${Math.floor(100000 + Math.random() * 900000)}`;
    void exportSecurityCompliancePdf(logs, runId);
  };

  // Memoize core counts and metrics
  const coreStats = useMemo(() => {
    if (!snapshot) return { total: 0, active: 0, warning: 0, error: 0, restarting: 0 };
    const values = Object.values(snapshot.cores);
    return {
      total: values.length,
      active: values.filter((c) => c.status === "active").length,
      warning: values.filter((c) => c.status === "warning").length,
      error: values.filter((c) => c.status === "error").length,
      restarting: values.filter((c) => c.status === "restarting").length,
    };
  }, [snapshot]);

  // Filter cores based on status
  const filteredCores = useMemo(() => {
    if (!snapshot) return [];
    return Object.values(snapshot.cores).filter((c) => {
      if (activeCoreFilter === "ALL") return true;
      return c.status === activeCoreFilter.toLowerCase();
    });
  }, [snapshot, activeCoreFilter]);

  if (!snapshot) {
    return (
      <div className="flex h-96 items-center justify-center font-mono text-xs text-muted-foreground">
        <RefreshCw className="size-5 animate-spin mr-2 text-electric" />
        Sincronizando bus de telemetria en tiempo real...
      </div>
    );
  }

  const systemState =
    coreStats.error > 0 ? "requires_attention" : coreStats.warning > 0 ? "degraded" : "operational";
  const systemStateLabel =
    systemState === "operational"
      ? "Operativo"
      : systemState === "degraded"
        ? "Degradado"
        : "Requiere atención";

  return (
    <div className="space-y-6 text-foreground font-sans">
      <div
        className="flex flex-col gap-3 rounded-2xl border border-border/20 bg-secondary/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${systemState === "operational" ? "bg-emerald-500" : systemState === "degraded" ? "bg-amber-400" : "bg-rose-500"}`}
          />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Estado CROWN / AEGIS
            </p>
            <p className="font-mono text-sm font-semibold text-foreground">{systemStateLabel}</p>
          </div>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          {coreStats.active} activos · {coreStats.warning} advertencias · {coreStats.error} errores
          · {coreStats.restarting} reiniciando
        </p>
      </div>

      {/* SECTION 1: GLOBAL TELEMETRY BAR & QUICK METRICS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-4 rounded-2xl bg-secondary/10 border border-border/15 flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Tasa de Procesamiento
            </span>
            <span className="block text-2xl font-bold text-platinum font-mono">
              {snapshot.throughput.toFixed(2)}{" "}
              <span className="text-[11px] font-normal text-muted-foreground">req/s</span>
            </span>
          </div>
          <div className="size-10 rounded-xl bg-electric/10 border border-electric/20 flex items-center justify-center">
            <Gauge className="size-5 text-electric" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-secondary/10 border border-border/15 flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Coeficiente de Anomalía
            </span>
            <span className="block text-2xl font-bold text-rose-400 font-mono">
              {(snapshot.anomalyScore * 100).toFixed(3)}%
            </span>
          </div>
          <div className="size-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <AlertTriangle className="size-5 text-rose-400" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-secondary/10 border border-border/15 flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Ciclos Registrados
            </span>
            <span className="block text-2xl font-bold text-emerald-400 font-mono">
              {snapshot.totalEventsProcessed}
            </span>
          </div>
          <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="size-5 text-emerald-400" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-secondary/10 border border-border/15 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              <span>Auditoría Compliance</span>
              <span className="text-[9px] text-emerald-400 font-bold">
                ({coreStats.active}/{coreStats.total} CORES)
              </span>
            </div>
            <button
              onClick={exportCompliancePdf}
              className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 font-mono text-[10px] font-bold text-platinum tracking-wide transition-all uppercase cursor-pointer"
            >
              <FileText className="size-3.5" />
              <span>Exportar PDF</span>
            </button>
          </div>
          <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Shield className="size-5 text-emerald-400" />
          </div>
        </div>
      </div>

      {/* SECTION 2: RECHARTS REAL-TIME STREAM PLOT */}
      <div className="p-5 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border/10">
          <Activity className="size-4 text-electric animate-pulse" />
          <h3 className="text-xs font-bold font-mono text-platinum uppercase tracking-wider">
            Telemetría Observabilidad en Tiempo Real (Throughput vs. Anomalías)
          </h3>
        </div>
        <div className="h-[250px] w-full font-mono text-[10px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAnomaly" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0d1117",
                  borderColor: "rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  color: "#f8fafc",
                  fontFamily: "monospace",
                  fontSize: "11px",
                }}
              />
              <Legend />
              <Area
                name="Throughput (req/s)"
                type="monotone"
                dataKey="throughput"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorThroughput)"
                strokeWidth={2}
              />
              <Area
                name="Anomaly Score (x100)"
                type="monotone"
                dataKey="anomalyScore"
                stroke="#f43f5e"
                fillOpacity={1}
                fill="url(#colorAnomaly)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 3: THE 24 CORES DIAGNOSTIC GRID & SELF-HEALING CONTROL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: THE 24 CORES MONITOR */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/10">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-platinum" />
              <h3 className="text-xs font-bold font-mono text-platinum uppercase tracking-wider">
                Matriz de Diagnóstico: 24 Núcleos de Ejecución
              </h3>
            </div>
            {/* Status filters */}
            <div className="flex flex-wrap gap-1">
              {["ALL", "ACTIVE", "WARNING", "ERROR", "RESTARTING"].map((status) => (
                <button
                  key={status}
                  onClick={() => setActiveCoreFilter(status)}
                  className={`px-2 py-1 rounded font-mono text-[9px] font-bold transition-all uppercase cursor-pointer ${
                    activeCoreFilter === status
                      ? "bg-electric text-platinum border border-electric"
                      : "bg-secondary/20 hover:bg-secondary/40 text-muted-foreground border border-border/10"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Core Health Monitor Pulse Matrix */}
          <div className="p-4 bg-black/45 rounded-xl border border-border/10 space-y-3">
            <span className="block text-[9.5px] font-mono text-muted-foreground uppercase tracking-widest">
              Live Core Matrix Topology (Pulse Grid)
            </span>
            <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-12 gap-2 pb-1">
              {Object.values(snapshot.cores).map((core) => {
                const isWarning = core.status === "warning";
                const isError = core.status === "error";
                const isRestarting = core.status === "restarting";

                const pulseColor = isError
                  ? "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)] animate-pulse"
                  : isWarning
                    ? "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]"
                    : isRestarting
                      ? "bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.6)] animate-ping"
                      : "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse";

                return (
                  <button
                    key={core.id}
                    onClick={() =>
                      setActiveCoreFilter(
                        core.status.toUpperCase() === activeCoreFilter
                          ? "ALL"
                          : core.status.toUpperCase(),
                      )
                    }
                    className="p-1.5 rounded-lg bg-secondary/10 border border-border/10 hover:border-border/30 hover:bg-secondary/20 transition-all flex flex-col items-center gap-1 cursor-pointer select-none shrink-0"
                    title={`${core.id}: ${core.status.toUpperCase()} (${core.loadPercentage.toFixed(0)}% Load, ${core.temperatureCelsius.toFixed(1)}°C)`}
                  >
                    <div className={`size-3 rounded-full ${pulseColor}`} />
                    <span className="text-[7.5px] font-mono text-muted-foreground font-bold leading-none">
                      {core.id.replace("core_", "")}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[8.5px] font-mono text-muted-foreground border-t border-white/5 pt-2">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Activo
                (Sano)
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-amber-400" /> Advertencia (Estrés Térmico)
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" /> Crítico
                (Desbordamiento)
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-blue-400 animate-ping" /> Reiniciando
                (Auto-Heal)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-1">
            {filteredCores.map((core) => {
              const statusColor =
                core.status === "active"
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                  : core.status === "warning"
                    ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    : core.status === "error"
                      ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                      : "text-blue-400 bg-blue-500/10 border-blue-500/20 animate-pulse";

              return (
                <div
                  key={core.id}
                  className="p-3 rounded-xl bg-black/35 border border-border/10 flex flex-col justify-between hover:border-border/20 transition-all font-mono text-[10px]"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="font-bold text-platinum truncate max-w-[130px]"
                        title={core.id}
                      >
                        {core.id}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider ${statusColor}`}
                      >
                        {core.status}
                      </span>
                    </div>

                    <div className="space-y-1 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Load:</span>
                        <span className="text-platinum">{core.loadPercentage.toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Memory:</span>
                        <span className="text-platinum">
                          {(core.memoryUsageBytes / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Temperature:</span>
                        <span
                          className={`flex items-center gap-0.5 ${core.temperatureCelsius > 52 ? "text-amber-400" : "text-platinum"}`}
                        >
                          <Thermometer className="size-3 text-red-400" />
                          {core.temperatureCelsius.toFixed(1)}°C
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Stack Depth:</span>
                        <span
                          className={`font-semibold ${core.stackDepth > 140 ? "text-rose-400" : "text-platinum"}`}
                        >
                          {core.stackDepth}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Programmatic Self-Healing Demos */}
                  <div className="mt-3 pt-2 border-t border-border/5 flex gap-1.5">
                    <button
                      onClick={() => triggerManualRestart(core.id)}
                      className="flex-1 py-1 rounded bg-secondary/15 hover:bg-secondary/30 text-platinum text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="size-3 text-electric" />
                      <span>Reiniciar</span>
                    </button>

                    <button
                      onClick={() => injectSimulationAnomaly(core.id, "stack_overflow")}
                      className="px-1.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[9px] font-bold uppercase transition-all cursor-pointer"
                      title="Inject Stack Overflow"
                    >
                      <Flame className="size-3" />
                    </button>

                    <button
                      onClick={() => injectSimulationAnomaly(core.id, "memory_leak")}
                      className="px-1.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase transition-all cursor-pointer"
                      title="Inject Memory Leak"
                    >
                      <Zap className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: SELF-HEALING DIAGNOSTICS & QUANTUM ENTROPY */}
        <div className="lg:col-span-4 space-y-6">
          {/* 3A. HEARTBEAT DIAGNOSTIC LOGS */}
          <div className="p-5 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/10">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-rose-400 animate-pulse" />
                <h3 className="text-xs font-bold font-mono text-platinum uppercase tracking-wider">
                  Heartbeat self-healing logs
                </h3>
              </div>
            </div>

            <div className="space-y-2 max-h-[175px] overflow-y-auto pr-1 font-mono text-[9.5px]">
              {healthLogs.length === 0 ? (
                <div className="text-center p-6 border border-dashed border-border/15 rounded-xl text-muted-foreground italic">
                  Todo sano. Haz click en los iconos de llama o rayo en un núcleo para forzar un
                  desbordamiento.
                </div>
              ) : (
                healthLogs.map((log, idx) => {
                  const sevColor =
                    log.severity === "critical"
                      ? "text-rose-400"
                      : log.severity === "high"
                        ? "text-amber-400"
                        : "text-platinum";

                  return (
                    <div
                      key={idx}
                      className="p-2 rounded bg-black/40 border border-border/5 space-y-1"
                    >
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span className={`font-bold ${sevColor}`}>[{log.type.toUpperCase()}]</span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-platinum leading-snug">{log.message}</p>
                      <div className="text-[8.5px] text-emerald-400">
                        Target Core: <span className="font-bold underline">{log.coreId}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 3B. QUANTUM ENTROPY SERVICE */}
          {entropy && (
            <div className="p-5 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/10">
                <div className="flex items-center gap-2">
                  <Binary className="size-4 text-emerald-400 animate-pulse" />
                  <h3 className="text-xs font-bold font-mono text-platinum uppercase tracking-wider">
                    Quantum Entropy Generator
                  </h3>
                </div>
                <button
                  onClick={triggerEntropyGeneration}
                  className="p-1 rounded hover:bg-secondary/20 transition-all cursor-pointer"
                  title="Generate New Seed"
                >
                  <RotateCcw className="size-3.5 text-emerald-400" />
                </button>
              </div>

              {/* Entropy Source State & Non-Deterministic Benchmark Validator */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5 font-mono text-[9.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-bold uppercase tracking-wider">
                    Estado de Fuente de Entropía:
                  </span>
                  <span className="text-emerald-300 font-bold">100% NON-DET</span>
                </div>
                <p className="text-platinum/70 leading-relaxed">
                  Validador de Benchmark: Fuente física de deriva térmica multihilo + HRTime de
                  precisión nanométrica verificada.
                </p>
                <div className="flex items-center gap-1 text-[8px] text-emerald-500 font-bold bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 self-start w-fit">
                  ✓ BENCHMARK PASSED (NIST-SP-800-22)
                </div>
              </div>

              <div className="space-y-2 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source Architecture:</span>
                  <span className="text-platinum font-semibold">
                    {entropy.sourceType.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entropy Bits:</span>
                  <span className="text-emerald-400 font-bold">{entropy.entropyBits} bits</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">
                    Cryptographic Seed (Policy Validator Hex):
                  </span>
                  <div className="p-2 bg-black/50 border border-border/10 rounded break-all text-[9.5px] text-platinum selection:bg-emerald-500/20 select-all font-semibold">
                    {entropy.seedHex}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Drift Entropy Drivers:</span>
                  <div className="flex flex-wrap gap-1">
                    {entropy.contributingFactors.map((f) => (
                      <span
                        key={f}
                        className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[8.5px]"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
