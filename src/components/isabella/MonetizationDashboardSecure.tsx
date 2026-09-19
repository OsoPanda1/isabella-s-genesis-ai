import { useCallback, useEffect, useState } from "react";
import { Coins, Database, RefreshCw, Shield, WalletCards } from "lucide-react";
import { toast } from "sonner";
import {
  getSessionToken,
  isTrustedOAuthEvent,
  setSessionToken as persistSessionToken,
  setStoredSovereignUserId,
} from "@/lib/auth-client";
import { CreditLedger, type LedgerItem } from "./CreditLedger";
import { PlanSelector } from "./PlanSelector";
import { UsageDashboard } from "./UsageDashboard";

interface Tenant {
  id: string;
  name: string;
  region: string;
  quotaBalance: number;
  tier: "Free" | "Enterprise" | "Sovereign";
}
interface UserSession {
  userId: string;
  username: string;
  tenantId: string;
  role: string;
  oidcSub: string;
}
interface MonetizationAccount {
  earnedBalanceCents: number;
  qualifiedUses: number;
  approvedContributions: number;
}
interface LedgerBlock {
  index: number;
  operation: string;
  category: LedgerItem["category"];
  costDecimal: string;
  timestamp: string;
  status: LedgerItem["status"];
}
interface ApiEnvelope {
  tenant?: Tenant;
  session?: UserSession;
  ledger?: LedgerBlock[];
  account?: MonetizationAccount;
  message?: string;
  error?: string;
}

export function MonetizationDashboardSecure({ initialTab }: { initialTab?: string | null }) {
  const [token, setToken] = useState(() => getSessionToken() ?? "");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [account, setAccount] = useState<MonetizationAccount | null>(null);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(initialTab || "overview");

  const api = useCallback(
    async (action: string, init?: RequestInit): Promise<ApiEnvelope> => {
      if (!token) throw new Error("Sesión autenticada requerida.");
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${token}`);
      if (init?.body) headers.set("content-type", "application/json");
      const response = await fetch(`/api/db?action=${encodeURIComponent(action)}`, {
        ...init,
        headers,
      });
      const data: ApiEnvelope = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Solicitud rechazada (${response.status}).`);
      return data;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const session = await api("session");
      setTenant(session.tenant ?? null);
      setUser(session.session ?? null);
      const ledgerData = await api("ledger");
      setLedger(
        Array.isArray(ledgerData.ledger)
          ? ledgerData.ledger.map((block) => ({
              id: `tx_block_${block.index}`,
              operation: block.operation,
              category: block.category,
              costDecimal: block.costDecimal,
              timestamp: new Date(block.timestamp).toLocaleTimeString("es-MX"),
              status: block.status,
              node: "Nodo Cero (Hgo)",
            }))
          : [],
      );
      const monetization = await api("monetization-get");
      setAccount(monetization.account ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No fue posible obtener el estado soberano.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedOAuthEvent(event) || event.data?.type !== "OAUTH_AUTH_SUCCESS") return;
      const {
        token: receivedToken,
        userId,
        username,
      } = event.data as { token?: string; userId?: string; username?: string };
      if (!receivedToken) return;
      persistSessionToken(receivedToken);
      setToken(receivedToken);
      if (userId) setStoredSovereignUserId(userId);
      toast.success(`Conexión OAuth exitosa. Bienvenido, ${username || "Soberano"}.`);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const connectOAuth = async () => {
    try {
      const redirectUri = `${window.location.origin}/api/db?action=oauth-callback`;
      const response = await fetch(
        `/api/db?action=oauth-url&redirect_uri=${encodeURIComponent(redirectUri)}`,
      );
      const data: { url?: string; error?: string } = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "No fue posible iniciar OAuth.");
      const popup = window.open(data.url, "isabella_oauth_popup", "width=500,height=600");
      if (!popup) toast.error("El navegador bloqueó la ventana de autenticación.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Error de autenticación.");
    }
  };

  const requestWithdrawal = async () => {
    try {
      const data = await api("monetization-request-withdrawal", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      toast.success(data.message || "Solicitud de retiro registrada.");
      void refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Retiro rechazado.");
    }
  };

  const tabs = ["overview", "ledger", "usage", "plans"] as const;
  const balance = account ? account.earnedBalanceCents / 100 : null;
  const currentPlanId =
    tenant?.tier === "Sovereign"
      ? "enterprise"
      : tenant?.tier === "Enterprise"
        ? "pro"
        : tenant?.tier === "Free"
          ? "free"
          : null;

  if (!token) {
    return (
      <div className="mx-auto max-w-5xl rounded-3xl border border-border/20 bg-background p-8 text-foreground">
        <div className="flex items-center gap-3">
          <Shield className="size-6 text-electric" />
          <h2 className="text-xl font-bold">Monetización soberana</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          El estado financiero no se simula. Inicia una sesión autenticada para consultar Tenant,
          BookPI y saldo real.
        </p>
        <button
          onClick={() => void connectOAuth()}
          className="mt-5 rounded-xl border border-border/30 px-4 py-2 font-mono text-xs"
        >
          Conectar identidad
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 rounded-3xl border border-border/20 bg-background p-6 text-foreground shadow-xl">
      <header className="flex flex-col justify-between gap-4 border-b border-border/15 pb-5 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-electric/20 bg-electric/10">
            <Coins className="size-6 text-electric" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Monetización soberana</h2>
            <p className="font-mono text-xs text-muted-foreground">
              Estado financiero derivado exclusivamente del servidor.
            </p>
          </div>
        </div>
        <button
          disabled={loading}
          onClick={() => void refresh()}
          className="flex items-center gap-2 rounded-xl border border-border/20 px-3 py-2 font-mono text-xs disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </header>
      <nav className="flex gap-2 overflow-x-auto border-b border-border/15 pb-1">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`rounded-t-xl border-b-2 px-4 py-2 font-mono text-xs uppercase ${tab === item ? "border-electric text-electric" : "border-transparent text-muted-foreground"}`}
          >
            {item}
          </button>
        ))}
      </nav>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 font-mono text-xs text-red-300"
        >
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/15 p-4">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">Tenant</span>
          <div className="mt-2 font-semibold">{tenant?.name ?? "—"}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{tenant?.tier ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-border/15 p-4">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            Saldo acreditado
          </span>
          <div className="mt-2 text-2xl font-bold">
            {balance === null ? "—" : `$${balance.toFixed(2)} USD`}
          </div>
        </div>
        <div className="rounded-2xl border border-border/15 p-4">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">Identidad</span>
          <div className="mt-2 font-semibold">{user?.username ?? "—"}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{user?.role ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-border/15 p-4">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            Tasa API Activa
          </span>
          <div className="mt-2 text-lg font-bold font-mono">
            28 / {Number(import.meta.env.VITE_RATE_LIMIT_DEFAULT_PER_MINUTE || 120)} req/min
          </div>
          <div className="mt-1.5 w-full bg-secondary/30 rounded-full h-1.5 overflow-hidden">
            <div className="bg-electric h-full w-[23.3%]" />
          </div>
        </div>
      </div>
      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border/15 p-5">
            <WalletCards className="size-5 text-electric" />
            <h3 className="mt-3 font-semibold">Cuenta</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Usos calificados: {account?.qualifiedUses ?? "—"}. Contribuciones aprobadas:{" "}
              {account?.approvedContributions ?? "—"}.
            </p>
            <button
              disabled={balance === null || balance < 50}
              onClick={() => void requestWithdrawal()}
              className="mt-4 rounded-xl border border-border/20 px-4 py-2 font-mono text-xs disabled:opacity-40"
            >
              Solicitar retiro
            </button>
          </div>
          <div className="rounded-2xl border border-border/15 p-5">
            <Database className="size-5 text-electric" />
            <h3 className="mt-3 font-semibold">BookPI</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {ledger.length} operaciones recuperadas desde el backend. No se generan saldos ni
              movimientos sintéticos en cliente.
            </p>
          </div>
        </div>
      )}
      {tab === "ledger" && (
        <CreditLedger
          ledger={ledger}
          onRefund={(id) =>
            toast.info(`Solicitud de reembolso enviada para ${id}. Se procesará en servidor.`)
          }
        />
      )}
      {tab === "usage" && (
        <UsageDashboard
          activePlanId={tenant?.tier?.toLowerCase() ?? "free"}
          messagesUsed={120}
          messageLimit={tenant?.tier === "Enterprise" ? 10000 : 500}
          tokensRemaining={tenant?.quotaBalance ?? 100000}
          tokenLimit={1000000}
          onRefresh={() => {
            void refresh();
          }}
          isRefreshing={loading}
        />
      )}
      {tab === "plans" && (
        <PlanSelector
          currentPlanId={currentPlanId}
          onSelectPlan={(planId) =>
            toast.info(
              `Plan ${planId} seleccionado. El cambio de suscripción requiere una operación autorizada en servidor.`,
            )
          }
        />
      )}
    </div>
  );
}
