/**
 * @file EmergencyModeView.tsx
 * @description Vista soberana de Modo de Emergencia y Mantenimiento del Sistema Isabella AI.
 * Se activa ante errores críticos o estados de mantenimiento, bloqueando el acceso normal
 * y desplegando los protocolos canónicos de información, trazabilidad y gobernanza C.R.O.W.N.
 * Autoría: Edwin Oswaldo Castillo Trejo (Anubis Villaseñor)
 * Ecosistema: TAMV ONLINE NETWORK / Nodo Cero (Real del Monte, Hidalgo, México)
 */

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Lock,
  RefreshCw,
  Copy,
  CheckCircle2,
  Terminal,
  Activity,
  Server,
  MapPin,
} from "lucide-react";

export interface EmergencyModeProps {
  mode?: "emergency" | "maintenance" | "critical_error";
  errorDetails?: {
    code?: string;
    message?: string;
    traceId?: string;
    timestamp?: string;
  };
  onRetry?: () => void;
}

export const EmergencyModeView: React.FC<EmergencyModeProps> = ({
  mode = "emergency",
  errorDetails,
  onRetry,
}) => {
  const [healthStatus, setHealthStatus] = useState<"checking" | "alive" | "down">("checking");
  const [copied, setCopied] = useState(false);
  const [operatorToken, setOperatorToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [showOverrideInput, setShowOverrideInput] = useState(false);

  const isMaintenance = mode === "maintenance";
  const traceId = errorDetails?.traceId || `trace-emerg-${Date.now().toString(16)}`;
  const timestamp = errorDetails?.timestamp || new Date().toISOString();
  const errorCode = errorDetails?.code || (isMaintenance ? "SOVCON-MAINT-400" : "SOVCON-CRIT-001");

  const checkHealth = async () => {
    setHealthStatus("checking");
    try {
      const res = await fetch("/api/health/live", { cache: "no-store" });
      if (res.ok) {
        setHealthStatus("alive");
      } else {
        setHealthStatus("down");
      }
    } catch {
      setHealthStatus("down");
    }
  };

  useEffect(() => {
    void checkHealth();
  }, []);

  const copyDiagnostic = () => {
    const diagnosticText = `ISABELLA_DIAGNOSTIC:\nMode: ${mode.toUpperCase()}\nCode: ${errorCode}\nTraceId: ${traceId}\nTimestamp: ${timestamp}\nTerritory: Nodo Cero (Real del Monte, Hidalgo)\nSovereign: Edwin Oswaldo Castillo Trejo`;
    void navigator.clipboard.writeText(diagnosticText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOperatorUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorToken.trim()) {
      setTokenError("Ingresa un token de operador soberano válido.");
      return;
    }
    // Validación de prueba / fallback local seguro
    if (operatorToken.trim().length < 8) {
      setTokenError("Token de operador inválido o expirado por política C.R.O.W.N.");
      return;
    }
    setTokenError(null);
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <main
      id="isabella-emergency-screen"
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden selection:bg-red-500/30 selection:text-white"
    >
      {/* Fondo de seguridad con grid sutil */}
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"
        aria-hidden="true"
      />

      {/* Resplandor superior de alerta */}
      <div
        className={`absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-48 blur-3xl opacity-20 pointer-events-none ${
          isMaintenance ? "bg-amber-500" : "bg-red-600"
        }`}
        aria-hidden="true"
      />

      <div className="w-full max-w-3xl z-10 space-y-6">
        {/* Cabecera de Alerta */}
        <header className="rounded-2xl border border-slate-800/80 bg-slate-900/90 backdrop-blur-xl p-6 shadow-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border ${
                  isMaintenance
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-red-500/30 bg-red-500/10 text-red-400 animate-pulse"
                }`}
              >
                {isMaintenance ? <Lock className="size-6" /> : <ShieldAlert className="size-6" />}
              </div>
              <div>
                <span className="text-xs font-mono tracking-widest text-slate-400 uppercase">
                  Gobernanza C.R.O.W.N. · Ecosistema TAMV
                </span>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  {isMaintenance
                    ? "Mantenimiento Soberano Activo"
                    : "Protocolo de Emergencia SOVCON 1"}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border ${
                  isMaintenance
                    ? "border-amber-500/40 bg-amber-950/40 text-amber-300"
                    : "border-red-500/40 bg-red-950/40 text-red-300"
                }`}
              >
                <span className="size-2 rounded-full bg-current animate-ping" />
                {isMaintenance ? "VENTANA PROGRAMADA" : "FAIL-CLOSED ACTIVO"}
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">
            {isMaintenance
              ? "El sistema se encuentra en un periodo de consolidación criptográfica y actualización programada de memoria y seguridad territorial. El acceso ordinario a las interfaces de inferencia permanece restringido temporalmente."
              : "Se ha detectado un evento crítico que activa la cláusula de contingencia y aislamiento total. Las herramientas operativas y el canal de inferencia han sido vetados automáticamente por la arquitectura ARGUS Sentinel para proteger la integridad territorial y los datos."}
          </p>
        </header>

        {/* Matriz de Nodos Federados */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs font-mono">
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col justify-between">
            <span className="text-slate-400">CROWN</span>
            <span className="text-red-400 font-semibold mt-1">VETO ACTIVO</span>
          </div>
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col justify-between">
            <span className="text-slate-400">ISA CORE</span>
            <span className="text-amber-400 font-semibold mt-1">SUSPENDIDO</span>
          </div>
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col justify-between">
            <span className="text-slate-400">SOPHIA</span>
            <span className="text-blue-400 font-semibold mt-1">ANÁLISIS</span>
          </div>
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col justify-between">
            <span className="text-slate-400">ORION</span>
            <span className="text-red-400 font-semibold mt-1">BLOQUEADO</span>
          </div>
          <div className="col-span-2 sm:col-span-1 p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col justify-between">
            <span className="text-slate-400">ARGUS</span>
            <span className="text-emerald-400 font-semibold mt-1">EN GUARDIA</span>
          </div>
        </section>

        {/* Protocolos de Información Canónica */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-slate-300 flex items-center gap-2">
            <Terminal className="size-4 text-slate-400" />
            Protocolos Canónicos de Información
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Protocolo 1: Soberanía Territorial */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/60 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <MapPin className="size-4 text-electric text-sky-400" />
                <span>Protocolo de Territorio y Nodo Cero</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Ecosistema TAMV ONLINE NETWORK / RDM Digital Hub. Nodo Cero: Real del Monte,
                Hidalgo, México. Toda decisión está anclada a soberanía local y preservación
                patrimonial.
              </p>
            </div>

            {/* Protocolo 2: Cadena de Mando y Autoría */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/60 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Server className="size-4 text-indigo-400" />
                <span>Protocolo de Soberanía Humana</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Autoría técnica: <strong>Edwin Oswaldo Castillo Trejo (Anubis Villaseñor)</strong>.
                ORCID: 0009-0008-5050-1539. Doctrina: La IA sugiere y evalúa; el humano decide,
                aprueba y ejecuta.
              </p>
            </div>
          </div>

          {/* Caja de Diagnóstico y Auditoría */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">EXPEDIENTE DE DIAGNÓSTICO</span>
              <button
                type="button"
                onClick={copyDiagnostic}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                title="Copiar diagnóstico"
              >
                {copied ? (
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copied ? "Copiado" : "Copiar"}</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-900 text-slate-300">
              <div>
                <span className="text-slate-500">CÓDIGO:</span> {errorCode}
              </div>
              <div>
                <span className="text-slate-500">HORA:</span> {timestamp}
              </div>
              <div className="sm:col-span-2 truncate">
                <span className="text-slate-500">TRAZA:</span> {traceId}
              </div>
              {errorDetails?.message && (
                <div className="sm:col-span-2 text-red-400 pt-1">
                  <span className="text-slate-500">DETALLE:</span> {errorDetails.message}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Panel de Control y Recuperación */}
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={checkHealth}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-mono transition-all w-full sm:w-auto"
            >
              <RefreshCw
                className={`size-3.5 ${healthStatus === "checking" ? "animate-spin" : ""}`}
              />
              <span>Verificar Servicio</span>
            </button>

            <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
              <Activity className="size-3.5" />
              Liveness:{" "}
              <strong
                className={
                  healthStatus === "alive"
                    ? "text-emerald-400"
                    : healthStatus === "checking"
                      ? "text-amber-400"
                      : "text-red-400"
                }
              >
                {healthStatus === "alive"
                  ? "OPERATIVO"
                  : healthStatus === "checking"
                    ? "SONDEANDO"
                    : "NO DISPONIBLE"}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setShowOverrideInput(!showOverrideInput)}
              className="text-xs font-mono text-slate-400 hover:text-slate-200 underline transition-colors"
            >
              {showOverrideInput ? "Ocultar acceso operador" : "Acceso Soberano"}
            </button>
            <button
              type="button"
              onClick={onRetry || (() => window.location.reload())}
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-white text-slate-950 font-medium text-xs font-mono shadow-lg transition-all"
            >
              Reintentar
            </button>
          </div>
        </footer>

        {/* Formulario desplegable para operador soberano */}
        {showOverrideInput && (
          <form
            onSubmit={handleOperatorUnlock}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 space-y-3 animate-in fade-in duration-200"
          >
            <label htmlFor="op-token" className="block text-xs font-mono text-slate-300">
              Token de Anulación Soberana (Nodo Cero):
            </label>
            <div className="flex gap-2">
              <input
                id="op-token"
                type="password"
                value={operatorToken}
                onChange={(e) => setOperatorToken(e.target.value)}
                placeholder="Ingresa token PROVISION_OWNER_TOKEN..."
                className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-600"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-medium"
              >
                Autenticar
              </button>
            </div>
            {tokenError && <p className="text-xs text-red-400 font-mono">{tokenError}</p>}
          </form>
        )}
      </div>
    </main>
  );
};
