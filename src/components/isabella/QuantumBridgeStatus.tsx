import React, { useState, useEffect } from "react";
import { Zap, Wifi, WifiOff, RefreshCw, Cpu, Activity, CheckCircle2, Clock } from "lucide-react";

export interface QuantumBridgeStatusProps {
  connected?: boolean;
  executionCount?: number;
  lastExecutionTime?: string;
  latencyMs?: number;
  activeQubits?: number;
  onRefreshStatus?: () => void;
}

export function QuantumBridgeStatus({
  connected: initialConnected = true,
  executionCount: initialExecCount = 42,
  lastExecutionTime: initialTime,
  latencyMs: initialLatency = 142,
  activeQubits = 32,
  onRefreshStatus,
}: QuantumBridgeStatusProps) {
  const [isConnected, setIsConnected] = useState(initialConnected);
  const [execCount, setExecCount] = useState(initialExecCount);
  const [latency, setLatency] = useState(initialLatency);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSeen, setLastSeen] = useState(
    initialTime || new Date().toLocaleTimeString([], { hour12: false }),
  );

  useEffect(() => {
    // Simulate active heartbeat pulse for quantum bridge
    const interval = setInterval(() => {
      setLatency(Math.floor(110 + Math.random() * 85));
      setLastSeen(new Date().toLocaleTimeString([], { hour12: false }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsConnected(true);
      setExecCount((prev) => prev + 1);
      setLatency(Math.floor(95 + Math.random() * 40));
      setLastSeen(new Date().toLocaleTimeString([], { hour12: false }));
      setIsRefreshing(false);
      if (onRefreshStatus) onRefreshStatus();
    }, 600);
  };

  return (
    <div
      id="quantum-bridge-status-panel"
      className="w-full rounded-xl border border-purple-500/20 bg-slate-900/80 p-4 text-slate-100 shadow-md backdrop-blur-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
              isConnected
                ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                : "bg-rose-500/10 border-rose-500/30 text-rose-400"
            }`}
          >
            <Zap className={`size-5 ${isConnected ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Puente Cuántico PennyLane QUP-v3
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  isConnected
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                }`}
              >
                {isConnected ? (
                  <>
                    <Wifi className="size-3" /> CONECTADO
                  </>
                ) : (
                  <>
                    <WifiOff className="size-3" /> DESCONECTADO
                  </>
                )}
              </span>
            </div>
            <h4 className="text-sm font-bold text-white tracking-tight">
              Estado de Enlace & Monitoreo de Ejecuciones
            </h4>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 flex items-center gap-1.5 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin text-purple-400" : ""}`} />
          <span>Sincronizar Estado</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 font-mono text-xs">
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-0.5">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
            <Activity className="size-3 text-purple-400" /> Ejecuciones Totales
          </span>
          <p className="text-sm font-bold text-white">{execCount.toLocaleString()} QNodes</p>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-0.5">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
            <Clock className="size-3 text-sky-400" /> Latencia de Enlace
          </span>
          <p className="text-sm font-bold text-sky-300">{latency} ms</p>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-0.5">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
            <Cpu className="size-3 text-emerald-400" /> Qubits / Wires
          </span>
          <p className="text-sm font-bold text-emerald-300">{activeQubits} Asignados</p>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-0.5">
          <span className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
            <CheckCircle2 className="size-3 text-amber-400" /> Último Latido
          </span>
          <p className="text-sm font-bold text-amber-300">{lastSeen}</p>
        </div>
      </div>
    </div>
  );
}

export default QuantumBridgeStatus;
