import { useEffect, useRef, useState } from "react";
import { MODULES } from "@/lib/crown-ui";
import { speakIsabella, stopVoice } from "@/lib/voice";
import type { TerminalMessage } from "@/lib/useIsabella";

function VoiceButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "playing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => stopVoice(), []);

  const toggle = async () => {
    if (state === "playing") {
      stopVoice();
      setState("idle");
      return;
    }
    setState("playing");
    setError(null);
    try {
      await speakIsabella(text);
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallo de síntesis vocal.");
      setState("error");
    }
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={state === "playing" ? "Detener voz de Isabella" : "Escuchar voz de Isabella"}
        className="rounded-lg border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-platinum"
      >
        {state === "playing" ? "◼ Silenciar voz" : "▶ Voz de Isabella"}
      </button>
      {error && (
        <span role="status" className="font-mono text-[10px] text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
      {label}
      <span className="text-platinum/90"> {value}</span>
    </span>
  );
}

export function MessageStream({
  messages,
  onRetry,
}: {
  messages: TerminalMessage[];
  onRetry: () => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="flex flex-col gap-6 px-5 py-7 sm:px-9">
      {messages.map((m) => {
        if (m.role === "system") {
          return (
            <div key={m.id} className="animate-rise flex justify-center">
              <p className="max-w-2xl text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.24em] text-muted-foreground">
                {m.content}
              </p>
            </div>
          );
        }

        if (m.role === "user") {
          return (
            <div key={m.id} className="animate-rise flex justify-end">
              <div className="glass max-w-[86%] rounded-2xl rounded-br-sm px-5 py-4 sm:max-w-[70%]">
                <div className="mb-1.5 flex items-center justify-between gap-6">
                  <Meta label="OPERADOR" value="ANUBIS" />
                  <span className="font-mono text-[10px] text-muted-foreground">{m.timestamp}</span>
                </div>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                  {m.content}
                </p>
              </div>
            </div>
          );
        }

        const mod = m.decision ? MODULES[m.decision.primary] : MODULES.CROWN;
        return (
          <div key={m.id} className="animate-rise flex justify-start">
            <div
              className="glass-strong w-full max-w-[94%] rounded-2xl rounded-bl-sm px-5 py-5 sm:px-7 sm:py-6"
              style={{
                borderColor: m.error ? "var(--destructive)" : mod.color,
                boxShadow: `0 0 60px -30px ${m.error ? "var(--destructive)" : mod.color}`,
              }}
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-border/50 pb-3">
                <span
                  className="font-mono text-[11px] tracking-[0.3em]"
                  style={{ color: m.error ? "var(--destructive)" : mod.color }}
                >
                  ISABELLA · {mod.acronym}
                </span>
                {m.decision && (
                  <>
                    <Meta label="TRACE" value={m.decision.traceId} />
                    <Meta label="GATE" value={m.decision.policy.toUpperCase()} />
                    <Meta label="RIESGO" value={m.decision.risk.toUpperCase()} />
                    <Meta label="TONO" value={m.decision.emotionalTone} />
                  </>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {m.timestamp}
                </span>
              </div>

              <p className="whitespace-pre-wrap text-[15.5px] leading-[1.75] text-foreground/95">
                {m.content}
                {m.streaming && (
                  <span className="animate-caret ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 bg-electric" />
                )}
              </p>

              {m.decision && !m.error && (
                <p className="mt-4 border-t border-border/40 pt-3 text-[11px] italic leading-relaxed text-muted-foreground">
                  {m.decision.rationale} · {m.decision.policyReason}
                </p>
              )}

              {!m.error && !m.streaming && m.content.trim() && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <VoiceButton text={m.content} />
                </div>
              )}

              {m.error && (
                <button
                  onClick={onRetry}
                  className="mt-4 rounded-lg border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-platinum transition-colors hover:bg-secondary/60"
                >
                  Reintentar percepción
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
