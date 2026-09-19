import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FolderOpen } from "lucide-react";
import { useIsabella } from "@/lib/useIsabella";
import type { NavTabId } from "@/components/isabella/CrystalNavigation";

const CinematicIntro = lazy(() => import("@/components/isabella/CinematicIntro"));
const CommandLine = lazy(() =>
  import("@/components/isabella/CommandLine").then((m) => ({
    default: m.CommandLine,
  })),
);
const MessageStream = lazy(() =>
  import("@/components/isabella/MessageStream").then((m) => ({
    default: m.MessageStream,
  })),
);
const RightRails = lazy(() =>
  import("@/components/isabella/RightRails").then((m) => ({
    default: m.RightRails,
  })),
);
const Starfield = lazy(() =>
  import("@/components/isabella/Starfield").then((m) => ({
    default: m.Starfield,
  })),
);
const CrystalNavigation = lazy(() =>
  import("@/components/isabella/CrystalNavigation").then((m) => ({
    default: m.CrystalNavigation,
  })),
);
const ApiCatalogExplorer = lazy(() =>
  import("@/components/isabella/ApiCatalogExplorer").then((m) => ({
    default: m.ApiCatalogExplorer,
  })),
);
const TerminalView = lazy(() =>
  import("@/components/isabella/TerminalView").then((m) => ({
    default: m.TerminalView,
  })),
);
const MonetizationDashboard = lazy(() =>
  import("@/components/isabella/MonetizationDashboard").then((m) => ({
    default: m.MonetizationDashboard,
  })),
);
const QuantumUtilityDashboard = lazy(() =>
  import("@/components/isabella/QuantumUtilityDashboard").then((m) => ({
    default: m.QuantumUtilityDashboard,
  })),
);
const AiInterfacesHub = lazy(() =>
  import("@/components/isabella/AiInterfacesHub").then((m) => ({
    default: m.AiInterfacesHub,
  })),
);
const LatamAegisDashboard = lazy(() =>
  import("@/components/isabella/LatamAegisDashboard").then((m) => ({
    default: m.LatamAegisDashboard,
  })),
);
const CognitiveStatusDashboard = lazy(() =>
  import("@/components/isabella/CognitiveStatusDashboard").then((m) => ({
    default: m.CognitiveStatusDashboard,
  })),
);
const FindarepoDashboard = lazy(() =>
  import("@/components/isabella/FindarepoDashboard").then((m) => ({
    default: m.FindarepoDashboard,
  })),
);
const VideoEngineXDashboard = lazy(() =>
  import("@/components/isabella/VideoEngineXDashboard").then((m) => ({
    default: m.VideoEngineXDashboard,
  })),
);

const INTRO_SEEN_KEY = "isabella.entry.intro.v1";

type NavModule = typeof import("@/components/isabella/CrystalNavigation");

function ClientFallback({ label = "Cargando módulo Isabella…" }: { label?: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-border/20 bg-background/40">
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto mb-4 size-9 animate-pulse rounded-full border border-electric/40 bg-electric/10" />
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

function IndexClient() {
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    try {
      setIntroDone(window.sessionStorage.getItem(INTRO_SEEN_KEY) === "1");
    } catch {
      setIntroDone(false);
    }
  }, []);

  const handleIntroComplete = useCallback(() => {
    try {
      window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // Storage may be unavailable; the UI remains functional.
    }
    setIntroDone(true);
  }, []);

  if (!introDone) {
    return (
      <Suspense fallback={<ClientFallback label="Inicializando experiencia Isabella…" />}>
        <CinematicIntro onComplete={handleIntroComplete} />
      </Suspense>
    );
  }
  return <IsabellaInterface />;
}

function IsabellaInterface() {
  const isabella = useIsabella();
  const [panel, setPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTabId>("terminal");
  const [monetizationSubTab, setMonetizationSubTab] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [upperOpen, setUpperOpen] = useState(false);
  const [middleOpen, setMiddleOpen] = useState(false);
  const [lowerOpen, setLowerOpen] = useState(false);
  const [navModule, setNavModule] = useState<NavModule | null>(null);
  const lastInput = useRef<{
    text: string;
    attachments: Parameters<typeof isabella.send>[1];
    config?: Parameters<typeof isabella.send>[2];
  }>({ text: "", attachments: [] });
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    void import("@/components/isabella/CrystalNavigation").then((module) => {
      if (active) setNavModule(module);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleMonetizationNavigate = useCallback((subTab: string) => {
    setActiveTab("monetization");
    setMonetizationSubTab(subTab);
    try {
      window.history.replaceState(null, "", `#monetization-${subTab}`);
    } catch {
      // URL history is non-critical to the application runtime.
    }
  }, []);

  const send = useCallback(
    (
      text: string,
      attachments: Parameters<typeof isabella.send>[1] = [],
      config?: Parameters<typeof isabella.send>[2],
    ) => {
      lastInput.current = { text, attachments, config };
      void isabella.send(text, attachments, config);
    },
    [isabella],
  );

  if (!navModule) return <ClientFallback label="Cargando navegación soberana…" />;

  const navGroups = navModule.NAV_GROUPS(
    { cognition: upperOpen, catalog: middleOpen, sovereignty: lowerOpen },
    (id) => {
      if (id === "cognition") setUpperOpen((open) => !open);
      else if (id === "catalog") setMiddleOpen((open) => !open);
      else if (id === "sovereignty") setLowerOpen((open) => !open);
    },
  );

  return (
    <Suspense fallback={<ClientFallback />}>
      <div className="relative flex min-h-screen bg-background text-foreground transition-all duration-300">
        <Starfield />

        <aside
          id="isabella-sidebar"
          className={`glass sticky top-0 z-30 flex h-screen flex-col justify-between border-r border-border/20 transition-all duration-300 ease-out ${
            isSidebarOpen ? "w-[310px]" : "w-[75px]"
          }`}
          aria-label="Navegación Isabella"
        >
          <div className="flex flex-1 select-none flex-col overflow-x-hidden overflow-y-auto">
            <div className="flex shrink-0 flex-col items-center justify-center border-b border-border/15 p-4">
              <div className="group relative">
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-electric via-iris to-pearl opacity-40 blur-md transition-all duration-500 group-hover:opacity-75" />
                <img
                  src="/favicon.png"
                  alt="Isabella Logo"
                  className={`relative rounded-xl border border-border/40 object-cover transition-all duration-300 ease-out ${
                    isSidebarOpen ? "size-18" : "size-10"
                  }`}
                  width={isSidebarOpen ? 72 : 40}
                  height={isSidebarOpen ? 72 : 40}
                />
              </div>
              {isSidebarOpen && (
                <div className="mt-3 animate-rise text-center">
                  <h2 className="font-display text-[16px] font-bold tracking-wide text-iridescent">
                    Isabella Villaseñor AI
                  </h2>
                  <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.24em] text-muted-foreground">
                    Contexto, límites y decisión humana
                  </p>
                </div>
              )}
            </div>

            <CrystalNavigation
              groups={navGroups}
              activeTab={activeTab}
              onSelect={setActiveTab}
              collapsed={!isSidebarOpen}
            />
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-border/15 p-3">
            {isSidebarOpen && (
              <div className="flex flex-col gap-1.5 rounded-2xl border border-border/20 bg-secondary/15 p-2 font-mono text-[10.5px] animate-rise">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Operador:</span>
                  <span className="max-w-[120px] truncate font-semibold text-platinum">
                    Soberano
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Región:</span>
                  <span className="font-semibold text-platinum">Nodo 0 (Hgo)</span>
                </div>
              </div>
            )}
            <button
              type="button"
              aria-expanded={isSidebarOpen}
              aria-controls="isabella-sidebar"
              onClick={() => setIsSidebarOpen((open) => !open)}
              className="flex w-full items-center justify-center rounded-xl border border-border/30 bg-secondary/25 p-2 text-muted-foreground transition-all hover:bg-secondary/45 hover:text-platinum crystal-glow-electric"
            >
              {isSidebarOpen ? (
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                  <ChevronLeft className="size-4" /> Contraer Panel
                </span>
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          </div>
        </aside>

        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <header className="hairline shrink-0 bg-background/40 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 px-6 py-3.5 sm:px-8">
              <div className="flex items-center gap-3">
                <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                <div>
                  <h1 className="font-mono text-[13px] font-bold uppercase leading-none tracking-wider text-platinum">
                    Isabella C.R.O.W.N. Terminal
                  </h1>
                  <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-widest text-muted-foreground">
                    {activeTab === "terminal" &&
                      `                    Canal gobernado: ${isabella.preset.name} · Decisión humana`}
                    {activeTab === "cli" && "Consola Retro Directa"}
                    {activeTab === "governance" && "Gobernanza y Salud de Módulos Cognitivos"}
                    {activeTab === "catalog" && "Gobernanza de APIs e Invocaciones"}
                    {activeTab === "monetization" && "Tablero de Consumo Soberano"}
                    {activeTab === "quantum" && "Optimización y Transpilación Cuántica (qup)"}
                    {activeTab === "interfaces" && "Interfaces de Inteligencia Artificial"}
                    {activeTab === "aegis" && "Muro de Defensa Activa LATAM AEGIS-X"}
                    {activeTab === "findarepo" && "Ranking Global de Agentes (Findarepo)"}
                  </p>
                </div>
              </div>

              {activeTab === "terminal" && (
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json"
                    className="sr-only"
                    aria-label="Abrir conversación JSON"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void isabella.openConversation(file).catch(() => undefined);
                    }}
                  />
                  <button
                    type="button"
                    onClick={isabella.downloadConversation}
                    className="flex items-center gap-1.5 rounded-xl border border-border/30 bg-secondary/15 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-all hover:bg-secondary/35 hover:text-platinum crystal-glow-electric"
                  >
                    <Download className="size-3" /> Descargar
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-xl border border-border/30 bg-secondary/15 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-all hover:bg-secondary/35 hover:text-platinum crystal-glow-electric"
                  >
                    <FolderOpen className="size-3" /> Reabrir
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel((open) => !open)}
                    className="rounded-xl border border-border/30 bg-secondary/15 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-all hover:bg-secondary/35 hover:text-platinum lg:hidden crystal-glow-electric"
                  >
                    {panel ? "Cerrar" : "Telemetría"}
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {activeTab === "terminal" && (
              <div className="mx-auto grid h-full max-w-[1450px] items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
                <section className="flex min-w-0 flex-col gap-4">
                  <div className="glass min-h-[56vh] flex-1 overflow-y-auto rounded-3xl p-1 crystal-glow-electric">
                    <MessageStream
                      messages={isabella.messages}
                      onRetry={() => {
                        const retry = lastInput.current;
                        if (retry.text) send(retry.text, retry.attachments, retry.config);
                      }}
                    />
                  </div>
                  <div className="rounded-2xl crystal-glow-electric">
                    <CommandLine
                      onSend={send}
                      onStop={isabella.stop}
                      onReset={isabella.reset}
                      isProcessing={isabella.isProcessing}
                    />
                  </div>
                </section>
                <div
                  className={`${panel ? "block animate-rise" : "hidden lg:block"} flex flex-col gap-4`}
                >
                  <RightRails
                    presetId={isabella.presetId}
                    setPresetId={isabella.setPresetId}
                    decision={isabella.decision}
                    isProcessing={isabella.isProcessing}
                    onMonetizationNavigate={handleMonetizationNavigate}
                  />
                </div>
              </div>
            )}

            {activeTab === "cli" && (
              <div className="mx-auto max-w-[1300px] overflow-hidden rounded-3xl crystal-glow-electric">
                <TerminalView />
              </div>
            )}
            {activeTab === "governance" && (
              <div className="mx-auto max-w-[1300px]">
                <CognitiveStatusDashboard />
              </div>
            )}
            {activeTab === "catalog" && (
              <div className="mx-auto max-w-[1300px] overflow-hidden rounded-3xl crystal-glow-crown">
                <ApiCatalogExplorer />
              </div>
            )}
            {activeTab === "monetization" && (
              <div className="mx-auto max-w-[1300px] overflow-hidden rounded-3xl crystal-glow-emerald">
                <MonetizationDashboard initialTab={monetizationSubTab} />
              </div>
            )}
            {activeTab === "quantum" && (
              <div className="mx-auto max-w-[1300px] overflow-hidden rounded-3xl crystal-glow-crown">
                <QuantumUtilityDashboard />
              </div>
            )}
            {activeTab === "interfaces" && (
              <div className="mx-auto max-w-[1300px] overflow-hidden rounded-3xl crystal-glow-crown">
                <AiInterfacesHub />
              </div>
            )}
            {activeTab === "aegis" && (
              <div className="mx-auto max-w-[1300px] overflow-hidden rounded-3xl crystal-glow-crown">
                <LatamAegisDashboard />
              </div>
            )}
            {activeTab === "findarepo" && (
              <div className="mx-auto h-[85vh] max-w-[1300px] overflow-hidden rounded-3xl crystal-glow-electric">
                <FindarepoDashboard />
              </div>
            )}
            {activeTab === "video-x" && (
              <div className="mx-auto max-w-[1300px] overflow-hidden rounded-3xl crystal-glow-electric">
                <VideoEngineXDashboard />
              </div>
            )}
          </main>
        </div>
      </div>
    </Suspense>
  );
}

export default IndexClient;
