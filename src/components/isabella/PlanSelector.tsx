import { useState } from "react";
import { Check, Zap } from "lucide-react";

export interface SubscriptionTier {
  id: string;
  name: string;
  price: string;
  billing: string;
  description: string;
  badge?: string;
  icon: "free" | "personal" | "creator" | "enterprise";
  features: string[];
}

interface PlanSelectorProps {
  currentPlanId: string | null;
  onSelectPlan: (planId: string) => void;
}

export function PlanSelector({ currentPlanId, onSelectPlan }: PlanSelectorProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const plans: SubscriptionTier[] = [
    {
      id: "free",
      name: "Isabella Free",
      price: "Gratuito",
      billing: "Para siempre",
      description: "Acceso básico a las capacidades cognitivas territoriales.",
      icon: "free",
      features: [
        "Límite de 50 mensajes mensuales",
        "Modulación empática de ISA Core",
        "Verificaciones de SOPHIA Engine",
        "Soberanía de datos local",
        "Soporte comunitario",
      ],
    },
    {
      id: "personal",
      name: "Isabella Personal",
      price: billingCycle === "monthly" ? "$9.99" : "$7.99",
      billing: billingCycle === "monthly" ? "/mes" : "/mes, facturado anual",
      description: "Ideal para operadores individuales que buscan memoria ampliada.",
      badge: "Popular",
      icon: "personal",
      features: [
        "Mensajes mensuales ilimitados",
        "Memoria persistente de sesión ampliada",
        "Acceso preferente de red (latencia reducida)",
        "Síntesis vocal HD de ISA Core",
        "Prioridad de inferencia media",
      ],
    },
    {
      id: "pro",
      name: "Isabella Creator",
      price: billingCycle === "monthly" ? "$19.99" : "$15.99",
      billing: billingCycle === "monthly" ? "/mes" : "/mes, facturado anual",
      description: "Capacidades de integración total con APIs territoriales y GIS.",
      icon: "creator",
      features: [
        "Todo lo incluido en Personal",
        "Invocación avanzada del motor ORION",
        "Llaves de API con scopes expandidos",
        "Ejecución segura de Skills PRAXIS",
        "Integración con el Gemelo Digital GEMET",
        "Soporte prioritario 24/7",
      ],
    },
    {
      id: "enterprise",
      name: "Isabella Enterprise",
      price: "Personalizado",
      billing: "Contrato institucional",
      description: "Nodos dedicados para corporaciones y administraciones públicas.",
      icon: "enterprise",
      features: [
        "Mallas e infraestructura dedicadas CITEMESH",
        "Cumplimiento legislativo y resguardo de datos soberanos",
        "Entrenamientos locales parametrizados",
        "Soporte dedicado PQC con ingenieros cognitivos",
        "SLA garantizado del 99.9%",
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Selector controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/20 pb-5">
        <div>
          <h4 className="font-mono text-[13px] font-semibold text-pearl flex items-center gap-2">
            <Zap className="size-4 text-electric animate-pulse" />
            Niveles de Membresía Constitucional
          </h4>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            Compara y adquiere membresías soberanas directamente. Financiación 100% ética.
          </p>
        </div>
        {/* Toggle billing cycle */}
        <div className="bg-secondary/20 p-1 rounded-xl border border-border/30 flex items-center self-start sm:self-auto">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`px-3 py-1 font-mono text-[10px] rounded-lg transition-all ${
              billingCycle === "monthly"
                ? "bg-electric/25 text-platinum font-semibold"
                : "text-muted-foreground hover:text-platinum"
            }`}
          >
            Mensual
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={`px-3 py-1 font-mono text-[10px] rounded-lg transition-all ${
              billingCycle === "yearly"
                ? "bg-electric/25 text-platinum font-semibold"
                : "text-muted-foreground hover:text-platinum"
            }`}
          >
            Anual (-20%)
          </button>
        </div>
      </div>

      {/* Grid of plans */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = currentPlanId === p.id || (p.id === "free" && !currentPlanId);
          return (
            <div
              key={p.id}
              className={`glass rounded-3xl p-5 border flex flex-col justify-between transition-all relative ${
                isCurrent
                  ? "border-electric/70 shadow-[0_0_15px_-5px_var(--electric)] bg-electric/5"
                  : "border-border/30 hover:border-border/60"
              }`}
            >
              {p.badge && (
                <span className="absolute -top-2.5 right-4 bg-electric text-background font-mono text-[8.5px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">
                  {p.badge}
                </span>
              )}

              <div className="space-y-4">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Plan {p.id}
                  </span>
                  <h5 className="font-display text-[16px] text-pearl font-bold mt-1">{p.name}</h5>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5 h-10">
                    {p.description}
                  </p>
                </div>

                <div className="border-t border-border/20 pt-4">
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-[22px] font-bold text-platinum">{p.price}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{p.billing}</span>
                  </div>
                </div>

                <ul className="space-y-2 border-t border-border/20 pt-4 flex-1">
                  {p.features.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[11px] text-platinum/90 leading-relaxed"
                    >
                      <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 pt-4 border-t border-border/20">
                <button
                  onClick={() => onSelectPlan(p.id)}
                  disabled={isCurrent}
                  className={`w-full py-2 rounded-xl font-mono text-[10px] uppercase tracking-wider transition-all border ${
                    isCurrent
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-default"
                      : "bg-secondary/15 border-border/40 text-platinum hover:bg-secondary/35 hover:border-border/60"
                  }`}
                >
                  {isCurrent ? "Plan Activo" : "Seleccionar Plan"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
