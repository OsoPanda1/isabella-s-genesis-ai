import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, SkipForward, Volume2, VolumeX } from "lucide-react";

const DURATION = 59;
const TARGET_FPS = 60;
const FALLBACK_BACKDROP = "/assets/isabella-intro-backdrop.png";

export interface TelemetryPayload {
  elapsed: number;
  progress: number;
  sceneStage: string;
  fps: number;
  droppedFrames: number;
}

interface IntroMediaConfig {
  enabled?: boolean;
  playbackId?: string;
  metadata?: {
    title?: string;
    duration?: number;
    aspectRatio?: string;
  };
  fallback?: {
    type?: "static" | "procedural" | "none";
    url?: string;
  };
}

interface CinematicIntroProps {
  onComplete: () => void;
  onTelemetryUpdate?: (data: TelemetryPayload) => void;
}

const scenes = [
  {
    end: 10,
    kicker: "REAL DEL MONTE · HIDALGO // NODO CERO",
    title: "La inteligencia empieza escuchando.",
    body: "Isabella Villaseñor AI coordina contexto, memoria y herramientas bajo decisión humana.",
  },
  {
    end: 20,
    kicker: "CROWN // ORQUESTACIÓN CON TRAZABILIDAD",
    title: "Cada respuesta tiene un porqué.",
    body: "La percepción se convierte en contexto, política, decisión y registro auditable.",
  },
  {
    end: 30,
    kicker: "ARGUS // GOBERNANZA ZERO TRUST",
    title: "La capacidad no está por encima del cuidado.",
    body: "Si una acción implica riesgo, Isabella detiene el flujo y solicita aprobación.",
  },
  {
    end: 40,
    kicker: "ISA · SOPHIA · ORION // ROLES SEPARADOS",
    title: "Distintas funciones. Una responsabilidad.",
    body: "Presencia, razonamiento y ejecución trabajan con límites explícitos, no con promesas vacías.",
  },
  {
    end: 50,
    kicker: "SOBERANÍA TERRITORIAL // CONTEXTO LOCAL",
    title: "El territorio no es un dato más.",
    body: "La memoria local, la procedencia y la incertidumbre se conservan antes de generalizar.",
  },
  {
    end: DURATION + 1,
    kicker: "ISABELLA VILLASEÑOR AI // LISTA PARA COLABORAR",
    title: "Tú decides. Isabella ayuda a ver mejor.",
    body: "No soy una autoridad ni una persona: soy una interfaz cognitiva gobernada para pensar contigo.",
  },
] as const;

export function CinematicIntroContent({ onComplete, onTelemetryUpdate }: CinematicIntroProps) {
  const [showGate, setShowGate] = useState(true);
  const [muted, setMuted] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fps, setFps] = useState(TARGET_FPS);
  const [media, setMedia] = useState<IntroMediaConfig>({
    fallback: { type: "static", url: FALLBACK_BACKDROP },
  });
  const completedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clockRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const telemetryRef = useRef(onTelemetryUpdate);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    telemetryRef.current = onTelemetryUpdate;
  }, [onComplete, onTelemetryUpdate]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/mux-intro", {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
      credentials: "same-origin",
    })
      .then(async (response) => {
        const payload = (await response.json()) as IntroMediaConfig;
        if (response.ok || response.status === 503) setMedia(payload);
      })
      .catch(() => {
        setMediaFailed(true);
        setMediaReady(true);
      });
    return () => controller.abort();
  }, []);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    videoRef.current?.pause();
    onCompleteRef.current();
  }, []);

  const enter = useCallback(() => {
    if (completedRef.current) return;
    setShowGate(false);
    setElapsed(0);
    clockRef.current = performance.now();

    const video = videoRef.current;
    if (!video || mediaFailed) return;
    video.muted = muted;
    void video
      .play()
      .then(() => setMediaReady(true))
      .catch(() => {
        setMediaFailed(true);
        setMediaReady(true);
      });
  }, [mediaFailed, muted]);

  const handleMediaError = useCallback(() => {
    setMediaFailed(true);
    setMediaReady(true);
  }, []);

  useEffect(() => {
    if (showGate) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      const timer = window.setTimeout(complete, 600);
      return () => window.clearTimeout(timer);
    }

    let frame = 0;
    let last = performance.now();
    let frames = 0;
    const tick = (now: number) => {
      frames += 1;
      const current = Math.min(DURATION, Math.max(0, (now - clockRef.current) / 1000));
      setElapsed(current);
      if (now - last >= 1000) {
        const measured = Math.round((frames * 1000) / (now - last));
        setFps(measured);
        const scene = scenes.find((item) => current < item.end) ?? scenes[scenes.length - 1];
        telemetryRef.current?.({
          elapsed: current,
          progress: current / DURATION,
          sceneStage: scene.kicker,
          fps: measured,
          droppedFrames: Math.max(0, TARGET_FPS - measured),
        });
        frames = 0;
        last = now;
      }
      if (current >= DURATION) complete();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [complete, showGate]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (showGate && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        enter();
      } else if (!showGate && event.key === "Escape") {
        event.preventDefault();
        complete();
      } else if (!showGate && event.key.toLowerCase() === "m") setMuted((value) => !value);
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [complete, enter, showGate]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const scene = useMemo(
    () => scenes.find((item) => elapsed < item.end) ?? scenes[scenes.length - 1],
    [elapsed],
  );
  const progress = Math.min(1, elapsed / DURATION);
  const timecode = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(elapsed % 60)
    .toString()
    .padStart(2, "0")}`;
  const fallbackUrl =
    media.fallback?.type === "static"
      ? (media.fallback.url ?? FALLBACK_BACKDROP)
      : FALLBACK_BACKDROP;
  const playbackUrl =
    media.playbackId && !mediaFailed
      ? `https://stream.mux.com/${encodeURIComponent(media.playbackId)}/high.mp4`
      : undefined;

  return (
    <section
      aria-labelledby="isabella-cinematic-title"
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#020a0d",
      }}
    >
      {playbackUrl ? (
        <video
          ref={videoRef}
          className="absolute inset-0 size-full object-cover"
          src={playbackUrl}
          autoPlay={false}
          muted={muted}
          playsInline
          preload="metadata"
          onCanPlay={() => setMediaReady(true)}
          onLoadedData={() => setMediaReady(true)}
          onError={handleMediaError}
          aria-hidden="true"
        />
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(2,10,13,.72), rgba(10,22,40,.94)), url("${fallbackUrl}")`,
          }}
          aria-hidden="true"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(0,0,0,.38)_62%,rgba(0,0,0,.9)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[9vh] bg-black/75" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[9vh] bg-black/75" />

      {!showGate && (
        <>
          <header className="absolute inset-x-8 top-[11vh] z-20 flex items-center justify-between text-[10px] uppercase tracking-[.35em] text-white/55 sm:inset-x-12">
            <span>{scene.kicker}</span>
            <span className="hidden items-center gap-3 sm:flex">
              <span>{fps} FPS</span>
              <span className="text-white/25">//</span>
              <span>{timecode} / 00:59</span>
            </span>
          </header>
          <div className="absolute inset-0 z-10 flex items-center px-8 sm:px-16 lg:px-24">
            <div
              key={scene.title}
              className="max-w-4xl"
              style={{ animation: "reveal 1s cubic-bezier(.16,1,.3,1) both" }}
            >
              <p className="mb-5 text-[10px] font-semibold uppercase tracking-[.45em] text-cyan-100/75 sm:text-xs">
                {scene.kicker}
              </p>
              <h1
                id="isabella-cinematic-title"
                className="max-w-4xl text-4xl font-black leading-[.92] tracking-[-.055em] text-white sm:text-6xl md:text-8xl"
              >
                {scene.title}
              </h1>
              <p className="mt-7 max-w-xl border-l border-cyan-200/50 pl-4 text-sm leading-relaxed tracking-wide text-white/60 sm:text-base">
                {scene.body}
              </p>
            </div>
          </div>
          <footer className="absolute inset-x-8 bottom-[11vh] z-20 sm:inset-x-12">
            <div className="mb-3 flex items-center justify-between text-[9px] uppercase tracking-[.3em] text-white/40">
              <span>ISABELLA // GENESIS</span>
              <button
                type="button"
                onClick={complete}
                className="rounded px-2 py-1 transition-colors hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/70"
              >
                Omitir intro <SkipForward className="ml-1 inline size-3" />
              </button>
            </div>
            <div
              className="h-px overflow-hidden bg-white/15"
              role="progressbar"
              aria-label="Progreso de la introducción"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div
                className="h-full bg-cyan-200 shadow-[0_0_14px_rgba(120,220,255,.8)]"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </footer>
        </>
      )}

      {showGate && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#03050a]/70 px-6 backdrop-blur-[2px]">
          <div
            className="w-full max-w-xl text-center"
            style={{ animation: "reveal 1.2s cubic-bezier(.16,1,.3,1) both" }}
          >
            <div className="mx-auto mb-8 flex size-24 items-center justify-center rounded-full border border-cyan-100/25 bg-black/35 shadow-[0_0_70px_rgba(65,196,255,.2),inset_0_0_25px_rgba(119,83,255,.2)]">
              <div className="size-3 rounded-full bg-cyan-100 shadow-[0_0_20px_8px_rgba(103,224,255,.7)]" />
            </div>
            <p className="text-[10px] uppercase tracking-[.5em] text-cyan-100/65">
              TAMV ONLINE // PRÓLOGO DE SISTEMA
            </p>
            <h2 className="mt-5 text-5xl font-black tracking-[-.06em] text-white sm:text-7xl">
              ISABELLA<span className="text-cyan-100">.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/60">
              Una interfaz cognitiva territorial. Contexto antes que certeza; humano antes que
              automatismo.
            </p>
            <p className="mx-auto mt-3 max-w-sm text-[10px] uppercase tracking-[.18em] text-white/35">
              Sin acciones externas sin autorización · Sin memoria sin procedencia
            </p>
            <div
              className="mx-auto mt-7 flex max-w-xs items-center justify-center gap-2 text-[9px] uppercase tracking-[.28em] text-white/35"
              aria-live="polite"
            >
              <span
                className={`size-1.5 rounded-full ${mediaReady ? "bg-cyan-200 shadow-[0_0_10px_3px_rgba(117,224,255,.55)]" : "bg-white/25"}`}
              />
              {playbackUrl
                ? mediaReady
                  ? "Canal visual listo"
                  : "Preparando canal visual"
                : mediaFailed
                  ? "Respaldo visual activo"
                  : "Modo de respaldo listo"}
            </div>
            <button
              type="button"
              onClick={enter}
              aria-label="Iniciar la experiencia cinematográfica"
              className="mx-auto mt-9 flex items-center gap-3 border border-cyan-100/35 bg-white/[.06] px-7 py-4 text-[10px] font-semibold uppercase tracking-[.35em] text-white transition-all hover:border-cyan-100 hover:bg-cyan-100/10 active:scale-95"
            >
              <Play className="size-4 fill-current text-cyan-100" /> Iniciar experiencia
            </button>
            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              className="mt-6 inline-flex items-center gap-2 text-[10px] uppercase tracking-[.25em] text-white/35 transition-colors hover:text-white/75"
            >
              {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              {muted ? "Audio desactivado" : "Audio activado"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function CinematicIntro(props: CinematicIntroProps) {
  return <CinematicIntroContent {...props} />;
}
