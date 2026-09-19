import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { EmergencyModeView } from "@/components/isabella/EmergencyModeView";

const IsabellaClientApp = lazy(() => import("@/components/isabella/IsabellaClientApp"));

const TITLE = "Isabella Villaseñor AI — FGAIS";
const DESC =
  "Isabella Villaseñor AI: sistema federado de inteligencia artificial gobernada, con C.R.O.W.N., seguridad, trazabilidad e inferencia federada.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/**
 * The terminal is deliberately client-mounted. Its dependency graph contains
 * WebGL, audio, browser storage and other browser-only capabilities. Keeping
 * that graph out of SSR prevents a browser-only exception from converting the
 * whole document request into HTTP 500.
 */
function ClientOnly({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : fallback;
}

function LandingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-2xl rounded-3xl border border-border/20 bg-background/70 p-10 text-center shadow-2xl backdrop-blur-xl">
        <div
          className="mx-auto mb-6 size-12 animate-pulse rounded-2xl border border-electric/40 bg-electric/10"
          aria-hidden="true"
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          C.R.O.W.N. · Nodo Cero
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Isabella Villaseñor AI</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Inicializando la interfaz cognitiva gobernada. El núcleo visual se monta en el navegador
          para aislar WebGL, audio, almacenamiento local y telemetría de la renderización del
          servidor.
        </p>
        <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.22em] text-electric/80">
          El presente ha despertado
        </p>
      </section>
    </main>
  );
}

function Index() {
  const [emergencyState, setEmergencyState] = useState<{
    active: boolean;
    mode: "emergency" | "maintenance";
    message?: string;
  } | null>(null);

  useEffect(() => {
    // 1. Revisar si la URL o el entorno fuerza modo de emergencia o mantenimiento
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const forcedMode = params.get("mode");
      if (forcedMode === "emergency" || forcedMode === "maintenance") {
        setEmergencyState({
          active: true,
          mode: forcedMode,
          message: `Activado explícitamente por política de contingencia (${forcedMode}).`,
        });
        return;
      }
    }

    // 2. Comprobar salud del backend de forma no bloqueante para detectar estado de mantenimiento o caída
    let isSubscribed = true;
    fetch("/api/health/ready", { signal: AbortSignal.timeout(2500) })
      .then(async (res) => {
        if (!isSubscribed) return;
        if (res.status === 503) {
          const data = (await res.json().catch(() => ({}))) as {
            checks?: { runtimeMode?: { ok?: boolean }; config?: { ok?: boolean } };
            status?: string;
          };
          if (data.status === "maintenance") {
            setEmergencyState({
              active: true,
              mode: "maintenance",
              message: "El backend ha ingresado a ventana de mantenimiento programado.",
            });
          }
        }
      })
      .catch(() => {
        // Red resiliente: no forzar emergencia en red lenta local
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

  if (emergencyState?.active) {
    return (
      <EmergencyModeView
        mode={emergencyState.mode}
        errorDetails={{
          code:
            emergencyState.mode === "maintenance" ? "SOVCON-MAINT-WINDOW" : "SOVCON-CRITICAL-VETO",
          message: emergencyState.message,
        }}
        onRetry={() => {
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("mode");
            window.location.href = url.pathname;
          }
        }}
      />
    );
  }

  return (
    <ClientOnly fallback={<LandingFallback />}>
      <Suspense fallback={<LandingFallback />}>
        <IsabellaClientApp />
      </Suspense>
    </ClientOnly>
  );
}
