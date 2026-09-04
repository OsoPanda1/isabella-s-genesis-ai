import { useEffect, useRef, useState, useId, useCallback } from "react";
import { Waveform } from "./Waveform";
import { fileToDataUrl, humanSize, MAX_ATTACHMENT_BYTES, type Attachment } from "@/lib/attachments";
import {
  Paperclip,
  Mic,
  MicOff,
  Square,
  Send,
  Trash2,
  BrainCircuit,
  Wrench,
  Globe,
  AlertTriangle,
} from "lucide-react";
import { usePerformanceMonitor } from "@/hooks/usePerformanceMonitor";

const uid = () => Math.random().toString(36).slice(2, 11);

// Modos de Razonamiento inspirados en DeepSeek & Perplexity
export type ExecutionMode = "fast" | "deep_reasoning" | "web_research" | "agent_tools";

export interface ExtendedAttachment extends Attachment {
  tokenEstimate?: number;
}

export interface CommandLineProps {
  onSend: (
    value: string,
    attachments: ExtendedAttachment[],
    config: { mode: ExecutionMode; webSearch: boolean; toolsEnabled: boolean },
  ) => void;
  onStop: () => void;
  onReset: () => void;
  isProcessing: boolean;
}

export function CommandLine({ onSend, onStop, onReset, isProcessing }: CommandLineProps) {
  const { startTrack } = usePerformanceMonitor("CommandLine");
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<ExtendedAttachment[]>([]);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // Estados avanzados de configuración IA
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("fast");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [showCommandsMenu, setShowCommandsMenu] = useState(false);

  const ref = useRef<HTMLTextAreaElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const inputId = useId();

  // Estimación rápida de tokens en tiempo real (Inspirado en Kimi & Prometheus)
  const estimatedTokens =
    Math.ceil(value.length / 4) +
    attachments.reduce((acc, curr) => acc + (curr.kind === "image" ? 256 : 512), 0);

  // Auto-ajuste de altura de textarea
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  // Cronómetro de grabación
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  // Atajos de teclado (<kbd>Esc</kbd> para detener, `/` para comandos)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isProcessing) {
        onStop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isProcessing, onStop]);

  // Detector de menú flotante de comandos
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setValue(val);
    if (val.startsWith("/")) {
      setShowCommandsMenu(true);
    } else {
      setShowCommandsMenu(false);
    }
  };

  const submit = useCallback(() => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || isProcessing) return;

    const stopTrack = startTrack(`Transmit Prompt (${executionMode})`);

    onSend(text, attachments, {
      mode: executionMode,
      webSearch: webSearchEnabled,
      toolsEnabled: toolsEnabled,
    });

    setValue("");
    setAttachments([]);
    setShowCommandsMenu(false);
    stopTrack();
  }, [
    value,
    attachments,
    isProcessing,
    onSend,
    executionMode,
    webSearchEnabled,
    toolsEnabled,
    startTrack,
  ]);

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const next: ExtendedAttachment[] = [];
    for (const file of Array.from(files).slice(0, 6)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setNotice(`«${file.name}» excede 8 MB y fue descartada.`);
        continue;
      }
      next.push({
        id: uid(),
        kind: "image",
        dataUrl: await fileToDataUrl(file),
        mime: file.type || "image/jpeg",
        name: file.name,
        size: file.size,
        tokenEstimate: 256,
      });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, 8));
  };

  const startRecording = async () => {
    setNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size > MAX_ATTACHMENT_BYTES) {
          setNotice("La grabación excede el límite de 8 MB.");
          return;
        }
        const dataUrl = await fileToDataUrl(blob);
        setAttachments((prev) =>
          [
            ...prev,
            {
              id: uid(),
              kind: "audio" as const,
              dataUrl,
              mime: recorder.mimeType || "audio/webm",
              name: `nota-voz-${new Date().toISOString().slice(11, 19)}`,
              size: blob.size,
              tokenEstimate: 512,
            },
          ].slice(0, 8),
        );
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecSeconds(0);
      setRecording(true);
    } catch {
      setNotice("No se pudo acceder al micrófono. Revisa los permisos.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const applyCommand = (cmd: string, mode: ExecutionMode) => {
    setValue("");
    setExecutionMode(mode);
    setShowCommandsMenu(false);
  };

  return (
    <div className="glass-strong rounded-3xl p-4 sm:p-6 border border-border/40 shadow-glass relative flex flex-col gap-3 transition-all">
      {/* Menú Flotante de Comandos Rápidos (/slash) */}
      {showCommandsMenu && (
        <div className="absolute bottom-full mb-2 left-6 right-6 bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl p-2 shadow-2xl z-50 animate-fade-in font-mono text-[11px] space-y-1">
          <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            Modos de ejecución rápida
          </div>
          <button
            onClick={() => applyCommand("/think", "deep_reasoning")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-secondary/40 text-platinum transition-colors text-left"
          >
            <BrainCircuit className="size-4 text-purple-400" />
            <div>
              <span className="font-semibold text-purple-300">/think</span>
              <span className="text-muted-foreground ml-2">
                Razonamiento Profundo CoT (Estilo DeepSeek-R1 / o1)
              </span>
            </div>
          </button>
          <button
            onClick={() => applyCommand("/research", "web_research")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-secondary/40 text-platinum transition-colors text-left"
          >
            <Globe className="size-4 text-teal-400" />
            <div>
              <span className="font-semibold text-teal-300">/research</span>
              <span className="text-muted-foreground ml-2">
                Búsqueda y Síntesis Web Extensa (Perplexity)
              </span>
            </div>
          </button>
          <button
            onClick={() => applyCommand("/agent", "agent_tools")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-secondary/40 text-platinum transition-colors text-left"
          >
            <Wrench className="size-4 text-amber-400" />
            <div>
              <span className="font-semibold text-amber-300">/agent</span>
              <span className="text-muted-foreground ml-2">
                Ejecución de Herramientas & Sandbox (Hermes/Gemini)
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Encabezado Superior con Indicador de Estado y Tokenómetro */}
      <div className="flex items-center justify-between border-b border-border/30 pb-2">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${
              isProcessing
                ? "bg-electric animate-ping"
                : recording
                  ? "bg-rose-500 animate-pulse"
                  : "bg-emerald-400"
            }`}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Canal Perceptivo · Isabella AI
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span className="text-muted-foreground/80 hidden sm:inline">
            Tokens est.: <strong className="text-electric">{estimatedTokens}</strong>
          </span>
          <span
            className={`px-2 py-0.5 rounded-full border tracking-wider uppercase font-semibold ${
              isProcessing
                ? "bg-electric/15 border-electric/30 text-electric"
                : recording
                  ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
                  : "bg-secondary/40 border-border/30 text-muted-foreground"
            }`}
          >
            {isProcessing ? "SINTETIZANDO" : recording ? "GRABANDO" : "EN ESCUCHA"}
          </span>
        </div>
      </div>

      {/* Visualizador de Onda Dinámico */}
      <Waveform active={isProcessing || recording} height={36} />

      {/* Campo de Texto Multimodal */}
      <div className="relative">
        <textarea
          id={inputId}
          ref={ref}
          value={value}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          aria-label="Mensaje para Isabella AI"
          placeholder="Habla con Isabella... ('/' para comandos · Enter para enviar · Shift+Enter para salto de línea)"
          className="w-full resize-none bg-transparent text-[14.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-0"
        />
      </div>

      {/* Galería de Adjuntos Multimodales */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="glass relative flex items-center gap-2.5 rounded-2xl px-3 py-2 border border-border/40 bg-secondary/20"
            >
              {a.kind === "image" ? (
                <img
                  src={a.dataUrl}
                  alt={`Adjunto ${a.name}`}
                  className="size-10 rounded-xl object-cover border border-border/30"
                />
              ) : (
                <audio controls src={a.dataUrl} className="h-8 max-w-[160px]" />
              )}
              <div className="max-w-[130px]">
                <p className="truncate font-mono text-[10px] text-platinum font-semibold">
                  {a.name}
                </p>
                <p className="font-mono text-[8.5px] text-muted-foreground">
                  {a.kind === "image" ? "IMAGEN" : "AUDIO"} · {humanSize(a.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Quitar adjunto ${a.name}`}
                className="ml-1 p-1 rounded-lg border border-border/30 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Alertas y Notificaciones */}
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 font-mono text-[10.5px] text-rose-400 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Barra de Herramientas e Interruptores de Inteligencia */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/30 pt-3 mt-1">
        {/* Controles de Modo IA */}
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              void addPhotos(e.target.files);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="p-2 rounded-xl border border-border/30 text-muted-foreground hover:text-platinum hover:bg-secondary/30 font-mono text-[10px] flex items-center gap-1.5 transition-all"
            title="Adjuntar imágenes"
          >
            <Paperclip className="size-3.5 text-electric" />
            <span className="hidden sm:inline">Foto</span>
          </button>

          <button
            type="button"
            onClick={() => (recording ? stopRecording() : void startRecording())}
            className={`p-2 rounded-xl border font-mono text-[10px] flex items-center gap-1.5 transition-all ${
              recording
                ? "border-rose-500/50 bg-rose-500/15 text-rose-400"
                : "border-border/30 text-muted-foreground hover:text-platinum hover:bg-secondary/30"
            }`}
          >
            {recording ? (
              <MicOff className="size-3.5 text-rose-400 animate-pulse" />
            ) : (
              <Mic className="size-3.5 text-emerald-400" />
            )}
            <span>
              {recording
                ? `${String(Math.floor(recSeconds / 60)).padStart(2, "0")}:${String(recSeconds % 60).padStart(2, "0")}`
                : "Audio"}
            </span>
          </button>

          <div className="h-4 w-px bg-border/40 mx-1 hidden sm:block" />

          {/* Interruptor Razonamiento CoT (DeepSeek/o1) */}
          <button
            type="button"
            onClick={() =>
              setExecutionMode((m) => (m === "deep_reasoning" ? "fast" : "deep_reasoning"))
            }
            className={`px-2.5 py-1.5 rounded-xl border font-mono text-[10px] flex items-center gap-1.5 transition-all ${
              executionMode === "deep_reasoning"
                ? "bg-purple-500/20 border-purple-500/40 text-purple-300 font-semibold"
                : "border-border/30 text-muted-foreground hover:text-platinum"
            }`}
            title="Modo Pensamiento Profundo"
          >
            <BrainCircuit className="size-3.5 text-purple-400" />
            <span className="hidden md:inline">CoT</span>
          </button>

          {/* Interruptor Búsqueda Web (Perplexity) */}
          <button
            type="button"
            onClick={() => setWebSearchEnabled((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl border font-mono text-[10px] flex items-center gap-1.5 transition-all ${
              webSearchEnabled
                ? "bg-teal-500/20 border-teal-500/40 text-teal-300 font-semibold"
                : "border-border/30 text-muted-foreground opacity-50"
            }`}
            title="Búsqueda Web Activa"
          >
            <Globe className="size-3.5 text-teal-400" />
            <span className="hidden md:inline">Web</span>
          </button>

          {/* Interruptor Herramientas & Agentic Tools (Hermes/Gemini) */}
          <button
            type="button"
            onClick={() => setToolsEnabled((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl border font-mono text-[10px] flex items-center gap-1.5 transition-all ${
              toolsEnabled
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300 font-semibold"
                : "border-border/30 text-muted-foreground opacity-50"
            }`}
            title="Herramientas del Sistema"
          >
            <Wrench className="size-3.5 text-amber-400" />
            <span className="hidden md:inline">Tools</span>
          </button>
        </div>

        {/* Acciones Principales: Purgar / Detener / Transmitir */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="p-2 rounded-xl border border-border/30 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 font-mono text-[10px] transition-all"
            title="Purgar memoria inmediata"
          >
            <Trash2 className="size-3.5" />
          </button>

          {isProcessing ? (
            <button
              type="button"
              onClick={onStop}
              className="px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 font-mono text-[11px] uppercase tracking-wider flex items-center gap-1.5 hover:bg-rose-500/30 transition-all"
            >
              <Square className="size-3.5 fill-rose-400" />
              Detener
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim() && attachments.length === 0}
              className="glow-ring px-5 py-2 rounded-xl bg-electric/25 hover:bg-electric/35 border border-electric/40 text-electric font-mono text-[11px] uppercase tracking-[0.2em] font-semibold flex items-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(110,234,255,0.15)] active:scale-95"
            >
              <span>Transmitir</span>
              <Send className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
