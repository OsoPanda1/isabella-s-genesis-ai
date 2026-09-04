import { useCallback, useEffect, useRef, useState } from "react";
import {
  PRESETS,
  buildSystemPrompt,
  route,
  type Preset,
  type PresetId,
  type RoutingDecision,
} from "./crown-ui";
import { audioFormatFromMime, type Attachment } from "./attachments";
import { resolveSkillInvocation } from "./skill-registry";
import {
  exportTelemetryCsv,
  exportTelemetryPdf,
  toTelemetryRecord,
  type TelemetryRecord,
} from "./audit-export";

export interface TerminalMessage {
  id: string;
  role: "user" | "isabella" | "system";
  content: string;
  timestamp: string;
  decision?: RoutingDecision;
  streaming?: boolean;
  error?: boolean;
  attachments?: Attachment[];
}

const now = () =>
  new Date().toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const uid = () => Math.random().toString(36).slice(2, 11);

const STORAGE_KEY = "isabella.session.v1";
const TELEMETRY_KEY = "isabella.telemetry.v1";
const PRESET_KEY = "isabella.preset.v1";

const BOOT: TerminalMessage = {
  id: "boot",
  role: "system",
  content:
    "Núcleo C.R.O.W.N. sincronizado · ISA · SOPHIA · ORION · ARGUS en línea · Nodo Cero, Real del Monte, Hidalgo. Presencia establecida.",
  timestamp: now(),
};

function loadSession(): TerminalMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { messages?: TerminalMessage[] };
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) return null;
    return parsed.messages.map((m) => ({ ...m, streaming: false }));
  } catch {
    return null;
  }
}

/** Bloques de contenido multimodal para el gateway. */
function buildContent(text: string, attachments?: Attachment[]) {
  if (!attachments?.length) return text;
  const blocks: unknown[] = [{ type: "text", text: text || "Analiza el material adjunto." }];
  for (const a of attachments) {
    if (a.kind === "image") {
      blocks.push({ type: "image_url", image_url: { url: a.dataUrl } });
    } else {
      blocks.push({
        type: "input_audio",
        input_audio: {
          data: a.dataUrl.split(",")[1] ?? "",
          format: audioFormatFromMime(a.mime),
        },
      });
    }
  }
  return blocks;
}

export function useIsabella() {
  const [messages, setMessages] = useState<TerminalMessage[]>([BOOT]);
  const [hydrated, setHydrated] = useState(false);
  const [presetId, setPresetId] = useState<PresetId>("prime");
  const [isProcessing, setIsProcessing] = useState(false);
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  const [tokens, setTokens] = useState(0);
  const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([]);
  const [runId] = useState(() => `run-${uid()}`);
  const abortRef = useRef<AbortController | null>(null);

  const preset: Preset = PRESETS.find((p) => p.id === presetId) ?? (PRESETS[0] as Preset);

  // Rehidratación del historial y de la telemetría auditada.
  useEffect(() => {
    const restored = loadSession();
    if (restored) setMessages(restored);
    try {
      const savedPreset = window.localStorage.getItem(PRESET_KEY) as PresetId | null;
      if (savedPreset && PRESETS.some((p) => p.id === savedPreset)) setPresetId(savedPreset);
      const rawTel = window.localStorage.getItem(TELEMETRY_KEY);
      if (rawTel) setTelemetry(JSON.parse(rawTel) as TelemetryRecord[]);
    } catch {
      /* almacenamiento no disponible */
    }
    setHydrated(true);
  }, []);

  // Persistencia por sesión (se purga al cerrar la pestaña).
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ savedAt: new Date().toISOString(), presetId, messages }),
      );
      window.localStorage.setItem(PRESET_KEY, presetId);
      window.localStorage.setItem(TELEMETRY_KEY, JSON.stringify(telemetry.slice(-200)));
    } catch {
      /* cuota agotada: la sesión sigue viva en memoria */
    }
  }, [messages, presetId, telemetry, hydrated]);

  const send = useCallback(
    async (input: string, attachments: Attachment[] = []) => {
      const text = input.trim();
      if ((!text && attachments.length === 0) || isProcessing) return;

      const skillResolution = resolveSkillInvocation(text);
      if (skillResolution && "error" in skillResolution) {
        setMessages((prev) => [...prev, { id: uid(), role: "system", content: `ARGUS :: ${skillResolution.error}`, timestamp: now(), error: true }]);
        return;
      }
      const skillContext = skillResolution && "skill" in skillResolution ? `\n\n[SKILL AUTORIZADO: ${skillResolution.skill.id}]\n${skillResolution.skill.description}` : "";
      const effectiveText = skillResolution && "skill" in skillResolution ? skillResolution.prompt : text;
      const routing = route(effectiveText || "material adjunto", preset);
      setDecision(routing);
      setTelemetry((prev) => [...prev, toTelemetryRecord(routing, preset.id)]);

      const { getSessionToken, ensureSessionToken, setSessionToken } = await import("@/lib/auth-client");
      let token = getSessionToken();
      if (!token) {
        // Dev fallback: intenta sesión soberana sin OAuth (solo development + ALLOW_DEV_AUTH_FALLBACK)
        try {
          const devRes = await fetch("/api/db?action=dev-session", {
            method: "POST",
            headers: { "content-type": "application/json" },
          });
          if (devRes.ok) {
            const devData = (await devRes.json()) as { token?: string; userId?: string };
            if (devData.token) {
              const { setStoredSovereignUserId } = await import("@/lib/auth-client");
              setSessionToken(devData.token);
              if (devData.userId) setStoredSovereignUserId(devData.userId);
              token = devData.token;
            }
          }
        } catch {}
      }
      if (!token) {
        try {
          token = await ensureSessionToken();
        } catch {
          // En dev sin OAuth configurado, permite request sin token — el backend hará fail-closed controlado
          token = "";
        }
      }

      const userMsg: TerminalMessage = {
        id: uid(),
        role: "user",
        content: input.trim(),
        timestamp: now(),
        attachments,
      };
      const replyId = uid();

      const history = [...messages, userMsg]
        .filter((m) => m.role !== "system" && !m.error)
        .slice(-16)
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: buildContent(m.content, m.attachments),
        }));

      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: replyId,
          role: "isabella",
          content: "",
          timestamp: now(),
          decision: routing,
          streaming: true,
        },
      ]);
      setIsProcessing(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/isabella", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({
            system: buildSystemPrompt(routing, preset) + skillContext,
            temperature: preset.temperature,
            messages: history,
          }),
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => ({ error: "Fallo de percepción." }));
          throw new Error(detail.error ?? "Fallo de percepción.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const delta: string | undefined = json.choices?.[0]?.delta?.content;
              if (delta) {
                acc += delta;
                setTokens((t) => t + 1);
                setMessages((prev) =>
                  prev.map((m) => (m.id === replyId ? { ...m, content: acc } : m)),
                );
              }
            } catch {
              /* fragmento parcial */
            }
          }
        }

        buffer += decoder.decode();
        for (const line of buffer.split(/\r?\n/)) {
          if (!line.trim().startsWith("data:") || line.trim().slice(5).trim() === "[DONE]") continue;
          try {
            const json = JSON.parse(line.trim().slice(5).trim());
            const delta: string | undefined = json.choices?.[0]?.delta?.content;
            if (delta) acc += delta;
          } catch { /* final incomplete event is safely ignored */ }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId
              ? {
                  ...m,
                  streaming: false,
                  content:
                    acc || "Silencio cognitivo: el núcleo no emitió síntesis para esta percepción.",
                }
              : m,
          ),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setMessages((prev) => prev.filter((m) => m.id !== replyId));
          return;
        }
        const message = err instanceof Error ? err.message : "Interrupción del núcleo.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId
              ? { ...m, streaming: false, error: true, content: `ARGUS :: ${message}` }
              : m,
          ),
        );
      } finally {
        setIsProcessing(false);
        abortRef.current = null;
      }
    },
    [isProcessing, messages, preset],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([
      {
        id: uid(),
        role: "system",
        content:
          "Sesión purgada. Memoria inmediata y de sesión reiniciadas (mensajes y adjuntos) · telemetría auditable preservada.",
        timestamp: now(),
      },
    ]);
    setDecision(null);
    setTokens(0);
  }, []);

  /** Descarga la conversación completa en JSON auditable. */
  const downloadConversation = useCallback(() => {
    const payload = {
      artifact: "isabella.conversation",
      version: 2,
      runId,
      exportedAt: new Date().toISOString(),
      node: "Nodo Cero · Real del Monte, Hidalgo",
      presetId,
      messages,
      telemetry,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `isabella-conversacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, presetId, telemetry, runId]);

  /** Reabre una conversación exportada previamente. */
  const openConversation = useCallback(async (file: File) => {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as { messages?: TerminalMessage[]; presetId?: PresetId };
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      throw new Error("Archivo de conversación inválido.");
    }
    abortRef.current?.abort();
    if (parsed.presetId && PRESETS.some((p) => p.id === parsed.presetId)) {
      setPresetId(parsed.presetId);
    }
    setMessages([
      ...parsed.messages.map((m) => ({ ...m, streaming: false })),
      {
        id: uid(),
        role: "system" as const,
        content: `Conversación reabierta desde archivo · ${parsed.messages.length} fragmentos restaurados · trazabilidad preservada.`,
        timestamp: now(),
      },
    ]);
    setDecision(null);
  }, []);

  const exportCsv = useCallback(() => exportTelemetryCsv(telemetry, runId), [telemetry, runId]);
  const exportPdf = useCallback(
    () => exportTelemetryPdf(telemetry, runId, preset.name),
    [telemetry, runId, preset.name],
  );

  return {
    messages,
    send,
    stop,
    reset,
    isProcessing,
    preset,
    presetId,
    setPresetId,
    decision,
    tokens,
    telemetry,
    runId,
    downloadConversation,
    openConversation,
    exportCsv,
    exportPdf,
  };
}
