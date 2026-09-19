import { lazy, Suspense, useMemo, useState } from "react";
import { getSessionToken } from "@/lib/auth-client";
import { Shield, ShieldAlert, ShieldCheck, RefreshCw, Activity, Database } from "lucide-react";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";

const ObservabilityPanel = lazy(() =>
  import("./ObservabilityPanel").then((module) => ({ default: module.ObservabilityPanel })),
);
const SovereignCompliancePanel = lazy(() =>
  import("./SovereignCompliancePanel").then((module) => ({
    default: module.SovereignCompliancePanel,
  })),
);
const SovereignSkillsPanel = lazy(() =>
  import("./SovereignSkillsPanel").then((module) => ({ default: module.SovereignSkillsPanel })),
);
const SecurityAuditDashboard = lazy(() =>
  import("./SecurityAuditDashboard").then((module) => ({ default: module.SecurityAuditDashboard })),
);

export enum AegisLevel {
  OPEN = 0,
  WATCH = 1,
  CONTAIN = 2,
  ISOLATE = 3,
  VAULT = 4,
  LOCKDOWN = 5,
}

export type Decision = "allow" | "observe" | "challenge" | "quarantine" | "block";

export interface DetectionResult {
  event_id: string;
  score: number;
  decision: Decision;
  aegis_level: AegisLevel;
  reasons: string[];
  model_version: string;
  learning_mode: string;
  sanitizedActor: string;
  sanitizedSource: string;
  redactedMetadata: Record<string, unknown>;
}

interface AuditRecord {
  timestamp: string;
  previous_hash: string;
  payload: DetectionResult;
  record_hash: string;
}

const GENESIS = "GENESIS_BLOCK_LATAM_AEGIS";

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function PanelLoading() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border/15 bg-secondary/10 text-muted-foreground">
      <span className="font-mono text-xs uppercase tracking-[0.2em]">
        Cargando módulo soberano…
      </span>
    </div>
  );
}

function levelLabel(level: AegisLevel) {
  return ["OPEN", "WATCH", "CONTAIN", "ISOLATE", "VAULT", "LOCKDOWN"][level] ?? "UNKNOWN";
}

export function LatamAegisDashboard() {
  const [level, setLevel] = useState<AegisLevel>(AegisLevel.OPEN);
  const [eventsProcessed, setEventsProcessed] = useState(0);
  const [auditChain, setAuditChain] = useState<AuditRecord[]>([]);
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "valid" | "invalid">(
    "idle",
  );
  const [corruptedIndex, setCorruptedIndex] = useState<number | null>(null);
  const [subTab, setSubTab] = useState<
    "firewall" | "audit" | "observability" | "compliance" | "skills"
  >("firewall");
  const [actor, setActor] = useState("operator");
  const [source, setSource] = useState("client");
  const [action, setAction] = useState("api_request");
  const [resource, setResource] = useState("standard_resource");
  const [anomalyRate, setAnomalyRate] = useState(0.1);
  const [volumeRatio, setVolumeRatio] = useState(0.1);
  const [secretPattern, setSecretPattern] = useState(false);
  const [massDownload, setMassDownload] = useState(false);

  const chartData = useMemo(
    () =>
      auditChain.map((block, index) => ({
        name: `Run ${index + 1}`,
        score: block.payload.score,
        level: block.payload.aegis_level,
      })),
    [auditChain],
  );

  const processPipeline = async () => {
    setProcessing(true);
    setError(null);
    setVerifyStatus("idle");
    const token = getSessionToken() || sessionStorage.getItem("isabella_session_token");
    if (!token) {
      setProcessing(false);
      setError(
        "Sesión autenticada requerida. No se ejecuta análisis de seguridad local ni se fabrican resultados.",
      );
      return;
    }

    const eventPayload = {
      event_id: crypto.randomUUID(),
      event_type: "api_request",
      actor,
      source,
      action,
      resource_class: resource,
      features: { anomaly_rate: anomalyRate, volume_ratio: volumeRatio },
      metadata: { secret_pattern_detected: secretPattern, mass_download: massDownload },
      timestamp: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/security", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(eventPayload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Fallo del servidor (${res.status})`);
      const result = body as DetectionResult;
      const previousHash = auditChain.at(-1)?.record_hash ?? GENESIS;
      const recordHash = await digest(`${previousHash}:${JSON.stringify(result)}`);
      const block: AuditRecord = {
        timestamp: new Date().toISOString(),
        previous_hash: previousHash,
        payload: result,
        record_hash: recordHash,
      };
      setAuditChain((prev) => [...prev, block]);
      setLevel((prev) => Math.max(prev, result.aegis_level));
      setLastResult(result);
      setEventsProcessed((count) => count + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No fue posible completar el análisis remoto.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const verifyAuditLedger = async () => {
    setVerifyStatus("verifying");
    setCorruptedIndex(null);
    let previous = GENESIS;
    for (let index = 0; index < auditChain.length; index += 1) {
      const block = auditChain[index]!;
      if (
        block.previous_hash !== previous ||
        block.record_hash !== (await digest(`${previous}:${JSON.stringify(block.payload)}`))
      ) {
        setCorruptedIndex(index);
        setVerifyStatus("invalid");
        return;
      }
      previous = block.record_hash;
    }
    setVerifyStatus("valid");
  };

  const resetAegisWall = () => {
    setLevel(AegisLevel.OPEN);
    setLastResult(null);
    setVerifyStatus("idle");
    setCorruptedIndex(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 rounded-3xl border border-border/20 bg-background p-6 text-foreground shadow-xl">
      <div className="flex flex-col justify-between gap-4 border-b border-border/15 pb-5 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15">
            <Shield className="size-6 text-red-400" />
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold tracking-wide text-platinum">
              Muro de Protección LATAM AEGIS-X{" "}
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-red-400">
                Defensa Activa
              </span>
            </h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              Evaluación remota gobernada; sin secretos ni fallback de seguridad en el cliente.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-border/10 bg-secondary/15 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
            Ingestados: <span className="font-bold text-emerald-400">{eventsProcessed}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-red-400">
            <ShieldAlert className="size-3.5" /> MURO: {levelLabel(level)}
          </div>
          <button
            onClick={resetAegisWall}
            className="cursor-pointer rounded-xl border border-border/30 bg-secondary/15 px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:bg-secondary/35"
          >
            Restablecer
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border/15 pb-1">
        {(["firewall", "audit", "observability", "compliance", "skills"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`shrink-0 rounded-t-xl border-b-2 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider ${subTab === tab ? "border-red-500 bg-red-500/5 text-red-400" : "border-transparent text-muted-foreground hover:text-platinum"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {subTab === "audit" && (
        <Suspense fallback={<PanelLoading />}>
          <SecurityAuditDashboard />
        </Suspense>
      )}

      {subTab === "observability" && (
        <Suspense fallback={<PanelLoading />}>
          <ObservabilityPanel />
        </Suspense>
      )}
      {subTab === "compliance" && (
        <Suspense fallback={<PanelLoading />}>
          <SovereignCompliancePanel />
        </Suspense>
      )}
      {subTab === "skills" && (
        <Suspense fallback={<PanelLoading />}>
          <SovereignSkillsPanel />
        </Suspense>
      )}

      {subTab === "firewall" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">Actor</span>
              <input
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                className="w-full rounded-xl border border-border/20 bg-secondary/10 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">Source</span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded-xl border border-border/20 bg-secondary/10 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">Action</span>
              <input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full rounded-xl border border-border/20 bg-secondary/10 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                Resource
              </span>
              <input
                value={resource}
                onChange={(e) => setResource(e.target.value)}
                className="w-full rounded-xl border border-border/20 bg-secondary/10 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                Anomaly rate: {anomalyRate.toFixed(2)}
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={anomalyRate}
                onChange={(e) => setAnomalyRate(Number(e.target.value))}
                className="w-full"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                Volume ratio: {volumeRatio.toFixed(2)}
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volumeRatio}
                onChange={(e) => setVolumeRatio(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 rounded-2xl border border-border/15 bg-secondary/5 p-4 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={secretPattern}
                onChange={(e) => setSecretPattern(e.target.checked)}
              />{" "}
              patrón sensible
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={massDownload}
                onChange={(e) => setMassDownload(e.target.checked)}
              />{" "}
              descarga masiva
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              disabled={processing}
              onClick={() => void processPipeline()}
              className="flex items-center gap-2 rounded-xl bg-red-500/15 px-4 py-2 font-mono text-xs font-bold text-red-300 disabled:opacity-50"
            >
              <Activity className="size-4" />
              {processing ? "Analizando…" : "Ejecutar AEGIS-X"}
            </button>
            <button
              disabled={!auditChain.length || verifyStatus === "verifying"}
              onClick={() => void verifyAuditLedger()}
              className="flex items-center gap-2 rounded-xl border border-border/20 px-4 py-2 font-mono text-xs disabled:opacity-50"
            >
              <ShieldCheck className="size-4" /> Verificar ledger
            </button>
            <button
              onClick={() => {
                setAuditChain([]);
                setEventsProcessed(0);
                setLastResult(null);
              }}
              className="flex items-center gap-2 rounded-xl border border-border/20 px-4 py-2 font-mono text-xs"
            >
              <RefreshCw className="size-4" /> Limpiar sesión
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 font-mono text-xs text-red-300"
            >
              {error}
            </div>
          )}
          {verifyStatus !== "idle" && (
            <div className="rounded-xl border border-border/15 p-3 font-mono text-xs">
              Ledger: <strong>{verifyStatus.toUpperCase()}</strong>
              {corruptedIndex !== null ? ` · bloque ${corruptedIndex + 1}` : ""}
            </div>
          )}

          {lastResult && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border/15 p-4">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">Score</span>
                <div className="mt-2 text-2xl font-bold">{lastResult.score.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-border/15 p-4">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  Decision
                </span>
                <div className="mt-2 font-mono font-bold uppercase">{lastResult.decision}</div>
              </div>
              <div className="rounded-2xl border border-border/15 p-4">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">Model</span>
                <div className="mt-2 truncate font-mono text-sm">{lastResult.model_version}</div>
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className="h-72 rounded-2xl border border-border/15 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 1]} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="score" name="score" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded-2xl border border-border/15 p-4">
            <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
              <Database className="size-4" /> Evidencia de sesión
            </div>
            {auditChain.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">
                Sin eventos. Los resultados solo se aceptan desde /api/security autenticado.
              </p>
            ) : (
              <div className="space-y-2">
                {auditChain.slice(-5).map((block, index) => (
                  <div
                    key={block.record_hash}
                    className="rounded-xl bg-secondary/10 p-3 font-mono text-[10px]"
                  >
                    #{auditChain.length - Math.min(auditChain.length, 5) + index + 1} ·{" "}
                    {block.payload.decision} · {block.record_hash.slice(0, 16)}…
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
