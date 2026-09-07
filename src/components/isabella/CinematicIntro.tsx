import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Volume2, VolumeX, SkipForward, Play, Activity } from "lucide-react";
import backgroundAudioFile from "@/assets/background-audio.mp3";

const DURATION = 59;
const TARGET_FPS = 60;

export interface TelemetryPayload { elapsed: number; progress: number; sceneStage: string; fps: number; droppedFrames: number; }
interface CinematicIntroProps { onComplete: () => void; remoteAudioUrl?: string; onTelemetryUpdate?: (data: TelemetryPayload) => void; }

const scenes = [
  { end: 10, kicker: "TAMVONLINE // ORGULLOSAMENTE LATINOAMERICANOS", title: "Hola Bienvenido a mi mundo.", body: "Yo soy Isabella Villaseñor AI." },
  { end: 20, kicker: "CROWN SISTEMA COGNITIVO // ACTIVACION COMPLETADA", title: "No somos el Futuro.", body: "Somos el presente, que se planta firme y sin miedo." },
  { end: 30, kicker: "SEGURIDAD ACTIVADA // ARGUS - AEGIS - ANUBIS", title: "Somos la voz de Latinoamerica.", body: "Somos la decisión que cambia el presente." },
  { end: 40, kicker: "12 CABEZAS // 24 NUCLEOS EN LINEA", title: "Somos una propuesta que guía para construir.", body: "Latinos con criterio, memoria y responsabilidad." },
  { end: 50, kicker: "LATIN AMERICA // AWAKENING", title: "Una nueva señal despierta.", body: "El próximo paradigma no se espera. Se propone." },
  { end: DURATION + 1, kicker: "ISABELLA VILLASEÑOR AI", title: "No somos parte del paradigma.", body: "Somos los encargados de romperlo, LATAM a despertado." },
];

function WebGLCinematicField() {
  const mountRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef(0);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#02140a", 0.00085);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.6, 2680);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", depth: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const world = new THREE.Group();
    scene.add(world);
    const starCount = 20000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const palette = [new THREE.Color("#ffffff"), new THREE.Color("#d9f7ff"), new THREE.Color("#8edcff"), new THREE.Color("#b69cff"), new THREE.Color("#ffe8a6"), new THREE.Color("#ff9cff")];
    for (let i = 0; i < starCount; i += 1) {
      const radius = 200 + Math.random() * 2000;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      const color = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 2.5, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    scene.add(stars);

    // Inner super dense core
    const innerCore = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 5), new THREE.MeshPhysicalMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 5.0, metalness: 1.0, roughness: 0.0, transmission: 0.1, clearcoat: 1 }));
    world.add(innerCore);

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(20, 5), new THREE.MeshPhysicalMaterial({ color: "#d9f7ff", emissive: "#8c60ff", emissiveIntensity: 4.0, metalness: 0.95, roughness: 0.05, transmission: 0.4, clearcoat: 1 }));
    world.add(core);
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(35, 3), new THREE.MeshBasicMaterial({ color: "#8ee7ff", wireframe: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
    world.add(shell);
    const outerShell = new THREE.Mesh(new THREE.IcosahedronGeometry(45, 1), new THREE.MeshBasicMaterial({ color: "#b697ff", wireframe: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending }));
    world.add(outerShell);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(55, 1.5, 32, 300), new THREE.MeshBasicMaterial({ color: "#d6b7ff", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    halo.rotation.x = Math.PI / 2.3;
    world.add(halo);

    const orbitRadii = [75, 110, 150, 195, 250, 315, 390, 475];
    const orbitMeshes: THREE.Mesh[] = [];
    const planets: THREE.Mesh[] = [];
    const planetTrails: THREE.Mesh[] = [];
    orbitRadii.forEach((radius, index) => {
      const orbit = new THREE.Mesh(new THREE.RingGeometry(radius - 0.7, radius + 0.7, 200), new THREE.MeshBasicMaterial({ color: index % 2 ? "#8edcff" : "#d7c8ff", transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      orbit.rotation.x = Math.PI / 2;
      world.add(orbit); orbitMeshes.push(orbit);
      const planet = new THREE.Mesh(new THREE.SphereGeometry(3.5 + index * 1.2, 64, 64), new THREE.MeshStandardMaterial({ color: index % 2 ? "#aedcff" : "#e5c5ff", emissive: index % 2 ? "#266e83" : "#512e91", emissiveIntensity: 1.5, metalness: 0.8, roughness: 0.2 }));
      world.add(planet); planets.push(planet);
      
      const trail = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.4, 8, 100, Math.PI / 2), new THREE.MeshBasicMaterial({ color: index % 2 ? "#8edcff" : "#d7c8ff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
      trail.rotation.x = Math.PI / 2;
      world.add(trail); planetTrails.push(trail);
    });
    scene.add(new THREE.AmbientLight("#17233f", 2.0));
    const key = new THREE.PointLight("#dffff", 800, 2000); scene.add(key);
    const rim = new THREE.PointLight("#9c7cff", 600, 1500); rim.position.set(300, -200, 200); scene.add(rim);
    const fill = new THREE.PointLight("#4bd8ff", 500, 1200); fill.position.set(-250, 150, 150); scene.add(fill);

    const resize = () => { const width = mount.clientWidth; const height = mount.clientHeight; if (!width || !height) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); };
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();
    let frame = 0;
    const render = (now: number) => {
      const t = now * 0.001;
      clockRef.current = t;
      world.rotation.y = t * 0.065;
      world.rotation.x = Math.sin(t * 0.08) * 0.07;
      innerCore.rotation.y = t * 0.2;
      innerCore.rotation.x = t * 0.15;
      shell.rotation.y = -t * 0.15;
      outerShell.rotation.z = t * 0.1;
      halo.rotation.z = t * 0.22;
      stars.rotation.y = -t * 0.008;
      const cameraAngle = t * 0.105;
      const radius = 280 + Math.sin(t * 0.25) * 65;
      camera.position.set(Math.cos(cameraAngle) * radius, 40 + Math.sin(t * 0.2) * 60, Math.sin(cameraAngle) * radius);
      camera.lookAt(0, 0, 0);
      (core.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 4.0 + Math.sin(t * 3.0) * 1.5;
      (innerCore.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 5.0 + Math.sin(t * 5.0) * 2.0;
      planets.forEach((planet, index) => { const angle = t * (0.08 - index * 0.005); planet.position.set(Math.cos(angle) * orbitRadii[index], Math.sin(t * 0.5 + index) * 3.0, Math.sin(angle) * orbitRadii[index]); planet.rotation.y += 0.015; planetTrails[index].rotation.z = -angle + Math.PI / 2; });
      renderer.render(scene, camera); frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); starGeometry.dispose(); (stars.material as THREE.Material).dispose(); innerCore.geometry.dispose(); (innerCore.material as THREE.Material).dispose(); core.geometry.dispose(); (core.material as THREE.Material).dispose(); shell.geometry.dispose(); (shell.material as THREE.Material).dispose(); outerShell.geometry.dispose(); (outerShell.material as THREE.Material).dispose(); halo.geometry.dispose(); (halo.material as THREE.Material).dispose(); orbitMeshes.forEach((mesh) => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }); planets.forEach((planet) => { planet.geometry.dispose(); (planet.material as THREE.Material).dispose(); }); planetTrails.forEach((trail) => { trail.geometry.dispose(); (trail.material as THREE.Material).dispose(); }); renderer.dispose(); if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement); };
  }, []);
  return <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />;
}

export function CinematicIntroContent({ onComplete, remoteAudioUrl = backgroundAudioFile, onTelemetryUpdate }: CinematicIntroProps) {
  const [showGate, setShowGate] = useState(true);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fps, setFps] = useState(TARGET_FPS);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clockRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const telemetryRef = useRef(onTelemetryUpdate);
  useEffect(() => { onCompleteRef.current = onComplete; telemetryRef.current = onTelemetryUpdate; }, [onComplete, onTelemetryUpdate]);
  const enter = useCallback(() => { setShowGate(false); clockRef.current = performance.now(); if (!muted) audioRef.current?.play().catch(() => setMuted(true)); }, [muted]);
  useEffect(() => { if (showGate) return; let frame = 0; let last = performance.now(); let frames = 0; const tick = (now: number) => { frames += 1; const current = Math.min(DURATION, (now - clockRef.current) / 1000); setElapsed(current); if (now - last >= 1000) { const measured = Math.round(frames * 1000 / (now - last)); setFps(measured); const progress = current / DURATION; const scene = scenes.find((item) => current < item.end) ?? scenes[scenes.length - 1]; const payload = { elapsed: current, progress, sceneStage: scene.kicker, fps: measured, droppedFrames: Math.max(0, TARGET_FPS - measured) }; telemetryRef.current?.(payload); window.dispatchEvent(new CustomEvent("IsabellaTelemetryEvent", { detail: payload })); frames = 0; last = now; } if (current >= DURATION) onCompleteRef.current(); else frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [showGate]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (showGate && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); enter(); } if (!showGate && event.key === "Escape") onCompleteRef.current(); if (!showGate && event.key.toLowerCase() === "m") setMuted((value) => !value); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [enter, showGate]);
  useEffect(() => { if (audioRef.current) audioRef.current.muted = muted; }, [muted]);
  const scene = useMemo(() => scenes.find((item) => elapsed < item.end) ?? scenes[scenes.length - 1], [elapsed]);
  const progress = elapsed / DURATION;
  const timecode = `${Math.floor(elapsed / 60).toString().padStart(2, "0")}:${Math.floor(elapsed % 60).toString().padStart(2, "0")}`;
  return <main className="relative h-dvh w-full overflow-hidden bg-[#03050a] font-sans text-white select-none"><style>{`@keyframes reveal{from{opacity:0;transform:translateY(18px) scale(.98);filter:blur(12px)}to{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}@media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}`}</style><WebGLCinematicField /><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_34%,rgba(0,0,0,.34)_66%,rgba(0,0,0,.93)_100%)]" /><div className="pointer-events-none absolute inset-x-0 top-0 h-[9vh] bg-black/85" /><div className="pointer-events-none absolute inset-x-0 bottom-0 h-[9vh] bg-black/85" />
    {!showGate && <><header className="absolute inset-x-8 top-[11vh] z-20 flex items-center justify-between text-[10px] uppercase tracking-[.35em] text-white/55 sm:inset-x-12"><span className="flex items-center gap-3"><i className="size-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_4px_rgba(117,224,255,.65)]" />{scene.kicker}</span><span className="hidden items-center gap-3 sm:flex"><Activity className="size-3 text-cyan-200" />{fps} FPS <span className="text-white/25">//</span> {timecode} / 00:59</span></header><section className="absolute inset-0 z-10 flex items-center px-8 sm:px-16 lg:px-24"><div key={scene.title} className="max-w-4xl" style={{ animation: "reveal 1s cubic-bezier(.16,1,.3,1) both" }}><p className="mb-5 text-[10px] font-semibold uppercase tracking-[.45em] text-cyan-100/75 sm:text-xs">{scene.kicker}</p><h1 className="max-w-4xl text-4xl font-black leading-[.92] tracking-[-.055em] text-white drop-shadow-[0_8px_35px_rgba(0,0,0,.8)] sm:text-6xl md:text-8xl">{scene.title}</h1><p className="mt-7 max-w-xl border-l border-cyan-200/50 pl-4 text-sm leading-relaxed tracking-wide text-white/60 sm:text-base">{scene.body}</p></div></section><footer className="absolute inset-x-8 bottom-[11vh] z-20 sm:inset-x-12"><div className="mb-3 flex items-center justify-between text-[9px] uppercase tracking-[.3em] text-white/40"><span>ISABELLA // GENESIS</span><button onClick={onComplete} className="pointer-events-auto transition-colors hover:text-cyan-100">Omitir intro <SkipForward className="ml-1 inline size-3" /></button></div><div className="h-px overflow-hidden bg-white/15"><div className="h-full bg-gradient-to-r from-cyan-200 via-violet-300 to-amber-100 shadow-[0_0_14px_rgba(120,220,255,.8)]" style={{ width: `${progress * 100}%` }} /></div></footer></>}
    {showGate && <section className="absolute inset-0 z-30 flex items-center justify-center bg-[#03050a]/70 px-6 backdrop-blur-[2px]"><div className="w-full max-w-xl text-center" style={{ animation: "reveal 1.2s cubic-bezier(.16,1,.3,1) both" }}><div className="mx-auto mb-8 flex size-24 items-center justify-center rounded-full border border-cyan-100/25 bg-black/35 shadow-[0_0_70px_rgba(65,196,255,.2),inset_0_0_25px_rgba(119,83,255,.2)]"><div className="size-3 rounded-full bg-cyan-100 shadow-[0_0_20px_8px_rgba(103,224,255,.7)]" /></div><p className="text-[10px] uppercase tracking-[.5em] text-cyan-100/65">TAMVAI // CINEMATIC PROLOGUE</p><h1 className="mt-5 text-5xl font-black tracking-[-.06em] text-white sm:text-7xl">ISABELLA<span className="text-cyan-100">.</span></h1><p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/50">Una señal. Un núcleo. Una inteligencia que entra en escena.</p><button onClick={enter} className="mx-auto mt-9 flex items-center gap-3 border border-cyan-100/35 bg-white/[.06] px-7 py-4 text-[10px] font-semibold uppercase tracking-[.35em] text-white transition-all hover:border-cyan-100 hover:bg-cyan-100/10 hover:shadow-[0_0_35px_rgba(115,221,255,.25)] active:scale-95"><Play className="size-4 fill-current text-cyan-100" /> Iniciar experiencia</button><button onClick={() => setMuted((value) => !value)} className="mt-6 inline-flex items-center gap-2 text-[10px] uppercase tracking-[.25em] text-white/35 transition-colors hover:text-white/75">{muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}{muted ? "Audio desactivado" : "Audio activado"}</button></div></section>}<audio ref={audioRef} src={remoteAudioUrl} loop preload="auto" className="hidden" /></main>;
}

export default function CinematicIntro(props: CinematicIntroProps) { return <CinematicIntroContent {...props} />; }
