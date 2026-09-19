import { Activity, RefreshCw } from "lucide-react";

interface UsageDashboardProps {
  activePlanId: string | null;
  messagesUsed: number;
  messageLimit: number;
  tokensRemaining: number;
  tokenLimit: number;
  currentRequestsPerMin?: number;
  rateLimitThreshold?: number;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function UsageDashboard({
  activePlanId,
  messagesUsed,
  messageLimit,
  tokensRemaining,
  tokenLimit,
  currentRequestsPerMin = 28,
  rateLimitThreshold = Number(import.meta.env.VITE_RATE_LIMIT_DEFAULT_PER_MINUTE || 120),
  onRefresh,
  isRefreshing = false,
}: UsageDashboardProps) {
  const getPlanName = (id: string | null) => {
    switch (id) {
      case "free":
        return "Isabella Free (Freemium)";
      case "personal":
        return "Isabella Personal";
      case "pro":
        return "Isabella Creator (Pro)";
      case "enterprise":
        return "Isabella Enterprise";
      default:
        return "Isabella Free (Invitado)";
    }
  };

  const messagePercentage = Math.min((messagesUsed / messageLimit) * 100, 100);
  const tokenPercentage = Math.min((tokensRemaining / tokenLimit) * 100, 100);
  const rateLimitPercentage = Math.min((currentRequestsPerMin / rateLimitThreshold) * 100, 100);

  const getRateLimitColor = (pct: number) => {
    if (pct >= 90) return "bg-rose-500 text-rose-400 border-rose-500/30";
    if (pct >= 70) return "bg-amber-500 text-amber-400 border-amber-500/30";
    return "bg-electric text-electric border-electric/30";
  };

  return (
    <div className="glass rounded-3xl p-6 border border-border/40 shadow-glass flex flex-col gap-5">
      {/* Dashboard Header */}
      <div className="flex items-center justify-between border-b border-border/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-secondary/20 border border-border/30">
            <Activity className="size-4.5 text-electric" />
          </div>
          <div>
            <span className="block font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Estadísticas de Consumo
            </span>
            <h4 className="font-display text-[15px] text-pearl font-bold">
              Consumo de Infraestructura & Tasa de Solicitudes API
            </h4>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 rounded-lg border border-border/30 hover:border-border/50 text-muted-foreground hover:text-platinum transition-all disabled:opacity-30"
          title="Sincronizar límites"
        >
          <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin text-electric" : ""}`} />
        </button>
      </div>

      {/* Current Status Block */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Subscription Status Card */}
        <div className="bg-secondary/15 rounded-2xl p-4 border border-border/30 flex flex-col justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
            Membresía Activa
          </span>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11.5px] text-platinum font-semibold truncate">
              {getPlanName(activePlanId)}
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border/15 flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              Renovación automática
            </span>
            <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              SI
            </span>
          </div>
        </div>

        {/* Message Quota Card */}
        <div className="bg-secondary/15 rounded-2xl p-4 border border-border/30 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
              Mensajes Utilizados
            </span>
            <span className="font-mono text-[11px] text-platinum font-semibold">
              {messagesUsed} / {messageLimit}
            </span>
          </div>
          <div className="mt-3">
            <div className="w-full bg-secondary/35 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-electric h-full transition-all duration-500"
                style={{ width: `${messagePercentage}%` }}
              />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border/15 text-[10px] text-muted-foreground font-mono flex justify-between">
            <span>Restablece en</span>
            <span>22 días</span>
          </div>
        </div>

        {/* Remaining Tokens Card */}
        <div className="bg-secondary/15 rounded-2xl p-4 border border-border/30 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
              Tokens de Memoria
            </span>
            <span className="font-mono text-[11px] text-platinum font-semibold">
              {tokensRemaining.toLocaleString()}
            </span>
          </div>
          <div className="mt-3">
            <div className="w-full bg-secondary/35 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-full transition-all duration-500"
                style={{ width: `${tokenPercentage}%` }}
              />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border/15 text-[10px] text-muted-foreground font-mono flex justify-between">
            <span>Cuota máxima</span>
            <span>{tokenLimit.toLocaleString()} tokens</span>
          </div>
        </div>

        {/* API Rate Limit Indicator Card */}
        <div className="bg-secondary/15 rounded-2xl p-4 border border-border/30 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
              Tasa Solicitudes API
            </span>
            <span className="font-mono text-[11px] text-platinum font-semibold">
              {currentRequestsPerMin} / {rateLimitThreshold} req/min
            </span>
          </div>
          <div className="mt-3 space-y-1">
            <div className="w-full bg-secondary/35 rounded-full h-2 overflow-hidden p-0.5 border border-border/20">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  rateLimitPercentage >= 90
                    ? "bg-rose-500"
                    : rateLimitPercentage >= 70
                      ? "bg-amber-400"
                      : "bg-electric"
                }`}
                style={{ width: `${rateLimitPercentage}%` }}
              />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border/15 text-[10px] text-muted-foreground font-mono flex justify-between items-center">
            <span>Límite (Threshold)</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getRateLimitColor(
                rateLimitPercentage,
              )}`}
            >
              {rateLimitPercentage >= 90
                ? "CRÍTICO"
                : rateLimitPercentage >= 70
                  ? "ELEVADO"
                  : "NORMAL"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
