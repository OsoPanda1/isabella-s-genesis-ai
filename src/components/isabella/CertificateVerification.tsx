import { useState } from "react";
import { ShieldCheck, Fingerprint, Lock, RotateCcw, Check, X } from "lucide-react";
import { toast } from "sonner";

interface VerificationStep {
  label: string;
  status: "idle" | "loading" | "success" | "error";
  detail?: string;
}

interface IntegrityResponse {
  status: string;
  checks: {
    signerAvailable: boolean;
    signatureSimulated: boolean;
    bookpi: { available: boolean; chainValid: boolean };
    projection: { available: boolean; rebuildable: boolean };
  };
}

const INITIAL_STEPS: VerificationStep[] = [
  {
    label: "Consultando estado de integridad económica (/api/economic-integrity)",
    status: "idle",
  },
  {
    label: "Autoridad de firma del ledger disponible (no simulada)",
    status: "idle",
  },
  { label: "Cadena BookPI válida en la base canónica", status: "idle" },
  {
    label: "Proyección económica reconstruible (economic_events)",
    status: "idle",
  },
];

/**
 * Verificador de integridad del ledger: consulta el endpoint real
 * `/api/economic-integrity` y refleja su resultado sin inventar datos.
 * Si algún chequeo falla, el certificado NO se emite (fail-closed).
 */
export function CertificateVerification() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [steps, setSteps] = useState<VerificationStep[]>(INITIAL_STEPS);
  const [showCertificate, setShowCertificate] = useState(false);
  const [sealInfo, setSealInfo] = useState<string>("");

  const setStep = (idx: number, patch: Partial<VerificationStep>) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const handleVerify = async () => {
    setIsVerifying(true);
    setShowCertificate(false);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "loading" as const })));

    try {
      const res = await fetch("/api/economic-integrity");
      const data = (await res.json()) as IntegrityResponse;

      const ok0 = res.ok && data.status === "ok";
      setStep(0, {
        status: ok0 ? "success" : "error",
        detail: `HTTP ${res.status} · status=${data.status}`,
      });

      const ok1 =
        data.checks?.signerAvailable === true && data.checks?.signatureSimulated === false;
      setStep(1, {
        status: ok1 ? "success" : "error",
        detail: `signerAvailable=${String(data.checks?.signerAvailable)} · simulated=${String(data.checks?.signatureSimulated)}`,
      });

      const ok2 =
        data.checks?.bookpi?.available === true && data.checks?.bookpi?.chainValid === true;
      setStep(2, {
        status: ok2 ? "success" : "error",
        detail: `available=${String(data.checks?.bookpi?.available)} · chainValid=${String(data.checks?.bookpi?.chainValid)}`,
      });

      const ok3 =
        data.checks?.projection?.available === true &&
        data.checks?.projection?.rebuildable === true;
      setStep(3, {
        status: ok3 ? "success" : "error",
        detail: `available=${String(data.checks?.projection?.available)} · rebuildable=${String(data.checks?.projection?.rebuildable)}`,
      });

      if (ok0 && ok1 && ok2 && ok3) {
        setSealInfo(
          `Integridad verificada el ${new Date().toISOString()}: firmante real, cadena BookPI válida y proyección reconstruible.`,
        );
        setShowCertificate(true);
        toast.success("Integridad del ledger verificada contra el servidor.");
      } else {
        setShowCertificate(false);
        toast.error("Integridad NO verificada: revisa los chequeos en rojo.");
      }
    } catch (err) {
      setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "error" as const })));
      setShowCertificate(false);
      toast.error(err instanceof Error ? err.message : "Error consultando integridad.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="p-5 rounded-2xl bg-[#13151f] border border-border/10 space-y-4 text-muted-foreground text-xs"
      id="cert-verification-module"
    >
      <div className="flex items-center gap-2 pb-2 border-b border-border/5">
        <ShieldCheck className="size-4 text-purple-400" />
        <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
          Verificador de Integridad del Ledger BookPI
        </h3>
      </div>

      <p className="text-[11px] leading-relaxed">
        Consulta en vivo el estado de integridad económica del servidor (autoridad de firma, cadena
        BookPI y proyección). No emite certificados si algún chequeo falla.
      </p>

      {/* INPUT CONTROL */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleVerify}
          disabled={isVerifying}
          className="px-4 py-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-500 font-mono font-bold uppercase text-[11px] flex items-center gap-1.5 transition-all shadow-lg shadow-purple-600/15 disabled:opacity-55"
        >
          {isVerifying ? (
            <RotateCcw className="size-3.5 animate-spin" />
          ) : (
            <span>Verificar integridad</span>
          )}
        </button>
      </div>

      {/* VERIFICATION TRACKER */}
      <div className="p-3.5 bg-black/20 border border-border/5 rounded-xl space-y-2 font-mono text-[11px]">
        <div className="text-white font-bold uppercase pb-1 border-b border-border/5 flex justify-between">
          <span>Chequeos del servidor:</span>
          {isVerifying && <span className="text-purple-400 animate-pulse">Analizando...</span>}
        </div>

        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3">
              <span
                className={`text-left ${
                  step.status === "success"
                    ? "text-emerald-400"
                    : step.status === "loading"
                      ? "text-purple-400"
                      : step.status === "error"
                        ? "text-red-400"
                        : "text-muted-foreground"
                }`}
              >
                {idx + 1}. {step.label}
                {step.detail && <span className="block text-[10px] opacity-80">{step.detail}</span>}
              </span>
              <span className="font-bold uppercase text-[9.5px] shrink-0">
                {step.status === "idle" && <span className="text-muted-foreground/50">Espera</span>}
                {step.status === "loading" && (
                  <span className="text-purple-400 animate-pulse">Cargando</span>
                )}
                {step.status === "success" && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="size-3" /> OK
                  </span>
                )}
                {step.status === "error" && (
                  <span className="text-red-400 flex items-center gap-1">
                    <X className="size-3" /> Falla
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CERTIFICATE PAYLOAD */}
      {showCertificate && (
        <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 space-y-3 animate-rise font-mono text-[11.5px]">
          <div className="flex justify-between items-center pb-2 border-b border-purple-500/15">
            <span className="text-white font-bold uppercase flex items-center gap-1">
              <Fingerprint className="size-4 text-purple-400" /> Integridad del ledger verificada
            </span>
            <span className="text-emerald-400 font-extrabold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              🟢 VERIFICADO
            </span>
          </div>

          <div className="space-y-2 leading-relaxed">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Resultado:</span>
              <strong className="text-white font-semibold text-right">{sealInfo}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Algoritmo de sello:</span>
              <strong className="text-purple-400">HMAC-SHA3-512 / audit-seal-v1</strong>
            </div>
          </div>

          <div className="p-2.5 bg-black/45 rounded-lg border border-border/5 text-[10.5px] text-muted-foreground flex items-start gap-1.5 leading-tight">
            <Lock className="size-3.5 shrink-0 text-purple-400" />
            <div>
              Verificación en vivo contra el servidor. ML-DSA-87 no es autoridad de firma en este
              runtime (SIMULATION-ONLY por contrato).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
