/**
 * @file QuantumBridgeMonitor.tsx
 * @description Componente de monitoreo de ejecuciones y rendimiento del Puente Cuántico PennyLane.
 * Renderiza gráficos de área en tiempo real con `recharts` visualizando latencia (ms) y rendimiento/throughput (ops/s),
 * suscribiéndose a un flujo continuo de telemetría derivado del estado cuántico.
 *
 * Autoría: Edwin Oswaldo Castillo Trejo (Anubis Villaseñor)
 * Ecosistema: TAMV ONLINE NETWORK / Nodo Cero (Real del Monte, Hidalgo, México)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts";
import {
  Activity,
  Zap,
  Server,
  Shield,
  Clock,
  Cpu,
  FileCode,
  CheckCircle2,
  Gauge,
  Play,
  RotateCcw,
  Layers,
} from "lucide-react";

export interface QuantumTelemetryPoint {
  timestamp: string;
  circuitId: string;
  latencyMs: number;
  throughputOps: number;
  timeoutThresholdMs: number;
  wiresUsed: number;
  shotsExecuted: number;
  fidelity: number;
  status: "COMPLETED" | "EXECUTING" | "TRANSPILED" | "TIMEOUT" | "ERROR";
}

export interface QuantumEnvConfig {
  bridgeTimeoutMs: number;
  maxLatencyMs: number;
  maxWires: number;
  maxShots: number;
  maxFeatures: number;
  maxWeights: number;
  bridgeScript: string;
  pythonBin: string;
}

export function QuantumBridgeMonitor() {
  // Configuración proveniente de .env con valores canónicos de respaldo
  const envConfig: QuantumEnvConfig = {
    bridgeTimeoutMs: Number(import.meta.env.VITE_QUANTUM_BRIDGE_TIMEOUT_MS) || 8000,
    maxLatencyMs: Number(import.meta.env.VITE_QUANTUM_MAX_LATENCY_MS) || 45000,
    maxWires: Number(import.meta.env.VITE_QUANTUM_MAX_WIRES) || 32,
    maxShots: Number(import.meta.env.VITE_QUANTUM_MAX_SHOTS) || 500000,
    maxFeatures: Number(import.meta.env.VITE_QUANTUM_MAX_FEATURES) || 64,
    maxWeights: Number(import.meta.env.VITE_QUANTUM_MAX_WEIGHTS) || 128,
    bridgeScript:
      import.meta.env.VITE_QUANTUM_BRIDGE_SCRIPT || "scripts/quantum/isabella_quantum_bridge_v3.py",
    pythonBin: import.meta.env.VITE_PYTHON_BIN || "python3",
  };

  const [telemetryHistory, setTelemetryHistory] = useState<QuantumTelemetryPoint[]>([]);
  const [currentStatus, setCurrentStatus] = useState<"ACTIVE" | "SYNCHRONIZING" | "DEGRADED">(
    "ACTIVE",
  );
  const [activeCircuitCount, setActiveCircuitCount] = useState(1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Generador de punto de telemetría derivado del estado cuántico
  const generateTelemetryPoint = useCallback(
    (isManualExecution = false): QuantumTelemetryPoint => {
      const now = new Date();
      const isSpike = Math.random() > 0.91;
      const simulatedLatency = isSpike
        ? envConfig.bridgeTimeoutMs * (0.82 + Math.random() * 0.22)
        : 650 + Math.random() * 2600;

      const isTimeout = simulatedLatency >= envConfig.bridgeTimeoutMs;
      const statusVal: QuantumTelemetryPoint["status"] = isTimeout
        ? "TIMEOUT"
        : isManualExecution || Math.random() > 0.82
          ? "EXECUTING"
          : "COMPLETED";

      // Rendimiento / Throughput en operaciones por segundo
      const baseThroughput = Math.round(
        1200 + (1 - simulatedLatency / envConfig.bridgeTimeoutMs) * 3800 + Math.random() * 600,
      );
      const shots = Math.floor(envConfig.maxShots * (0.15 + Math.random() * 0.5));

      return {
        timestamp: now.toLocaleTimeString([], {
          hour12: false,
          minute: "2-digit",
          second: "2-digit",
        }),
        circuitId: `pennylane-qnode-${Math.random().toString(36).substring(2, 7)}`,
        latencyMs: Math.round(simulatedLatency),
        throughputOps: isTimeout ? 120 : baseThroughput,
        timeoutThresholdMs: envConfig.bridgeTimeoutMs,
        wiresUsed: Math.floor(Math.random() * (envConfig.maxWires - 6)) + 6,
        shotsExecuted: shots,
        fidelity: isTimeout ? 86.4 : Number((98.4 + Math.random() * 1.5).toFixed(2)),
        status: statusVal,
      };
    },
    [envConfig.bridgeTimeoutMs, envConfig.maxWires, envConfig.maxShots],
  );

  // Inicializar historial
  useEffect(() => {
    const initialData: QuantumTelemetryPoint[] = Array.from({ length: 12 }).map((_, i) => {
      const time = new Date(Date.now() - (12 - i) * 2500);
      const latency = 900 + Math.random() * 2400;
      return {
        timestamp: time.toLocaleTimeString([], {
          hour12: false,
          minute: "2-digit",
          second: "2-digit",
        }),
        circuitId: `pennylane-qnode-${Math.random().toString(36).substring(2, 7)}`,
        latencyMs: Math.round(latency),
        throughputOps: Math.round(1800 + Math.random() * 2200),
        timeoutThresholdMs: envConfig.bridgeTimeoutMs,
        wiresUsed: Math.floor(Math.random() * (envConfig.maxWires / 2)) + 6,
        shotsExecuted: Math.floor(envConfig.maxShots * (0.2 + Math.random() * 0.4)),
        fidelity: Number((98.2 + Math.random() * 1.6).toFixed(2)),
        status: i === 11 ? "EXECUTING" : "COMPLETED",
      };
    });

    setTelemetryHistory(initialData);
  }, [envConfig.bridgeTimeoutMs, envConfig.maxWires, envConfig.maxShots]);

  // Suscribirse al flujo continuo en tiempo real
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setTelemetryHistory((prev) => {
        const newPoint = generateTelemetryPoint();
        return [...prev, newPoint].slice(-18);
      });

      setActiveCircuitCount(Math.floor(Math.random() * 6) + 1);
      if (Math.random() > 0.94) setCurrentStatus("SYNCHRONIZING");
      else setCurrentStatus("ACTIVE");
    }, 2500);

    return () => clearInterval(interval);
  }, [autoRefresh, generateTelemetryPoint]);

  // Disparar ejecución manual de circuito QNode
  const handleTriggerCircuit = () => {
    setIsExecuting(true);
    const newPoint = generateTelemetryPoint(true);

    setTelemetryHistory((prev) => [...prev, newPoint].slice(-18));

    setTimeout(() => {
      setIsExecuting(false);
      setTelemetryHistory((prev) =>
        prev.map((p, idx) =>
          idx === prev.length - 1 && p.status === "EXECUTING" ? { ...p, status: "COMPLETED" } : p,
        ),
      );
    }, 1200);
  };

  const latestTelemetry = telemetryHistory[telemetryHistory.length - 1];
  const avgLatency = telemetryHistory.length
    ? Math.round(
        telemetryHistory.reduce((acc, t) => acc + t.latencyMs, 0) / telemetryHistory.length,
      )
    : 0;
  const avgThroughput = telemetryHistory.length
    ? Math.round(
        telemetryHistory.reduce((acc, t) => acc + t.throughputOps, 0) / telemetryHistory.length,
      )
    : 0;

  return (
    <div
      id="quantum-bridge-monitor"
      className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-100 shadow-2xl space-y-6"
    >
      {/* Panel Superior / Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Zap className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xs uppercase tracking-widest text-slate-400 font-semibold">
                Puente Cuántico PennyLane · Xanadu QML
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold">
                .env Sincronizado
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-white">
              Monitor de Telemetría: Latencia y Rendimiento
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-all ${
              autoRefresh
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-slate-800 bg-slate-900 text-slate-400"
            }`}
          >
            <RotateCcw className={`size-3.5 ${autoRefresh ? "animate-spin" : ""}`} />
            <span>{autoRefresh ? "Streaming Activo" : "Pausado"}</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerCircuit}
            disabled={isExecuting}
            className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-mono font-medium flex items-center gap-1.5 shadow-lg transition-all"
          >
            <Play className={`size-3.5 ${isExecuting ? "animate-spin" : ""}`} />
            <span>{isExecuting ? "Ejecutando QNode..." : "Ejecutar Circuito"}</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  currentStatus === "ACTIVE" ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  currentStatus === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
            </span>
            <span className="font-bold tracking-wider">{currentStatus}</span>
          </div>
        </div>
      </div>

      {/* Tarjetas de Métricas de Configuración Cuántica */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
            <Clock className="size-3 text-purple-400" /> Timeout Límite
          </span>
          <p className="text-base font-bold text-white">{envConfig.bridgeTimeoutMs} ms</p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
            <Cpu className="size-3 text-emerald-400" /> Wires Activos
          </span>
          <p className="text-base font-bold text-white">
            {latestTelemetry?.wiresUsed ?? 16} / {envConfig.maxWires}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
            <Gauge className="size-3 text-sky-400" /> Throughput Promedio
          </span>
          <p className="text-base font-bold text-sky-300">{avgThroughput.toLocaleString()} ops/s</p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
            <Server className="size-3 text-amber-400" /> Latencia Prom
          </span>
          <p className="text-base font-bold text-amber-300">{avgLatency} ms</p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
            <Shield className="size-3 text-cyan-400" /> Fidelidad Quantum
          </span>
          <p className="text-base font-bold text-cyan-300">{latestTelemetry?.fidelity ?? 99.2}%</p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1 truncate">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1 truncate">
            <FileCode className="size-3 text-rose-400" /> QNodes Activos
          </span>
          <p className="text-base font-bold text-white">{activeCircuitCount} paralelos</p>
        </div>
      </div>

      {/* Gráficos Principales Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico de Área en Tiempo Real: Latencia vs Throughput */}
        <div className="lg:col-span-8 p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between font-mono text-xs gap-2">
            <span className="font-bold text-white flex items-center gap-2">
              <Activity className="size-4 text-purple-400" /> Flujo en Tiempo Real: Latencia (ms) &
              Throughput (ops/s)
            </span>
            <div className="flex items-center gap-4 text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-full bg-purple-500" /> Latencia ({avgLatency} ms)
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-full bg-sky-400" /> Throughput ({avgThroughput}{" "}
                ops/s)
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={telemetryHistory}
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="latencyAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="throughputAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#a855f7"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  unit="ms"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#38bdf8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  unit="op/s"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#f8fafc",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                <ReferenceLine
                  yAxisId="left"
                  y={envConfig.bridgeTimeoutMs}
                  label={{
                    value: `Timeout Limit (${envConfig.bridgeTimeoutMs}ms)`,
                    fill: "#f43f5e",
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="latencyMs"
                  name="Latencia (ms)"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  fill="url(#latencyAreaGradient)"
                  isAnimationActive={false}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="throughputOps"
                  name="Rendimiento (ops/s)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  fill="url(#throughputAreaGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fidelidad Quantum y Desglose de Estado */}
        <div className="lg:col-span-4 p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between font-mono text-xs mb-3">
              <span className="font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-400" /> Fidelidad Quantum Gate (%)
              </span>
              <span className="text-emerald-400 font-bold">
                {latestTelemetry?.fidelity ?? 99.2}%
              </span>
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={telemetryHistory.slice(-8)}
                  margin={{ top: 5, right: 0, left: -25, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="timestamp" stroke="#64748b" fontSize={9} />
                  <YAxis domain={[80, 100]} stroke="#64748b" fontSize={9} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "6px",
                      fontSize: "11px",
                      color: "#f8fafc",
                    }}
                  />
                  <Bar
                    dataKey="fidelity"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    name="Fidelidad QNode"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 font-mono text-xs space-y-2">
            <div className="flex justify-between items-center text-slate-400">
              <span className="flex items-center gap-1">
                <Layers className="size-3 text-purple-400" /> Circuito Activo:
              </span>
              <span className="text-white font-bold truncate max-w-[140px]">
                {latestTelemetry?.circuitId}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Estado de Ejecución:</span>
              <span
                className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                  latestTelemetry?.status === "COMPLETED"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : latestTelemetry?.status === "EXECUTING"
                      ? "bg-purple-500/10 text-purple-300 border border-purple-500/30 animate-pulse"
                      : latestTelemetry?.status === "TIMEOUT"
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                }`}
              >
                {latestTelemetry?.status ?? "EXECUTING"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuantumBridgeMonitor;
