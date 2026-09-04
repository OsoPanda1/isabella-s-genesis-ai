import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Activity, ShieldAlert, Cpu, Terminal, Radio, Volume2, VolumeX, Play } from "lucide-react";

export interface IsabellaRemoteTelemetryPayload {
  elapsed: number;
  progress: number;
  sceneStage: string;
  fps: number;
  droppedFrames: number;
  systemHealth: "OPTIMAL" | "DEGRADED" | "CRITICAL";
  memoryUsageMB?: number;
}

export interface IsabellaRemoteProps {
  onRemoteSignal?: (payload: IsabellaRemoteTelemetryPayload) => void;
  standaloneMode?: boolean;
  audioEnabled?: boolean;
  initialStage?: string;
}

// -----------------------------------------------------------------------------
// 1. MOTOR SECUNDARIO WEBGL (Isabella Telemetry Neural Overlay)
// -----------------------------------------------------------------------------
function IsabellaNeuralCore({
  intensity,
  isProcessing,
}: {
  intensity: number;
  isProcessing: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.z = 120;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Malla Neuronal Compleja
    const knotGeo = new THREE.TorusKnotGeometry(22, 6.4, 128, 32);
    const knotMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#5eb3ff"),
      wireframe: true,
      emissive: new THREE.Color("#1a3f7a"),
      emissiveIntensity: 1.5,
      metalness: 0.9,
      roughness: 0.1,
    });
    const knot = new THREE.Mesh(knotGeo, knotMat);
    scene.add(knot);

    // Luces de la escena remota
    const pointLight = new THREE.PointLight("#b28dff", 300, 500);
    pointLight.position.set(50, 50, 50);
    scene.add(pointLight);

    const ambientLight = new THREE.AmbientLight("#0a192f", 2.0);
    scene.add(ambientLight);

    const resizeObserver = new ResizeObserver(() => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    resizeObserver.observe(mount);

    let animationId: number;
    let clock = 0;

    const animate = () => {
      clock += 0.015 * (isProcessing ? 2.5 : 1.0);
      knot.rotation.x = clock * 0.4;
      knot.rotation.y = clock * 0.6;
      knotMat.emissiveIntensity = 1.0 + Math.sin(clock * 2) * 0.5 * intensity;

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      knotGeo.dispose();
      knotMat.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [intensity, isProcessing]);

  return <div ref={containerRef} className="absolute inset-0 pointer-events-none opacity-60" />;
}

// -----------------------------------------------------------------------------
// 2. COMPONENTE PRINCIPAL (IsabellaRemote Control Hub)
// -----------------------------------------------------------------------------
export function IsabellaRemote({
  onRemoteSignal,
  standaloneMode = false,
  audioEnabled = true,
  initialStage = "REMOTE_STANDBY",
}: IsabellaRemoteProps) {
  const [telemetry, setTelemetry] = useState<IsabellaRemoteTelemetryPayload>({
    elapsed: 0,
    progress: 0,
    sceneStage: initialStage,
    fps: 60,
    droppedFrames: 0,
    systemHealth: "OPTIMAL",
    memoryUsageMB: 0,
  });

  const [isAudioActive, setIsAudioActive] = useState(audioEnabled);
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [
      `[${new Date().toISOString().split("T")[1].slice(0, 8)}] ${msg}`,
      ...prev.slice(0, 49),
    ]);
  }, []);

  // Monitor de Bus de Telemetría Global del Sistema
  useEffect(() => {
    addLog("Inicializando bus de escucha de telemetría de Isabella...");

    const handleTelemetryEvent = (e: Event) => {
      const customEvent = e as CustomEvent<IsabellaRemoteTelemetryPayload>;
      if (!customEvent.detail) return;

      const data = customEvent.detail;
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const memoryMB = mem ? Math.round(mem.usedJSHeapSize / (1024 * 1024)) : 0;

      const health: "OPTIMAL" | "DEGRADED" | "CRITICAL" =
        data.fps < 30 ? "CRITICAL" : data.fps < 50 ? "DEGRADED" : "OPTIMAL";

      const updatedTelemetry: IsabellaRemoteTelemetryPayload = {
        ...data,
        systemHealth: health,
        memoryUsageMB: memoryMB,
      };

      setTelemetry(updatedTelemetry);
      onRemoteSignal?.(updatedTelemetry);
    };

    window.addEventListener("IsabellaTelemetryEvent", handleTelemetryEvent);
    return () => window.removeEventListener("IsabellaTelemetryEvent", handleTelemetryEvent);
  }, [addLog, onRemoteSignal]);

  // Inicialización de WebAudio API Sintetizada
  const triggerTone = useCallback((freq = 440, duration = 0.1) => {
    if (!isAudioActive) return;
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume();
      }

      const osc = audioContextRef.current.createOscillator();
      const gain = audioContextRef.current.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audioContextRef.current.currentTime);
      gain.gain.setValueAtTime(0.05, audioContextRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContextRef.current.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioContextRef.current.destination);

      osc.start();
      osc.stop(audioContextRef.current.currentTime + duration);
    } catch {
      // AudioContext bloqueado o restringido por políticas de usuario
    }
  }, [isAudioActive]);

  const toggleAudio = () => {
    const nextState = !isAudioActive;
    setIsAudioActive(nextState);
    if (nextState) triggerTone(880, 0.15);
  };

  const forceDisconnectToggle = () => {
    setIsConnected((prev) => {
      const next = !prev;
      addLog(next ? "Enlace de telemetría RESTABLECIDO" : "ALERTA: Enlace de telemetría INTERRUMPIDO");
      if (next) triggerTone(523.25, 0.2);
      return next;
    });
  };

  return (
    <div className={`relative flex flex-col h-full w-full bg-[#030508] text-platinum select-none border border-white/10 rounded-2xl overflow-hidden p-6 backdrop-blur-2xl shadow-2xl ${standaloneMode ? "min-h-dvh" : ""}`}>
      {/* Visualizador Núcleo 3D */}
      <IsabellaNeuralCore
        intensity={telemetry.progress > 0 ? telemetry.progress : 0.5}
        isProcessing={isConnected && telemetry.fps > 0}
      />

      {/* Bar de Estado / Top Menu */}
      <header className="relative z-10 flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radio className={`size-5 ${isConnected ? "text-emerald-400 animate-pulse" : "text-rose-500"}`} />
            <span className={`absolute -top-1 -right-1 size-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-rose-500"}`} />
          </div>
          <div>
            <h2 className="font-display font-bold text-sm tracking-wider text-pearl uppercase">
              Isabella Remote Interface
            </h2>
            <p className="font-mono text-[10px] text-muted-foreground">
              {isConnected ? "SINCRO_ACTIVA // BUS_TELEMETRIA" : "DESCONECTADO // STANDALONE"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px]">
          <button
            onClick={toggleAudio}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            {isAudioActive ? <Volume2 className="size-3.5 text-electric" /> : <VolumeX className="size-3.5 text-rose-400" />}
            <span>{isAudioActive ? "AUDIO ON" : "MUTED"}</span>
          </button>

          <button
            onClick={forceDisconnectToggle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ShieldAlert className="size-3.5 text-amber-400" />
            <span>{isConnected ? "FORZAR CORTE" : "RECONECTAR"}</span>
          </button>
        </div>
      </header>

      {/* Grid de Paneles de Control */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Panel Telemetría Render */}
        <div className="p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] uppercase text-muted-foreground flex items-center gap-1.5">
              <Cpu className="size-3.5 text-electric" /> RENDIMIENTO DE RENDER
            </span>
            <span className={`px-2 py-0.5 rounded text-[9px] font-mono ${telemetry.systemHealth === "OPTIMAL" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
              {telemetry.systemHealth}
            </span>
          </div>
          <div className="space-y-1 font-mono">
            <div className="flex justify-between text-xs">
              <span className="text-platinum/60">FPS:</span>
              <span className="text-pearl font-bold">{telemetry.fps}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-platinum/60">DROPPED FRAMES:</span>
              <span className="text-amber-400">{telemetry.droppedFrames}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-platinum/60">HEAP MEMORY:</span>
              <span className="text-purple-400">{telemetry.memoryUsageMB ? `${telemetry.memoryUsageMB} MB` : "N/A"}</span>
            </div>
          </div>
        </div>

        {/* Panel Estado Cinemático */}
        <div className="p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] uppercase text-muted-foreground flex items-center gap-1.5">
              <Activity className="size-3.5 text-purple-400" /> ETAPA DE ESCENA
            </span>
          </div>
          <p className="font-mono text-xs font-semibold text-electric truncate">
            {telemetry.sceneStage}
          </p>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between font-mono text-[10px] text-platinum/60">
              <span>PROGRESO</span>
              <span>{Math.round(telemetry.progress * 100)}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-electric to-purple-500 transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, telemetry.progress * 100))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Panel de Comandos Directos */}
        <div className="p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md flex flex-col justify-between">
          <span className="font-mono text-[10px] uppercase text-muted-foreground flex items-center gap-1.5 mb-2">
            <Terminal className="size-3.5 text-emerald-400" /> ACCIONES DIRECTAS
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                triggerTone(600, 0.1);
                addLog("Comando emitido: TRIGGER_PING");
              }}
              className="px-2 py-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 font-mono text-[10px] text-pearl transition-all"
            >
              PING CORE
            </button>
            <button
              onClick={() => {
                triggerTone(1200, 0.2);
                addLog("Comando emitido: PURGE_MEMORY");
              }}
              className="px-2 py-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 font-mono text-[10px] text-amber-300 transition-all"
            >
              PURGE MEMORY
            </button>
          </div>
        </div>
      </div>

      {/* Terminal de Logs en Tiempo Real */}
      <footer className="relative z-10 flex-1 flex flex-col min-h-[160px] rounded-xl border border-white/10 bg-black/60 p-4 font-mono text-[11px]">
        <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 text-muted-foreground text-[10px] uppercase tracking-wider">
          <span>SISTEMA DE LOGS Y EVENTOS IN SITU</span>
          <span>{logs.length} ENTRADAS</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[10px] text-platinum/80 scrollbar-thin scrollbar-thumb-white/10">
          {logs.length === 0 ? (
            <p className="text-platinum/30 italic">Esperando eventos del sistema...</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="leading-relaxed hover:text-pearl transition-colors">
                {log}
              </div>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}

// Exportación por defecto para soporte completo de Micro-Frontend / Dynamic Imports
export default IsabellaRemote;
