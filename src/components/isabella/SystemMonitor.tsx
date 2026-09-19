import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle,
  Clock3,
  HardDrive,
  RefreshCw,
  Server,
  ShieldAlert,
  XCircle,
} from "lucide-react";
type HealthState = "unknown" | "ok" | "failed";

type HealthResponse = {
  status?: string;
  timestamp?: string;
  checks?: Record<string, { ok?: boolean; latencyMs?: number; error?: string }>;
};

async function readHealth(path: string): Promise<HealthResponse> {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  let body: HealthResponse = {};
  try {
    body = (await response.json()) as HealthResponse;
  } catch {
    // Keep the HTTP status as the source of truth when a proxy returns non-JSON.
  }
  if (!response.ok)
    throw Object.assign(new Error(body.status ?? `HTTP ${response.status}`), {
      body,
    });
  return body;
}

function formatTimestamp(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
}

export function SystemMonitor() {
  const [envMode, setEnvMode] = useState<"development" | "staging" | "production">("production");
  const [live, setLive] = useState<HealthState>("unknown");
  const [ready, setReady] = useState<HealthState>("unknown");
  const [deep, setDeep] = useState<HealthState>("unknown");
  const [checks, setChecks] = useState<HealthResponse["checks"]>({});
  const [lastCheck, setLastCheck] = useState<string>();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    if (host.includes("-dev") || host === "localhost" || host === "127.0.0.1")
      setEnvMode("development");
    else if (host.includes("-pre") || host.includes("staging")) setEnvMode("staging");
    else setEnvMode("production");
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const timestamp = new Date().toISOString();
    try {
      const liveResult = await readHealth("/api/health/live");
      setLive("ok");
      setLastCheck(liveResult.timestamp ?? timestamp);
    } catch {
      setLive("failed");
      setReady("failed");
      setDeep("failed");
      setChecks({});
      setLastCheck(timestamp);
      setIsRefreshing(false);
      return;
    }

    try {
      const readyResult = await readHealth("/api/health/ready");
      setReady(readyResult.status === "ready" ? "ok" : "failed");
      setChecks(readyResult.checks ?? {});
      setLastCheck(readyResult.timestamp ?? timestamp);
    } catch (error) {
      setReady("failed");
      const body = (error as { body?: HealthResponse }).body;
      setChecks(body?.checks ?? {});
      setLastCheck(body?.timestamp ?? timestamp);
    }

    try {
      const deepResult = await readHealth("/api/health/deep");
      setDeep(deepResult.status === "ready" ? "ok" : "failed");
      setChecks((previous) => ({ ...previous, ...(deepResult.checks ?? {}) }));
      setLastCheck(deepResult.timestamp ?? timestamp);
    } catch {
      setDeep("failed");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const statusIcon = (state: HealthState) => {
    if (state === "ok") return <CheckCircle className="size-3.5" />;
    if (state === "failed") return <XCircle className="size-3.5" />;
    return <Clock3 className="size-3.5" />;
  };

  const statusText = (state: HealthState) =>
    state === "ok" ? "OK" : state === "failed" ? "FAIL" : "PENDING";
  const dbCheck = checks?.repository;
  const auditCheck = checks?.audit;

  return (
    <div
      className="p-5 rounded-2xl bg-[#13151f] border border-border/10 space-y-4 font-mono text-xs text-muted-foreground"
      id="system-k8s-monitor"
    >
      <div className="flex items-center justify-between pb-2 border-b border-border/5 gap-3">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
              Estado real del entorno
            </h3>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
              Health endpoints · sin métricas sintéticas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase text-[9px] px-2.5 py-0.5 rounded-full border border-border/20 text-muted-foreground">
            ENTORNO: {envMode}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            aria-label="Actualizar estado"
            className="p-1.5 rounded-lg border border-border/10 hover:bg-white/5"
          >
            <RefreshCw className={`size-3 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          ["Liveness", live],
          ["Readiness", ready],
          ["Deep readiness", deep],
        ].map(([label, state]) => (
          <div
            key={label as string}
            className="p-3 bg-black/25 border border-border/5 rounded-xl flex items-center justify-between"
          >
            <span className="flex items-center gap-2 font-bold text-white uppercase text-[10px]">
              <Activity className="size-3.5" />
              {label as string}
            </span>
            <span
              className={`flex items-center gap-1 font-bold text-[10px] ${state === "ok" ? "text-emerald-400" : state === "failed" ? "text-red-400" : "text-muted-foreground"}`}
            >
              {statusIcon(state as HealthState)}
              {statusText(state as HealthState)}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 bg-black/25 border border-border/5 rounded-xl space-y-2">
          <span className="flex items-center gap-1 text-[10px] font-bold text-white uppercase">
            <HardDrive className="size-3.5" /> Autoridad de persistencia
          </span>
          <div className="flex items-center justify-between text-[10px]">
            <span>PostgreSQL repository</span>
            <strong className={dbCheck?.ok ? "text-emerald-400" : "text-red-400"}>
              {dbCheck?.ok ? "HEALTHY" : "UNAVAILABLE"}
            </strong>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span>Audit repository</span>
            <strong className={auditCheck?.ok ? "text-emerald-400" : "text-red-400"}>
              {auditCheck?.ok ? "HEALTHY" : "UNAVAILABLE"}
            </strong>
          </div>
        </div>

        <div className="p-3 bg-black/25 border border-border/5 rounded-xl space-y-2">
          <span className="flex items-center gap-1 text-[10px] font-bold text-white uppercase">
            <ShieldAlert className="size-3.5" /> Evidencia operacional
          </span>
          <p className="text-[10px] leading-relaxed">
            CPU, memoria, pods y escalado Kubernetes no se inventan desde el navegador. Conexión a
            un proveedor de métricas no disponible = estado explícito “no conectado”.
          </p>
          <p className="text-[9px]">Última comprobación: {formatTimestamp(lastCheck)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="block text-[10px] uppercase font-bold text-white pb-1">
          Checks del runtime
        </span>
        <div className="space-y-1 max-h-[150px] overflow-auto pr-1">
          {Object.entries(checks ?? {}).map(([name, check]) => (
            <div
              key={name}
              className="flex items-center justify-between p-2 bg-black/15 border border-border/5 rounded-lg"
            >
              <span className="text-white font-semibold text-[10px]">{name}</span>
              <span className={check?.ok ? "text-emerald-400" : "text-red-400"}>
                {check?.ok ? "OK" : (check?.error ?? "FAIL")}
                {typeof check?.latencyMs === "number" ? ` · ${check.latencyMs.toFixed(1)}ms` : ""}
              </span>
            </div>
          ))}
          {Object.keys(checks ?? {}).length === 0 && (
            <div className="p-2 text-[10px]">Sin evidencia de checks disponible.</div>
          )}
        </div>
      </div>

      {ready === "failed" && (
        <p className="text-[9px] text-amber-300">
          El entorno no está listo para operaciones críticas. El monitor refleja el estado del
          backend y no intenta maquillarlo.
        </p>
      )}
    </div>
  );
}
