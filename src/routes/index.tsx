import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FolderOpen } from "lucide-react";
import CinematicIntro from "@/components/isabella/CinematicIntro";
import { CommandLine } from "@/components/isabella/CommandLine";
import { MessageStream } from "@/components/isabella/MessageStream";
import { RightRails } from "@/components/isabella/RightRails";
import { Starfield } from "@/components/isabella/Starfield";
import {
  CrystalNavigation,
  NAV_GROUPS,
  type NavTabId,
} from "@/components/isabella/CrystalNavigation";
import { ApiCatalogExplorer } from "@/components/isabella/ApiCatalogExplorer";
import { TerminalView } from "@/components/isabella/TerminalView";
import { MonetizationDashboard } from "@/components/isabella/MonetizationDashboard";
import { QuantumUtilityDashboard } from "@/components/isabella/QuantumUtilityDashboard";
import { AiInterfacesHub } from "@/components/isabella/AiInterfacesHub";
import { LatamAegisDashboard } from "@/components/isabella/LatamAegisDashboard";
import { CognitiveStatusDashboard } from "@/components/isabella/CognitiveStatusDashboard";
import { FindarepoDashboard } from "@/components/isabella/FindarepoDashboard";
import { useIsabella } from "@/lib/useIsabella";

const TITLE = "Isabella Villaseñor AI — Terminal Cognitivo C.R.O.W.N.";
const DESC =
  "Terminal cognitivo de Isabella Villaseñor AI: orquestación C.R.O.W.N. con ISA, SOPHIA, ORION y ARGUS, Policy Gate en vivo y telemetría desde Nodo Cero, Real del Monte, Hidalgo.";

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
 * Puerta de entrada: muestra la intro cinemática (con recuadro de autorización
 * de autoplay) al ingresar a la app. Al terminar (onComplete), revela la
 * interfaz de Isabella. La intro se reproduce una vez por sesión de pestaña
 * (sessionStorage) para que al recargar dentro de la misma pestaña no se repita,
 * pero sí vuelve a mostrarse en un nuevo ingreso.
 */
const INTRO_SEEN_KEY = "isabella.entry.intro.v1";

function Index() {
  const [introDone, setIntroDone] = useState(false);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setClientReady(true);
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
      /* almacenamiento no disponible: la intro se re-muestra en la próxima carga */
    }
    setIntroDone(true);
  }, []);

  if (!clientReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto mb-4 size-10 animate-pulse rounded-full border border-electric/40 bg-electric/10" />
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Sincronizando núcleo C.R.O.W.N.
          </p>
        </div>
      </main>
    );
  }

  if (!introDone) return <CinematicIntro onComplete={handleIntroComplete} />;
  return <IsabellaInterface />;
}

function IsabellaInterface() {
  const isabella = useIsabella();
  const [panel, setPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTabId>("terminal");
  const [monetizationSubTab, setMonetizationSubTab] = useState<string | null>(null);

  const handleMonetizationNavigate = (subTab: string) => {
    setActiveTab("monetization");
    setMonetizationSubTab(subTab);
    // deep-link hash para trazabilidad y bookmark
    try {
      window.history.replaceState(null, "", `#monetization-${subTab}`);
    } catch (e) {
      void e;
    }
  };

  // Sidebar State for 3-part retractable accordions
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [upperOpen, setUpperOpen] = useState(false);
  const [middleOpen, setMiddleOpen] = useState(false);
  const [lowerOpen, setLowerOpen] = useState(false);

  const navGroups = NAV_GROUPS(
    { cognition: upperOpen, catalog: middleOpen, sovereignty: lowerOpen },
    (id) => {
      if (id === "cognition") setUpperOpen((o) => !o);
      else if (id === "catalog") setMiddleOpen((o) => !o);
      else if (id === "sovereignty") setLowerOpen((o) => !o);
    },
  );

  const lastInput = useRef("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const send = (text: string) => {
    lastInput.current = text;
    void isabella.send(text);
  };

  return (
    <div className="relative min-h-screen flex bg-background text-foreground transition-all duration-300">
      {/* Starfield atmosférico de fondo (1.000 micro-estrellas marfil/platino) */}
      <Starfield />

      {/* ==============================================================
          CANONICAL 3-PART RETRACTABLE LEFT SIDEBAR WITH CRYSTAL GLOWS
         ============================================================== */}
      <aside
        id="isabella-sidebar"
        className={`glass h-screen sticky top-0 z-30 flex flex-col justify-between border-r border-border/20 transition-all duration-300 ease-in-out ${
          isSidebarOpen ? "w-[310px]" : "w-[75px]"
        }`}
      >
        <div className="flex flex-col overflow-y-auto overflow-x-hidden flex-1 select-none">
          {/* Logo & Brand block */}
          <div className="p-4 border-b border-border/15 flex flex-col items-center justify-center shrink-0">
            <div className="relative group">
              {/* Outer logo glowing ring */}
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-electric via-iris to-pearl opacity-40 blur-md group-hover:opacity-75 transition-all duration-500" />
              <img
                src="/favicon.png"
                alt="Isabella Logo"
                className={`relative rounded-xl border border-border/40 object-cover transition-all duration-300 ${
                  isSidebarOpen ? "size-18" : "size-10"
                }`}
                referrerPolicy="no-referrer"
              />
            </div>
            {isSidebarOpen && (
              <div className="mt-3 text-center animate-rise">
                <h2 className="text-iridescent font-display text-[16px] font-bold tracking-wide">
                  Isabella Villaseñor AI
                </h2>
                <p className="font-mono text-[8px] uppercase tracking-[0.24em] text-muted-foreground mt-0.5">
                  Nacimos para guiar, no para explotar
                </p>
              </div>
            )}
          </div>

          {/* Crystal accordion navigation (estados, selección, teclado, ARIA) */}
          <CrystalNavigation
            groups={navGroups}
            activeTab={activeTab}
            onSelect={setActiveTab}
            collapsed={!isSidebarOpen}
          />
        </div>

        {/* Sidebar Footer & Toggle Collapse controller */}
        <div className="p-3 border-t border-border/15 shrink-0 flex flex-col gap-2">
          {isSidebarOpen && (
            <div className="flex flex-col gap-1.5 p-2 bg-secondary/15 rounded-2xl border border-border/20 text-[10.5px] font-mono animate-rise">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Operador:</span>
                <span className="text-platinum truncate max-w-[120px] font-semibold">Soberano</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Región:</span>
                <span className="text-platinum font-semibold">Nodo 0 (Hgo)</span>
              </div>
            </div>
          )}

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center justify-center p-2 rounded-xl bg-secondary/25 hover:bg-secondary/45 text-muted-foreground hover:text-platinum transition-all border border-border/30 crystal-glow-electric"
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

      {/* ==============================================================
          MAIN CONTENT VIEWPORT
         ============================================================== */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        {/* Modern compact Header bar */}
        <header className="hairline bg-background/40 backdrop-blur-xl shrink-0 z-20">
          <div className="flex items-center justify-between gap-4 px-6 py-3.5 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <h1 className="text-platinum font-mono text-[13px] font-bold uppercase tracking-wider leading-none">
                  Isabella C.R.O.W.N. Terminal
                </h1>
                <p className="text-[9.5px] text-muted-foreground font-mono mt-0.5 uppercase tracking-widest">
                  {activeTab === "terminal" && `Conexión Activa: ${isabella.preset.name}`}
                  {activeTab === "cli" && "Consola Retro Directa"}
                  {activeTab === "governance" && "Gobernanza y Salud de Módulos Cognitivos"}
                  {activeTab === "catalog" && "Gobernanza de APIs e Invocaciones"}
                  {activeTab === "monetization" && "Tablero de Consumo Soberano"}
                  {activeTab === "quantum" && "Optimización y Transpilación Cuántica (qup)"}
                  {activeTab === "aegis" && "Muro de Defensa Activa LATAM AEGIS-X"}
                  {activeTab === "findarepo" && "Ranking Global de Agentes (Findarepo)"}
                </p>
              </div>
            </div>

            {/* Conversation actions (Rendered only on terminal tab) */}
            <div className="flex items-center gap-2">
              {activeTab === "terminal" && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void isabella.openConversation(file).catch(() => {});
                    }}
                  />
                  <button
                    onClick={isabella.downloadConversation}
                    className="rounded-xl border border-border/30 bg-secondary/15 hover:bg-secondary/35 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-all hover:text-platinum flex items-center gap-1.5 crystal-glow-electric"
                  >
                    <Download className="size-3" /> Descargar
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="rounded-xl border border-border/30 bg-secondary/15 hover:bg-secondary/35 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-all hover:text-platinum flex items-center gap-1.5 crystal-glow-electric"
                  >
                    <FolderOpen className="size-3" /> Reabrir
                  </button>
                  <button
                    onClick={() => setPanel((p) => !p)}
                    className="rounded-xl border border-border/30 bg-secondary/15 hover:bg-secondary/35 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-all hover:text-platinum lg:hidden crystal-glow-electric"
                  >
                    {panel ? "Cerrar" : "Telemetría"}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content Body Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {activeTab === "terminal" && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px] items-stretch h-full max-w-[1450px] mx-auto">
              <section className="flex min-w-0 flex-col gap-4">
                <div className="glass min-h-[56vh] flex-1 overflow-y-auto rounded-3xl p-1 crystal-glow-electric">
                  <MessageStream
                    messages={isabella.messages}
                    onRetry={() => lastInput.current && send(lastInput.current)}
                  />
                </div>
                <div className="crystal-glow-electric rounded-2xl">
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
            <div className="animate-rise max-w-[1300px] mx-auto crystal-glow-electric rounded-3xl overflow-hidden">
              <TerminalView />
            </div>
          )}

          {activeTab === "governance" && (
            <div className="animate-rise max-w-[1300px] mx-auto">
              <CognitiveStatusDashboard />
            </div>
          )}

          {activeTab === "catalog" && (
            <div className="animate-rise max-w-[1300px] mx-auto crystal-glow-crown rounded-3xl overflow-hidden">
              <ApiCatalogExplorer />
            </div>
          )}

          {activeTab === "monetization" && (
            <div className="animate-rise max-w-[1300px] mx-auto crystal-glow-emerald rounded-3xl overflow-hidden">
              <MonetizationDashboard initialTab={monetizationSubTab} />
            </div>
          )}

          {activeTab === "quantum" && (
            <div className="animate-rise max-w-[1300px] mx-auto crystal-glow-crown rounded-3xl overflow-hidden">
              <QuantumUtilityDashboard />
            </div>
          )}

          {activeTab === "interfaces" && (
            <div className="animate-rise max-w-[1300px] mx-auto crystal-glow-crown rounded-3xl overflow-hidden">
              <AiInterfacesHub />
            </div>
          )}

          {activeTab === "aegis" && (
            <div className="animate-rise max-w-[1300px] mx-auto crystal-glow-crown rounded-3xl overflow-hidden">
              <LatamAegisDashboard />
            </div>
          )}

          {activeTab === "findarepo" && (
            <div className="animate-rise max-w-[1300px] mx-auto crystal-glow-electric rounded-3xl overflow-hidden h-[85vh]">
              <FindarepoDashboard />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
