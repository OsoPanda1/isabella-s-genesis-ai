import { MODULES, MODULE_ORDER, type ModuleId, type RoutingDecision } from "@/lib/crown-ui";

export function ModuleRail({
  decision,
  active,
}: {
  decision: RoutingDecision | null;
  active: boolean;
}) {
  return (
    <div className="space-y-3">
      {MODULE_ORDER.map((id: ModuleId) => {
        const mod = MODULES[id];
        const weight = decision?.weights[id] ?? mod.baseWeight;
        const isPrimary = decision?.primary === id;
        return (
          <div
            key={id}
            className="glass rounded-xl px-4 py-3 transition-all duration-500"
            style={{
              borderColor: isPrimary ? mod.color : undefined,
              boxShadow: isPrimary ? `0 0 34px -14px ${mod.color}` : undefined,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`size-1.5 rounded-full ${active && isPrimary ? "animate-breathe" : ""}`}
                  style={{ background: mod.color }}
                />
                <span
                  className="font-mono text-[11px] tracking-[0.22em]"
                  style={{ color: mod.color }}
                >
                  {mod.acronym}
                </span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {(weight * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{mod.role}</p>
            <div className="mt-2.5 h-px w-full overflow-hidden bg-border/60">
              <div
                className="h-px transition-all duration-700 ease-out"
                style={{
                  width: `${weight * 100}%`,
                  background: mod.color,
                  boxShadow: `0 0 8px ${mod.color}`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
