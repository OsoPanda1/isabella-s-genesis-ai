import { useState, useId, useCallback, KeyboardEvent } from "react";
import {
  Shield,
  User,
  Mail,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
} from "lucide-react";

export interface OnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: { username: string; email: string; telemetryConsent: boolean }) => void;
}

export function AccountOnboarding({ isOpen, onClose, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [telemetryConsent, setTelemetryConsent] = useState(true);
  const [isAgreed, setIsAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameId = useId();
  const emailId = useId();
  const telemetryId = useId();
  const agreementId = useId();

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleNext = useCallback(() => {
    setError(null);

    if (step === 1) {
      const cleanUser = username.trim();
      const cleanEmail = email.trim();

      if (!cleanUser || !cleanEmail) {
        setError("Por favor completa todos los campos obligatorios.");
        return;
      }
      if (!validateEmail(cleanEmail)) {
        setError("Ingresa una dirección de correo electrónico válida (ejemplo@dominio.com).");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!isAgreed) {
        setError("Debes aceptar los Términos Constitucionales y Políticas de Privacidad.");
        return;
      }
      onComplete({
        username: username.trim(),
        email: email.trim(),
        telemetryConsent,
      });
      setStep(3);
    }
  }, [step, username, email, isAgreed, telemetryConsent, onComplete]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (step < 3) {
        handleNext();
      } else {
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md p-4 animate-fade-in"
    >
      <div className="glass-strong rounded-3xl w-full max-w-lg border border-border/50 shadow-glass overflow-hidden flex flex-col transition-all duration-300">
        {/* Title bar */}
        <div className="bg-secondary/15 px-6 py-4.5 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full bg-electric animate-pulse shadow-[0_0_8px_rgba(110,234,255,0.6)]"
              aria-hidden="true"
            />
            <h3
              id="onboarding-modal-title"
              className="font-mono text-[12px] uppercase tracking-[0.22em] text-platinum font-semibold select-none"
            >
              Registro Canónico de Usuario
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana modal"
            className="text-muted-foreground hover:text-platinum transition-colors font-mono text-[11px] p-1 rounded-md hover:bg-secondary/20 focus:outline-none focus:ring-1 focus:ring-electric/50 flex items-center gap-1"
          >
            <X className="size-3.5" />
            <span className="hidden sm:inline">[ESC]</span>
          </button>
        </div>

        {/* Progress header */}
        <div
          className="px-6 pt-4 flex gap-1.5"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-label={`Paso ${step} de 3`}
        >
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                s <= step ? "bg-electric shadow-[0_0_8px_rgba(110,234,255,0.4)]" : "bg-secondary/35"
              }`}
            />
          ))}
        </div>

        {/* Main Body */}
        <div className="p-6 flex-1 flex flex-col gap-4">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-electric/10 border border-electric/20 text-electric">
                  <User className="size-6" />
                </div>
                <div>
                  <h4 className="font-display text-[20px] text-pearl font-semibold tracking-tight">
                    Bienvenido al Nodo Cero
                  </h4>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-0.5">
                    Crea una cuenta local y configura tu identidad soberana para interactuar con
                    Isabella.
                  </p>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl font-mono text-[11px] flex items-center gap-2 animate-shake"
                >
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3.5">
                <div>
                  <label
                    htmlFor={usernameId}
                    className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium"
                  >
                    Nombre de operador <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id={usernameId}
                      type="text"
                      autoFocus
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Ej. anubisvillasenor"
                      className="w-full bg-secondary/35 border border-border/40 rounded-xl pl-10 pr-4 py-2.5 font-mono text-[12px] text-platinum placeholder:text-muted-foreground/40 focus:outline-none focus:border-electric/60 focus:ring-1 focus:ring-electric/30 transition-all"
                    />
                    <User className="size-4 text-muted-foreground/60 absolute left-3.5 top-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={emailId}
                    className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium"
                  >
                    Correo electrónico <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id={emailId}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Ej. anubisvillasenor1@gmail.com"
                      className="w-full bg-secondary/35 border border-border/40 rounded-xl pl-10 pr-4 py-2.5 font-mono text-[12px] text-platinum placeholder:text-muted-foreground/40 focus:outline-none focus:border-electric/60 focus:ring-1 focus:ring-electric/30 transition-all"
                    />
                    <Mail className="size-4 text-muted-foreground/60 absolute left-3.5 top-3 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-crown/10 border border-crown/20 text-crown">
                  <Shield className="size-6" />
                </div>
                <div>
                  <h4 className="font-display text-[20px] text-pearl font-semibold tracking-tight">
                    Gobernanza y Privacidad Ética
                  </h4>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-0.5">
                    Isabella protege tus datos. Revisa nuestras políticas constitucionales para
                    habilitar la telemetría territorial.
                  </p>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl font-mono text-[11px] flex items-center gap-2 animate-shake"
                >
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="bg-secondary/20 rounded-2xl p-4 border border-border/30 max-h-[16vh] overflow-y-auto space-y-2.5 custom-scrollbar">
                <p className="font-mono text-[10.5px] text-muted-foreground leading-relaxed">
                  <strong className="text-platinum">Principios de Soberanía Humana:</strong> El
                  procesamiento de datos personales se limita a lo estrictamente solicitado y nunca
                  se venderá a terceros ni se empleará para entrenar modelos sin consentimiento
                  explícito.
                </p>
                <p className="font-mono text-[10.5px] text-muted-foreground leading-relaxed">
                  <strong className="text-platinum">Derecho al Olvido:</strong> En cualquier momento
                  puedes purgar por completo tu historial de conversaciones e índices de memoria
                  persistente de forma irreversible.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-3 cursor-pointer group select-none">
                  <input
                    id={telemetryId}
                    type="checkbox"
                    checked={telemetryConsent}
                    onChange={(e) => setTelemetryConsent(e.target.checked)}
                    className="mt-1 rounded border-border/40 bg-secondary/35 text-electric focus:ring-0 focus:ring-offset-0 cursor-pointer accent-electric"
                  />
                  <div className="flex flex-col">
                    <span className="font-mono text-[11.5px] text-platinum font-semibold group-hover:text-electric transition-colors">
                      Habilitar Telemetría Territorial
                    </span>
                    <span className="text-[10.5px] text-muted-foreground leading-relaxed mt-0.5">
                      Permite que Isabella analice respuestas de forma agregada para perfeccionar el
                      conocimiento local de Real del Monte.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group select-none">
                  <input
                    id={agreementId}
                    type="checkbox"
                    checked={isAgreed}
                    onChange={(e) => {
                      setIsAgreed(e.target.checked);
                      if (error) setError(null);
                    }}
                    className="mt-1 rounded border-border/40 bg-secondary/35 text-electric focus:ring-0 focus:ring-offset-0 cursor-pointer accent-electric"
                  />
                  <div className="flex flex-col">
                    <span className="font-mono text-[11.5px] text-platinum font-semibold group-hover:text-electric transition-colors">
                      Acepto los términos y políticas constitucionales{" "}
                      <span className="text-rose-400">*</span>
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 py-3 text-center animate-fade-in flex flex-col items-center">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="size-10" />
              </div>

              <div>
                <h4 className="font-display text-[22px] text-pearl font-semibold tracking-tight">
                  Registro Completado
                </h4>
                <p className="text-[13px] text-muted-foreground leading-relaxed mt-1">
                  Tu identidad en el Nodo Cero ha sido registrada de forma segura. Bienvenido a
                  Isabella Villaseñor AI.
                </p>
              </div>

              <div className="bg-secondary/15 rounded-2xl p-4 border border-border/30 w-full font-mono text-[11px] text-left space-y-1.5 shadow-inner">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Operador:</span>
                  <span className="text-platinum font-semibold">{username}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">ID Cripto:</span>
                  <span className="text-electric font-semibold">
                    usr_node_0_{username.trim().toLowerCase().slice(0, 5)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Telemetría:</span>
                  <span
                    className={
                      telemetryConsent
                        ? "text-emerald-400 font-semibold"
                        : "text-rose-400 font-semibold"
                    }
                  >
                    {telemetryConsent ? "ACTIVA" : "INACTIVA"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="bg-secondary/15 border-t border-border/20 px-6 py-4 flex justify-between gap-3 items-center">
          {step < 3 ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep((s) => Math.max(1, s - 1));
                }}
                disabled={step === 1}
                className="px-4 py-2 border border-border/30 text-muted-foreground hover:text-platinum font-mono text-[11px] uppercase tracking-wider rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 hover:bg-secondary/20"
              >
                <ArrowLeft className="size-3.5" />
                Atrás
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2 bg-electric/25 hover:bg-electric/35 text-electric border border-electric/35 font-mono text-[11px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(110,234,255,0.15)] active:scale-95"
              >
                Siguiente
                <ArrowRight className="size-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 font-mono text-[11px] uppercase tracking-[0.2em] rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)] active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <Sparkles className="size-4" />
              Comenzar Exploración
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
