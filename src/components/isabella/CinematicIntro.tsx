import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import * as THREE from "three";
import { Volume2, VolumeX, SkipForward, Play, Activity } from "lucide-react";

const TARGET_FPS = 60;
const DURATION = 59; // Duración total en segundos

export interface TelemetryPayload {
  elapsed: number;
  progress: number;
  sceneStage: string;
  fps: number;
  droppedFrames: number;
}

interface CinematicIntroProps {
  onComplete: () => void;
  remoteAudioUrl?: string;
  onTelemetryUpdate?: (data: TelemetryPayload) => void;
}

// -----------------------------------------------------------------------------
// 1. MOTOR GRÁFICO WEBGL (Crystal World Engine)
// -----------------------------------------------------------------------------
function CrystalWorldEngine({
  progress,
  masterClock,
}: {
  progress: number;
  masterClock: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Escena y Cámara
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#04060a");
    scene.fog = new THREE.FogExp2("#04060a", 0.0015);

    const camera = new THREE.PerspectiveCamera(
      34,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1600
    );
    camera.position.set(0, 0, 260);

    // Renderer Optimizado
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const world = new THREE.Group();
    scene.add(world);

    // Geometrías Complejas
    const coreGeo = new THREE.IcosahedronGeometry(54, 4);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#a3c7ff"),
      emissive: new THREE.Color("#1e3b66"),
      emissiveIntensity: 2.1,
      metalness: 0.8,
      roughness: 0.12,
      transmission: 0.3,
      transparent: true,
      opacity: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    world.add(core);

    const shellGeo = new THREE.IcosahedronGeometry(78, 2);
    const shellMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#5eb3ff"),
      wireframe: true,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    world.add(shell);

    const haloGeo = new THREE.TorusGeometry(95, 1.2, 16, 180);
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#b28dff"),
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2.6;
    world.add(halo);

    // Sistema de Partículas Volumétricas
    const particleCount = 2400;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const radius = 100 + Math.random() * 500;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const color = new THREE.Color().setHSL(
        0.55 + Math.random() * 0.18,
        0.7,
        0.6 + Math.random() * 0.25
      );
      colors.set([color.r, color.g, color.b], i * 3);
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 2.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Iluminación Dinámica
    scene.add(new THREE.AmbientLight("#8caed6", 1.2));
    const keyLight = new THREE.PointLight("#62b0ff", 220, 800);
    keyLight.position.set(-200, 150, 250);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight("#9b73ff", 240, 700);
    rimLight.position.set(200, -120, 180);
    scene.add(rimLight);

    // Manejo de Redimensionamiento
    const handleResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(mount);

    // Render Loop vinculado al Master Clock
    let animId: number;
    const renderFrame = () => {
      const t = masterClock;
      world.rotation.y = t * 0.25 + progress * Math.PI * 2;
      world.rotation.x = Math.sin(t * 0.3) * 0.15;
      shell.rotation.y = -t * 0.15;
      halo.rotation.z = t * 0.2;
      particles.rotation.y = -t * 0.05;

      renderer.render(scene, camera);
      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);

    // Garbage Collection / Disposición de Memoria GPU
    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();

      coreGeo.dispose();
      coreMat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();

      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [progress, masterClock]);

  return <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />;
}

// -----------------------------------------------------------------------------
// 2. COMPONENTE PRINCIPAL (Orquestador Cinematográfico Local)
// -----------------------------------------------------------------------------
export function CinematicIntroContent({
  onComplete,
  remoteAudioUrl = "/assets/background-audio.mp3",
  onTelemetryUpdate,
}: CinematicIntroProps) {
  const [showGate, setShowGate] = useState(true);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [bitrateTelemetry, setBitrateTelemetry] = useState({
    fps: TARGET_FPS,
    droppedFrames: 0,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clockStartRef = useRef<number>(0);

  // Inicialización del pipeline Web Audio API
  const initAudioPipeline = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
  }, []);

  const enter = useCallback(() => {
    initAudioPipeline();
    setShowGate(false);
    clockStartRef.current = performance.now();

    if (!muted && audioRef.current) {
      audioRef.current.play().catch(() => setMuted(true));
    }
  }, [initAudioPipeline, muted]);

  // Loop principal de animación + Telemetría Federada
  useEffect(() => {
    if (showGate) return;

    let animFrame: number;
    let lastTime = performance.now();
    let frameCounter = 0;

    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      const currentElapsed = Math.min(
        DURATION,
        (now - clockStartRef.current) / 1000
      );

      setElapsed(currentElapsed);

      frameCounter++;
      if (delta >= 1.0) {
        const measuredFps = Math.round((frameCounter * 1000) / (now - lastTime));
        const dropped = Math.max(0, TARGET_FPS - measuredFps);

        const currentTelemetry = { fps: measuredFps, droppedFrames: dropped };
        setBitrateTelemetry(currentTelemetry);

        // Notificación de Telemetría externa (Callback + Bus de Eventos Federado)
        const progressVal = currentElapsed / DURATION;
        const currentStage =
          currentElapsed < 19
            ? "STAGE 01 · ORIGIN FIELD"
            : currentElapsed < 39
            ? "STAGE 02 · TERRITORIAL MEMORY"
            : "STAGE 03 · SOVEREIGN CRYSTAL";

        const payload: TelemetryPayload = {
          elapsed: currentElapsed,
          progress: progressVal,
          sceneStage: currentStage,
          fps: measuredFps,
          droppedFrames: dropped,
        };

        onTelemetryUpdate?.(payload);

        window.dispatchEvent(
          new CustomEvent("IsabellaTelemetryEvent", { detail: payload })
        );

        frameCounter = 0;
        lastTime = now;
      }

      if (currentElapsed >= DURATION) {
        onComplete();
      } else {
        animFrame = requestAnimationFrame(tick);
      }
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, [showGate, onComplete, onTelemetryUpdate]);

  // Teclas de acceso rápido
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showGate && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        enter();
      } else if (!showGate) {
        if (e.key === "Escape") onComplete();
        if (e.key === "m" || e.key === "M") setMuted((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enter, onComplete, showGate]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  const sceneStage =
    elapsed < 19
      ? "STAGE 01 · ORIGIN FIELD (WEBGL)"
      : elapsed < 39
      ? "STAGE 02 · TERRITORIAL MEMORY (WEBGL)"
      : "STAGE 03 · SOVEREIGN CRYSTAL (WEBGL)";

  const progress = elapsed / DURATION;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#04060a] text-platinum select-none font-sans">
      <CrystalWorldEngine progress={progress} masterClock={elapsed} />

      {/* Degradados de capa */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(4,6,10,0.3)_50%,rgba(4,6,10,0.92)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(94,179,255,0.05),transparent_40%,rgba(178,141,255,0.06))]" />

      {!showGate && (
        <>
          {/* Header de Telemetría */}
          <header className="absolute inset-x-6 top-6 z-20 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-platinum/70">
            <div className="flex items-center gap-3">
              <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{sceneStage}</span>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden sm:flex items-center gap-3 text-platinum/40">
                <Activity className="size-3.5 text-electric" />
                <span>{bitrateTelemetry.fps} FPS</span>
                <span>·</span>
                <span>{bitrateTelemetry.droppedFrames} DROP</span>
              </div>

              <span>
                {Math.floor(elapsed).toString().padStart(2, "0")}:
                {Math.floor((elapsed % 1) * 100).toString().padStart(2, "0")}{" "}
                / {DURATION}:00
              </span>

              <button
                onClick={onComplete}
                className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-platinum hover:bg-white/20 transition-all border border-white/10"
              >
                <SkipForward className="size-3.5" />
                <span>Omitir (Esc)</span>
              </button>
            </div>
          </header>

          {/* Timeline */}
          <footer className="absolute inset-x-6 bottom-6 z-20 space-y-2">
            <div className="relative h-1 w-full bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
              <div
                className="h-full bg-gradient-to-r from-electric to-purple-400 shadow-[0_0_12px_rgba(94,179,255,0.8)] transition-all duration-100 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </footer>
        </>
      )}

      {/* Fuente de Audio */}
      <audio
        ref={audioRef}
        src={remoteAudioUrl}
        loop
        preload="auto"
        className="hidden"
      />

      {/* Landing Gate */}
      {showGate && (
        <section className="absolute inset-0 z-30 flex items-center justify-center bg-[#04060a]/90 p-6 backdrop-blur-xl">
          <div className="w-full max-w-[500px] rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl backdrop-blur-2xl sm:p-10">
            <div className="mx-auto mb-6 flex size-28 items-center justify-center rounded-2xl border border-white/20 bg-black/40 p-2 shadow-[0_0_50px_rgba(94,179,255,0.25)]">
              <img
                src="/assets/logo-isabella.jpeg"
                alt="Isabella Villaseñor Logo"
                className="size-full rounded-xl object-cover"
              />
            </div>

            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-pearl sm:text-4xl">
              Isabella <span className="text-iridescent italic">Villaseñor</span>
            </h1>

            <p className="mx-auto mt-3 max-w-sm font-mono text-[11px] leading-relaxed text-muted-foreground">
              Inmersión audiovisual interactiva con renderizado WebGL multihilo y bus de telemetría del sistema.
            </p>

            <button
              onClick={enter}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-electric/90 to-purple-600/90 px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-pearl shadow-lg transition-all hover:scale-[1.02] hover:shadow-electric/30 active:scale-[0.98]"
            >
              <Play className="size-4 fill-pearl" />
              INICIAR INMERSIÓN
            </button>

            <div className="mt-4 flex items-center justify-center">
              <button
                onClick={() => setMuted((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-pearl transition-colors"
              >
                {muted ? (
                  <VolumeX className="size-3.5" />
                ) : (
                  <Volume2 className="size-3.5" />
                )}
                {muted ? "Audio Desactivado" : "Audio Activado"}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

// -----------------------------------------------------------------------------
// 3. EXPORTACIÓN CON CARGA DINÁMICA DE MODULE FEDERATION (A prueba de Vite)
// -----------------------------------------------------------------------------
const remoteModuleUrl = "isabellaRemote/CinematicIntro";

const RemoteCinematicModule = lazy(() =>
  import(/* @vite-ignore */ remoteModuleUrl).catch(() => ({
    default: CinematicIntroContent,
  }))
);

export default function CinematicIntro(props: CinematicIntroProps) {
  return (
    <Suspense fallback={<CinematicIntroContent {...props} />}>
      <RemoteCinematicModule {...props} />
    </Suspense>
  );
}
