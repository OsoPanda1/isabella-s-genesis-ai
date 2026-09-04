import { PRESETS, type PresetId, type RoutingDecision } from "@/lib/crown-ui";
import { ModuleRail } from "./ModuleRail";
import { usePerformanceStats } from "@/hooks/usePerformanceMonitor";

const POLICY_LABEL: Record<string, string> = {
  allowed: "AUTORIZADO",
  requires_approval: "RATIFICACIÓN HUMANA",
  denied: "DENEGADO",
};

const POLICY_COLOR: Record<string, string> = {
  allowed: "var(--argus)",
  requires_approval: "var(--orion)",
  denied: "var(--destructive)",
};

export function TelemetryPanel({
  presetId,
  setPresetId,
  decision,
  tokens,
  turns,
  isProcessing,
}: {
  presetId: PresetId;
  setPresetId: (id: PresetId) => void;
  decision: RoutingDecision | null;
  tokens: number;
  turns: number;
  isProcessing: boolean;
}) {
  const policy = decision?.policy ?? "allowed";
  const { stats, events } = usePerformanceStats();

  return (
    <aside className="flex flex-col gap-4">
      <section className="glass rounded-2xl p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Preset cognitivo
        </h2>
        <div className="mt-3 space-y-1.5">
          {PRESETS.map((p) => {
            const on = p.id === presetId;
            return (
              <button
                key={p.id}
                onClick={() => setPresetId(p.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-all duration-300 ${
                  on
                    ? "glow-ring border-primary/60 bg-secondary/50"
                    : "border-border/50 hover:bg-secondary/25"
                }`}
              >
                <span
                  className={`block text-[12.5px] ${on ? "text-platinum" : "text-foreground/80"}`}
                >
                  {p.name}
                </span>
                <span className="block text-[10.5px] leading-snug text-muted-foreground">
                  {p.tagline}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass rounded-2xl p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Policy Gate · ARGUS
        </h2>
        <p
          className="mt-2.5 font-mono text-[12px] tracking-[0.16em]"
          style={{ color: POLICY_COLOR[policy] }}
        >
          {POLICY_LABEL[policy]}
        </p>
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {decision?.policyReason ?? "Sin ciclo evaluado en esta sesión."}
        </p>
        <div className="mt-3 space-y-1">
          {(decision?.rulesChecked ?? []).map((r) => (
            <p
              key={r}
              className="font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground/80"
            >
              ✓ {r}
            </p>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl p-4">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Módulos activos
        </h2>
        <ModuleRail decision={decision} active={isProcessing} />
      </section>

      <section className="glass rounded-2xl p-4">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Rendimiento UI (Core)
        </h2>
        <div className="space-y-3">
          {stats.length === 0 ? (
            <span className="font-mono text-[10.5px] text-muted-foreground">
              Sin telemetría de render.
            </span>
          ) : (
            stats.map((s) => (
              <div key={s.componentName} className="font-mono text-[11px]">
                <div className="flex items-center justify-between text-platinum font-semibold">
                  <span className="text-electric">{s.componentName}</span>
                  <span>{s.averageRenderTimeMs.toFixed(1)}ms</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground text-[9px] mt-0.5">
                  <span>Renders: {s.renderCount}</span>
                  <span>Mount: {s.mountTimeMs.toFixed(1)}ms</span>
                </div>
              </div>
            ))
          )}
          {events.length > 0 && (
            <div className="border-t border-border/15 pt-2.5 mt-2">
              <span className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Eventos Perceptivos
              </span>
              <div className="space-y-1 max-h-[80px] overflow-y-auto pr-1 scrollbar-thin">
                {events
                  .slice(-3)
                  .reverse()
                  .map((e, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between font-mono text-[9.5px] text-muted-foreground/90 leading-tight"
                    >
                      <span className="truncate max-w-[170px]">{e.eventName}</span>
                      <span className="text-amber-400 font-semibold">
                        {e.durationMs.toFixed(0)}ms
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="glass rounded-2xl p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Métricas de sesión
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-2.5">
          {[
            ["Ciclos", String(turns)],
            ["Fragmentos", String(tokens)],
            ["Gobernanza", decision ? `${(decision.governanceScore * 100).toFixed(0)}%` : "—"],
            ["Certeza", decision ? `${(decision.epistemicCertainty * 100).toFixed(0)}%` : "—"],
            ["Latencia", decision ? `${decision.latencyMs} ms` : "—"],
            ["Riesgo", decision ? decision.risk.toUpperCase() : "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
                {k}
              </dt>
              <dd className="font-mono text-[13px] text-platinum">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 border-t border-border/40 pt-2.5 font-mono text-[9.5px] leading-relaxed tracking-[0.12em] text-muted-foreground">
          SCOPES: {(decision?.memoryScopes ?? ["immediate"]).join(" · ").toUpperCase()}
        </p>
      </section>
    </aside>
  );
}
