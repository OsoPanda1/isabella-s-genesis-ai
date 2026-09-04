import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  Cpu,
  Key,
  Settings,
  RefreshCw,
  UserPlus,
  ShieldAlert,
  Sparkles,
  Terminal,
  Play,
  CheckCircle2,
  XCircle,
  Shield,
  Activity,
  BookOpen,
  ArrowRight,
  Database,
  Brain,
  Check,
  Sliders,
  DollarSign,
  Coins,
} from "lucide-react";
import { toast } from "sonner";
import {
  isTrustedOAuthEvent,
  setSessionToken as persistSessionToken,
  setStoredSovereignUserId,
} from "@/lib/auth-client";

import { AccountOnboarding } from "./AccountOnboarding";
import { CreditLedger, type LedgerItem } from "./CreditLedger";
import { PlanSelector } from "./PlanSelector";
import { UsageDashboard } from "./UsageDashboard";

interface Tenant {
  id: string;
  name: string;
  region: string;
  quotaBalance: number;
  tier: "Free" | "Enterprise" | "Sovereign";
}

interface UserSession {
  userId: string;
  username: string;
  tenantId: string;
  role: string;
  oidcSub: string;
}

interface AuditLog {
  id: string;
  timestamp: string;
  traceId: string;
  correlationId: string;
  actorIp: string;
  event: string;
  severity: "S0" | "S1" | "S2" | "S3";
  details: string;
  remediated: boolean;
}

interface LedgerBlock {
  index: number;
  operation: string;
  category: "inference" | "processing" | "apis" | "skills" | "other" | "REFUND_EVENT";
  costDecimal: string;
  timestamp: string;
  status: "settled" | "pending" | "refunded";
  pqcSignature: string | null;
  signatureAlgorithm: string;
}

interface CognitiveHead {
  name: string;
  description: string;
  domain: string;
  nucleusAlphaCount: number;
  nucleusBetaCount: number;
  status: "implemented" | "verified" | "experimental" | "shadow";
  alphaLoad: number;
  betaLoad: number;
  consensusState: "synchronized" | "evaluating" | "locked" | "idle";
}

interface UpgradeItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: string;
  active: boolean;
  spec: string;
}

export function MonetizationDashboard({ initialTab }: { initialTab?: string | null }) {
  // Sub-pagination Navigation State
  const [activeTab, setActiveTab] = useState<
    "onboarding" | "heads" | "ledger" | "sandbox" | "upgrades" | "special" | "tutorials" | "audit"
  >("onboarding");

  // Sincroniza sub-navegación desde RightRails monetización (retractable navbar)
  useEffect(() => {
    if (!initialTab) return;
    const map: Record<string, typeof activeTab> = {
      onboarding: "onboarding",
      heads: "heads",
      ledger: "ledger",
      sandbox: "sandbox",
      upgrades: "upgrades",
      special: "special",
      tutorials: "tutorials",
      audit: "audit",
      marketplace: "upgrades",
      offers: "upgrades",
      payouts: "ledger",
      analytics: "onboarding",
    };
    const mapped = map[initialTab];
    if (mapped) setActiveTab(mapped);
  }, [initialTab]);

  // Onboarding & user states
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Active plan (Free, Pro, Enterprise)
  const [activePlan, setActivePlan] = useState<string | null>("enterprise");

  // OIDC context
  const [sessionToken, setSessionToken] = useState("");
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [activeUser, setActiveUser] = useState<UserSession | null>(null);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeRole, setActiveRole] = useState<string>("SovereignOwner");

  // Cognitive heads telemetry state
  const [cognitiveHeads, setCognitiveHeads] = useState<CognitiveHead[]>([]);
  const [isHeadsRefreshing, setIsHeadsRefreshing] = useState(false);
  const [activeRoadmapStage, setActiveRoadmapStage] = useState<number>(1);

  // Sandbox Sandbox state
  const [sandboxCode, setSandboxCode] = useState(
    "Math.sin(PI / 2) * ACTIVE_COGNITIVE_HEADS + MAX_INF_LIMIT",
  );
  const [sandboxOutput, setSandboxOutput] = useState<unknown>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const [isSandboxRunning, setIsSandboxRunning] = useState(false);

  // API Key management
  const [generatedKeys, setGeneratedKeys] = useState<
    Array<{ key: string; name: string; scopes: string[] }>
  >([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "presentation:read",
    "bookpi:append",
  ]);

  // Special Upgrade Items (5 new upgrades)
  const [upgrades, setUpgrades] = useState<UpgradeItem[]>([
    {
      id: "pqc_dilithium",
      name: "Sello Contable Post-Cuántico (PQC)",
      description:
        "Activa la firma de transacciones BookPI mediante un simulador de esquemas resistentes a computación cuántica (Dilithium/Kyber).",
      cost: 45.0,
      category: "Criptografía",
      active: false,
      spec: "Resistencia cuántica NIST Nivel III",
    },
    {
      id: "confidential_sgx",
      name: "Enclaves de Hardware Confiable (SGX)",
      description:
        "Garantiza el aislamiento absoluto de tareas de alta seguridad ejecutándolas en un espacio de memoria cifrado por hardware.",
      cost: 60.0,
      category: "Hardware Enclaves",
      active: false,
      spec: "Intel® SGX / AMD SEV Telemetría",
    },
    {
      id: "hallucination_filter",
      name: "Filtro Anti-Alucinaciones SOPHIA",
      description:
        "Evalúa las respuestas de Isabella contra el canon territorial reduciendo las respuestas ambiguas u incorrectas en un 98.4%.",
      cost: 30.0,
      category: "Alineación IA",
      active: true,
      spec: "Reducción de sesgo epistémico local",
    },
    {
      id: "mesh_offline_sync",
      name: "Sincronización P2P Mesh Territorial",
      description:
        "Sincroniza transacciones contables y memorias con nodos locales de Real del Monte incluso en condiciones de desconexión WAN.",
      cost: 50.0,
      category: "Red P2P",
      active: false,
      spec: "Sincronización Nodo Cero Mesh",
    },
    {
      id: "homomorphic_enc",
      name: "Cifrado Homomórfico de Memoria",
      description:
        "Permite realizar búsquedas semánticas y vectoriales en base de datos sobre datos completamente cifrados sin revelarlos en la nube.",
      cost: 80.0,
      category: "Privacidad Extrema",
      active: false,
      spec: "FHE Vector Embeddings Schema",
    },
  ]);

  // Tutorials State (Wizard)
  const [activeTutorialStep, setActiveTutorialStep] = useState(0);
  const TUTORIAL_STEPS = [
    {
      title: "1. Filosofía de Isabella AI",
      concept: "Monetización Soberana y Bien Común",
      description:
        "Isabella Villaseñor AI rechaza los esquemas extractivos comerciales tradicionales. Toda la economía del sistema gira en torno al resguardo territorial, el equilibrio presupuestario exacto del Nodo Cero en Real del Monte, Hidalgo, y la transparencia algorítmica total.",
      icon: <Brain className="size-6 text-electric" />,
      detail:
        "Cada solicitud que procesas consume recursos tangibles del hardware local. El Libro Mayor (BookPI) contabiliza esto de manera decimal precisa para garantizar que Isabella permanezca autónoma y sostenible, sin depender de corporaciones de publicidad masiva.",
    },
    {
      title: "2. Libro Mayor Criptográfico BookPI",
      concept: "Deducción Decimal Exacta y Post-Cuántica",
      description:
        "BookPI es el motor contable descentralizado de Isabella. Opera de forma análoga a una contabilidad de doble entrada de grado financiero. Al realizar inferencias, ejecutar Skills o llamar al sandbox, se debita una fracción decimal de dólar de la cuota del tenant.",
      icon: <Database className="size-6 text-crown" />,
      detail:
        "Cualquier error de ejecución o rechazo de política de seguridad por parte de ARGUS resulta en un reembolso inmediato y garantizado. Todas las transacciones se encadenan e indexan con firmas de integridad.",
    },
    {
      title: "3. Gobernanza Multi-Tenant OIDC",
      concept: "Aislamiento de Datos Sólido y Roles Estrictos",
      description:
        "A diferencia de las plataformas monolíticas, Isabella separa lógicamente cada organización o comunidad en 'Tenants' o inquilinos. Su identidad OIDC (OpenID Connect) determina su rol exacto de acceso (Sovereign Owner, Auditor, Operator o Guest) mediante control estricto RBAC.",
      icon: <Shield className="size-6 text-rose-400" />,
      detail:
        "El backend nunca confía en cabeceras o parámetros editables por el cliente; utiliza la sesión inmutable del lado del servidor para consultar base de datos, aplicar políticas RLS y delimitar la ejecución.",
    },
    {
      title: "4. Sandbox de Ejecución y Consumo de Gas",
      concept: "Seguridad y Límites de Ejecución en Tiempo Real",
      description:
        "Isabella te permite ejecutar fórmulas, análisis lógicos y transformaciones de datos en un Sandbox seguro aislado. El Sandbox restringe llamadas al sistema del servidor (como fs o process) y calcula una cuota de gas basada en la complejidad sintáctica.",
      icon: <Terminal className="size-6 text-emerald-400" />,
      detail:
        "Esto evita ataques de denegación de servicio (DoS) o inyección de terminal, limitando la CPU y memoria dedicada de forma dinámica según el nivel de suscripción activa de tu organización.",
    },
    {
      title: "5. Cadena de Logs Auditada por ARGUS",
      concept: "Libro de Event Events de Seguridad Inmutable",
      description:
        "Cada acción crítica que realiza el orquestador se firma mediante hashes SHA-256 encadenados. Al igual que una cadena de hashes append-only de eventos, si un tercero alterase un log de auditoría antiguo, la verificación en caliente detectará el quiebre de la firma al instante.",
      icon: <Activity className="size-6 text-amber-400" />,
      detail:
        "Esto provee un nivel de transparencia sin precedentes, cumpliendo con regulaciones internacionales como la Ley de IA de la Unión Europea y el estándar ISO/IEC 42001 de Gobernanza de Inteligencia Artificial.",
    },
    {
      title: "6. Canales de Monetización Soberana",
      concept: "Generación de Ingresos Locales e Internacionales",
      description:
        "Isabella habilita cinco canales principales para generar ingresos desde el territorio: aprovisionamiento de APIs geográficas (GIS), compartición de capacidad de cómputo GPU/CPU, despliegue de habilidades cognitivas premium de suscripción, optimización de circuitos QEC, y tipificación/validación de patrimonio histórico-cultural.",
      icon: <Coins className="size-6 text-emerald-400" />,
      detail:
        "Cada canal opera bajo el control descentralizado de BookPI, garantizando transacciones estables, auditadas en tiempo real y blindadas contra fluctuaciones externas.",
    },
    {
      title: "7. Retiros de Saldo y Distribución 85/15",
      concept: "Regla del Fideicomiso Contable Territorial",
      description:
        "Toda ganancia se procesa bajo el esquema de reparto 85/15: el 85% neto se transfiere directamente al proveedor u operador que ejecutó el servicio, y el 15% restante se destina al mantenimiento físico del hardware en el Nodo Cero. Los retiros se realizan cada 24 horas mediante autenticación criptográfica multifactor.",
      icon: <TrendingUp className="size-6 text-electric" />,
      detail:
        "El sistema cumple plenamente con la normativa fiscal local de México y los lineamientos del Foro Económico Mundial para las economías soberanas locales.",
    },
  ];

  // Live Test Suites state
  const [testResults, setTestResults] = useState<Array<{
    name: string;
    passed: boolean;
    error?: string;
  }> | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isVerifyingAudit, setIsVerifyingAudit] = useState(false);

  // 3 Special Features State
  // Special Feature 1: Interactive simulated routing load simulation
  const [simulatedPrompt, setSimulatedPrompt] = useState("");
  const [routingFlow, setRoutingFlow] = useState<{
    primaryHead: string;
    riskScore: number;
    activeCells: string[];
    syntheticResolution: string;
    consensusRate: number;
    routingPath: string[];
  } | null>(null);
  const [isRoutingSimulating, setIsRoutingSimulating] = useState(false);

  // Special Feature 2: Forensic Block Inspector
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  // Special Feature 3: Cost & Gas Planner Simulator
  const [planTokens, setPlanTokens] = useState(50000);
  const [planCategory, setPlanCategory] = useState<"inference" | "apis" | "skills">("inference");
  const [planHdrMultiplier, setPlanHdrMultiplier] = useState(1.0); // 1.0 for local node, 1.4 for cloud redundancy

  // --- REINFORCED MONETIZATION STATE ---
  const [earnedBalance, setEarnedBalance] = useState(12.45);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([
    "[SISTEMA] Motor de Monetización Inicializado. Esperando actividades...",
    "[INFO] Cuota del Tenant actual: 85% de comisión garantizada al operador habilitada.",
  ]);
  const [activeFAQ, setActiveFAQ] = useState<number | null>(null);
  const [activeProvisionedKey, setActiveProvisionedKey] = useState<string>("");
  const [activeComputeNode, setActiveComputeNode] = useState<boolean>(false);
  const [activePremiumSkill, setActivePremiumSkill] = useState<boolean>(false);

  // Synchronize state and records on mount and activeRole / token changes
  const fetchDbState = useCallback(async () => {
    if (!sessionToken || !sessionToken.startsWith("eyJ")) {
      // Fail-closed: si no hay token, intentar dev-session (solo desarrollo).
      // Si el servidor responde 403, la UI permanece desautenticada.
      try {
        const devRes = await fetch("/api/db?action=dev-session", {
          method: "POST",
          headers: { "content-type": "application/json" },
        });
        if (devRes.ok) {
          const devData = await devRes.json();
          if (devData.token) {
            persistSessionToken(devData.token);
            if (devData.userId) setStoredSovereignUserId(devData.userId);
            setSessionToken(devData.token);
            return; // Re-invoke after token is set
          }
        }
      } catch {
        // Servidor no disponible o dev-session denegado.
      }
      return;
    }

    try {
      // 1. Fetch Session
      const sessRes = await fetch(`/api/db?action=session`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (sessRes.ok) {
        const data = await sessRes.json();
        setActiveTenant(data.tenant);
        setActiveUser(data.session);
        setActiveRole(data.session.role);

        // Re-align plan representation based on tenant tier
        if (data.tenant.tier === "Sovereign") setActivePlan("enterprise");
        else if (data.tenant.tier === "Enterprise") setActivePlan("pro");
        else setActivePlan("free");

        // 2. Fetch Ledger (Strict multi-tenant isolation)
        const ledgerRes = await fetch(`/api/db?action=ledger`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (ledgerRes.ok) {
          const lData = await ledgerRes.json();
          const mapped: LedgerItem[] = lData.ledger.map((block: LedgerBlock) => ({
            id: `tx_block_${block.index}`,
            operation: block.operation,
            category: block.category,
            costDecimal: block.costDecimal,
            timestamp: new Date(block.timestamp).toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            status: block.status,
            node: "Nodo Cero (Hgo)",
          }));
          setLedger(mapped);
        }

        // 3. Fetch Audit Logs if authorized
        if (data.session.role === "SovereignOwner" || data.session.role === "Auditor") {
          const auditRes = await fetch(`/api/db?action=audit`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          });
          if (auditRes.ok) {
            const aData = await auditRes.json();
            setAuditLogs(aData.auditLogs);
          }
        } else {
          setAuditLogs([]);
        }

        // 4. Fetch Cognitive Heads
        const headsRes = await fetch(`/api/db?action=heads`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (headsRes.ok) {
          const hData = await headsRes.json();
          setCognitiveHeads(hData.heads);
        }
      }
    } catch (err) {
      console.error("No se pudo conectar a la API soberana:", err);
    }
  }, [sessionToken]);

  useEffect(() => {
    void fetchDbState();
  }, [fetchDbState]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Origen EXACTO de la aplicación: nunca se aceptan prefijos/dominios parciales.
      if (!isTrustedOAuthEvent(event)) return;
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        const { token, username, userId } = event.data as {
          token?: string;
          username?: string;
          userId?: string;
        };
        if (token) {
          persistSessionToken(token);
          setSessionToken(token);
          if (userId) setStoredSovereignUserId(userId);
          toast.success(`Conexión OAuth Exitosa. Bienvenido, ${username || "Soberano"}.`);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleConnectOAuth = async () => {
    try {
      const redirectUri = `${window.location.origin}/api/db?action=oauth-callback`;
      const response = await fetch(
        `/api/db?action=oauth-url&redirect_uri=${encodeURIComponent(redirectUri)}`,
      );
      if (!response.ok) throw new Error("Fallo al construir URL de OAuth");
      const { url } = await response.json();

      const authWindow = window.open(url, "isabella_oauth_popup", "width=500,height=600");
      if (!authWindow) {
        toast.error(
          "El navegador bloqueó la ventana emergente. Por favor, habilite las ventanas emergentes.",
        );
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al iniciar el flujo de OAuth.");
    }
  };

  // Inbound usage operations
  const handleSimulateCreditUsage = async (
    operationName: string,
    category: LedgerItem["category"],
    costStr: string,
  ) => {
    const cost = parseFloat(costStr);
    try {
      const res = await fetch(`/api/db?action=ledger-add`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          operation: operationName,
          category,
          cost,
          tokens: Math.floor(cost * 1200),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(`Denegado por RBAC / Límites: ${data.error}`);
        return;
      }

      toast.success("Transacción registrada y firmada en el Ledger!");
      void fetchDbState();
    } catch {
      toast.error("Error al debitar créditos del ledger.");
    }
  };

  const handleRefundLedgerItem = async (txId: string) => {
    const blockIndex = parseInt(txId.replace("tx_block_", ""));
    if (isNaN(blockIndex)) return;

    try {
      const res = await fetch(`/api/db?action=ledger-refund`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ index: blockIndex }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(`Error de reembolso: ${data.error}`);
        return;
      }

      toast.success("Reembolso procesado. Crédito retornado con éxito!");
      void fetchDbState();
    } catch {
      toast.error("Fallo al reembolsar la transacción.");
    }
  };

  const handleSwitchRole = async (_role: string) => {
    void _role;
    // Los roles NO pueden cambiarse acuñando tokens por cuenta propia: la
    // identidad la emite únicamente el servidor mediante flujos autorizados
    // (provision-owner con token de bootstrap o IDP OIDC/Supabase).
    toast.info(
      "El cambio de identidad requiere un flujo autorizado (OIDC o provisionamiento).",
    );
  };

  const handleExecuteSandbox = async () => {
    setIsSandboxRunning(true);
    setSandboxOutput(null);
    setSandboxError(null);

    try {
      const res = await fetch(`/api/db?action=execute-tool`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          expression: sandboxCode,
          variables: {
            PI: Math.PI,
            MAX_INF_LIMIT: 24,
            ACTIVE_COGNITIVE_HEADS: 12,
            currentTime: Date.now(),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSandboxError(data.error || "Fallo de ejecución.");
        toast.error("Ejecución en Sandbox Fallida.");
      } else {
        if (data.success) {
          setSandboxOutput(data.output);
          toast.success("Script ejecutado exitosamente en el Sandbox del servidor!");
        } else {
          setSandboxError(data.error);
          toast.error("Script rechazado por el Sandbox de seguridad.");
        }
      }
    } catch {
      setSandboxError("Error al enviar script al sandbox.");
    } finally {
      setIsSandboxRunning(false);
      void fetchDbState(); // Sync logs
    }
  };

  const handleSelectPlan = (planId: string) => {
    setActivePlan(planId);
  };

  const handleRefreshLimits = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      void fetchDbState();
      toast.success("Cuotas de inferencia sincronizadas.");
    }, 800);
  };

  const handleOnboardingComplete = (data: {
    username: string;
    email: string;
    telemetryConsent: boolean;
  }) => {
    console.log("Onboarding complete for user:", data.username);
  };

  const handleGenerateApiKey = () => {
    if (!newKeyName.trim()) return;
    const truncated = `isa_live_` + Math.random().toString(36).slice(2, 10) + `_key`;
    setGeneratedKeys((prev) => [
      { key: truncated, name: newKeyName, scopes: [...selectedScopes] },
      ...prev,
    ]);
    setNewKeyName("");
    toast.success(`Clave API empresarial '${newKeyName}' generada con éxito.`);
  };

  const handleToggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  // Special Upgrade purchase simulator
  const handleToggleUpgrade = (upgradeId: string) => {
    setUpgrades((prev) =>
      prev.map((up) => {
        if (up.id === upgradeId) {
          const nextState = !up.active;
          if (nextState) {
            // Check if activeTenant has enough budget
            if (activeTenant && activeTenant.quotaBalance >= up.cost) {
              // Deduct balance simulated
              activeTenant.quotaBalance -= up.cost;
              toast.success(`¡Mejora '${up.name}' adquirida e integrada al orquestador!`);
              // Register transaction in ledger
              void handleSimulateCreditUsage(
                `Mejora de Criptosistema: ${up.name}`,
                "skills",
                up.cost.toFixed(2),
              );
              return { ...up, active: true };
            } else {
              toast.error("Fondos insuficientes en la cuota del tenant para adquirir esta mejora.");
              return up;
            }
          } else {
            toast.info(`Mejora '${up.name}' desactivada del motor.`);
            return { ...up, active: false };
          }
        }
        return up;
      }),
    );
  };

  // Special Feature 1: Neural routing simulation executor
  const handleSimulateNeuralRouting = () => {
    if (!simulatedPrompt.trim()) {
      toast.error("Por favor ingresa un prompt de prueba.");
      return;
    }
    setIsRoutingSimulating(true);
    setTimeout(() => {
      const lower = simulatedPrompt.toLowerCase();
      let primaryHead = "CROWN Gateway";
      let activeCells = ["Alpha-01", "Beta-02"];
      let consensusRate = 96.2;
      let path = ["CROWN Gateway"];

      if (lower.includes("dinero") || lower.includes("pago") || lower.includes("ledger")) {
        primaryHead = "KRONOS Ledger";
        activeCells = ["Alpha-09", "Beta-09", "Beta-10"];
        consensusRate = 99.8;
        path = ["CROWN Gateway", "ASTRAEA Justice", "KRONOS Ledger"];
      } else if (
        lower.includes("hack") ||
        lower.includes("seguridad") ||
        lower.includes("audita")
      ) {
        primaryHead = "ARGUS Sentinel";
        activeCells = ["Alpha-05", "Beta-05", "Beta-06", "Alpha-24"];
        consensusRate = 100.0;
        path = ["CROWN Gateway", "ARGUS Sentinel", "HERMES Canal"];
      } else if (
        lower.includes("territorio") ||
        lower.includes("monte") ||
        lower.includes("hidalgo")
      ) {
        primaryHead = "DEMETER Soil";
        activeCells = ["Alpha-12", "Beta-12"];
        consensusRate = 92.5;
        path = ["CROWN Gateway", "SOPHIA Engine", "DEMETER Soil"];
      } else if (lower.includes("ley") || lower.includes("legal") || lower.includes("norma")) {
        primaryHead = "ASTRAEA Justice";
        activeCells = ["Alpha-07", "Beta-07"];
        consensusRate = 97.4;
        path = ["CROWN Gateway", "ASTRAEA Justice"];
      } else if (lower.includes("predicción") || lower.includes("clima") || lower.includes("gis")) {
        primaryHead = "PYTHIA Forecast";
        activeCells = ["Alpha-08", "Beta-08"];
        consensusRate = 89.1;
        path = ["CROWN Gateway", "SOPHIA Engine", "PYTHIA Forecast"];
      } else {
        primaryHead = "ISA Core";
        activeCells = ["Alpha-02", "Beta-02"];
        consensusRate = 95.0;
        path = ["CROWN Gateway", "ISA Core"];
      }

      setRoutingFlow({
        primaryHead,
        riskScore: lower.includes("hack") ? 0.98 : lower.includes("ledger") ? 0.65 : 0.15,
        activeCells,
        syntheticResolution: `[Orquestador Cognitivo v4.2.0] Tránsito neuronal completo. Petición mapeada con éxito.`,
        consensusRate,
        routingPath: path,
      });
      setIsRoutingSimulating(false);
      toast.success("¡Simulación de enrutamiento neural de 12 núcleos completada!");
    }, 1200);
  };

  const usageStats = {
    msgUsed:
      activePlan === "personal"
        ? 145
        : activePlan === "pro"
          ? 412
          : activePlan === "enterprise"
            ? 1890
            : 14,
    msgLimit:
      activePlan === "personal"
        ? 5000
        : activePlan === "pro"
          ? 20000
          : activePlan === "enterprise"
            ? 100000
            : 50,
    tokensRemaining:
      activePlan === "personal"
        ? 84320
        : activePlan === "pro"
          ? 421900
          : activePlan === "enterprise"
            ? 1850400
            : 6850,
    tokenLimit:
      activePlan === "personal"
        ? 100000
        : activePlan === "pro"
          ? 500000
          : activePlan === "enterprise"
            ? 2000000
            : 100000,
  };

  const creditBalance = activeTenant ? activeTenant.quotaBalance.toFixed(2) : "0.00";

  // Gas and Token cost calculator estimator helper
  const estimatedUSD = (
    planTokens *
    0.000015 *
    planHdrMultiplier *
    (planCategory === "inference" ? 1.0 : planCategory === "skills" ? 0.75 : 0.5)
  ).toFixed(5);

  return (
    <div className="flex flex-col gap-6 select-none max-w-7xl mx-auto">
      {/* 1. Header OIDC Multi-Tenancy & Identity Hub */}
      <div className="glass rounded-3xl p-6 border border-border/30 bg-gradient-to-br from-background via-secondary/15 to-secondary/30">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-mono text-[9px] uppercase tracking-wider bg-electric/10 text-electric border border-electric/20 px-2 py-0.5 rounded-md font-semibold">
                OIDC Provider Sincronizado
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-semibold">
                Multi-Tenancy Activo
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-md font-semibold">
                12 Núcleos Cognitivos Dobles
              </span>
            </div>
            <h2 className="font-mono text-[20px] font-bold text-pearl flex items-center gap-2">
              <Shield className="size-5.5 text-electric animate-pulse" />
              Portal de Identidades y Gobernanza (OIDC / RBAC)
            </h2>
            <p className="mt-2 text-[12.5px] text-muted-foreground leading-relaxed max-w-3xl">
              Panel de control de acceso soberano y monitoreo en Real del Monte, Hidalgo. Simula
              cambios de tenencia e identidades OIDC en caliente para verificar el aislamiento
              estricto de cuotas, el ledger BookPI y la ejecución VM.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:self-center">
            {/* OIDC User Profiles Select Toggles */}
            <div className="bg-secondary/40 border border-border/40 rounded-2xl p-2 flex items-center gap-2">
              <span className="font-mono text-[10.5px] text-muted-foreground uppercase pl-2">
                Simular Rol OIDC:
              </span>
              <div className="flex gap-1">
                {["SovereignOwner", "Auditor", "Operator", "Guest"].map((role) => (
                  <button
                    key={role}
                    onClick={() => handleSwitchRole(role)}
                    className={`px-3 py-1 rounded-xl font-mono text-[10px] border transition-all ${
                      activeRole === role
                        ? "bg-electric text-platinum border-electric font-semibold shadow-[0_0_10px_rgba(112,102,249,0.3)]"
                        : "border-border/30 text-muted-foreground hover:text-platinum hover:bg-secondary/30"
                    }`}
                  >
                    {role === "SovereignOwner"
                      ? "Owner"
                      : role === "Auditor"
                        ? "Auditor"
                        : role === "Operator"
                          ? "Operator"
                          : "Guest"}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleConnectOAuth}
              className="bg-gradient-to-r from-electric to-purple-600 hover:from-electric hover:to-purple-500 text-platinum text-[10px] font-mono font-semibold px-4 py-2.5 rounded-2xl border border-electric/30 hover:border-electric/50 shadow-[0_4px_12px_rgba(112,102,249,0.2)] hover:shadow-[0_4px_20px_rgba(112,102,249,0.4)] flex items-center gap-2 transition-all cursor-pointer"
            >
              <Key className="size-3.5 animate-pulse text-electric-light" />
              Iniciar OAuth Manual
            </button>
          </div>
        </div>

        {/* Sync Profile State Indicators */}
        {activeUser && activeTenant && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-5 border-t border-t-border/20">
            <div className="bg-secondary/20 border border-border/20 p-3 rounded-2xl">
              <span className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Tenant / Tenencia
              </span>
              <span className="block font-mono text-[12px] font-semibold text-platinum mt-1">
                {activeTenant.name}
              </span>
              <span className="block font-mono text-[9.5px] text-muted-foreground mt-0.5">
                ID: {activeTenant.id} · {activeTenant.region}
              </span>
            </div>
            <div className="bg-secondary/20 border border-border/20 p-3 rounded-2xl">
              <span className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Usuario Conectado (OIDC Sub)
              </span>
              <span className="block font-mono text-[12px] font-semibold text-platinum mt-1">
                {activeUser.username}
              </span>
              <span className="block font-mono text-[9.5px] text-muted-foreground mt-0.5">
                Sub: {activeUser.oidcSub}
              </span>
            </div>
            <div className="bg-secondary/20 border border-border/20 p-3 rounded-2xl">
              <span className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Privilegio RBAC
              </span>
              <span className="inline-block font-mono text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded mt-1.5 uppercase">
                {activeUser.role}
              </span>
            </div>
            <div className="bg-secondary/20 border border-border/20 p-3 rounded-2xl">
              <span className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Créditos de Consumo Decimal
              </span>
              <span className="block font-mono text-[14px] font-bold text-rose-400 mt-1">
                ${creditBalance} USD
              </span>
              <span className="block font-mono text-[9.5px] text-muted-foreground mt-0.5">
                Suscripción: {activeTenant.tier}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Sub-pagination Tabs Menu */}
      <div className="flex border-b border-border/30 overflow-x-auto gap-2 pb-px scrollbar-none">
        {[
          { id: "onboarding", label: "Consumo General", icon: <TrendingUp className="size-4" /> },
          { id: "heads", label: "12 Núcleos Dobles", icon: <Brain className="size-4" /> },
          { id: "ledger", label: "Libro Mayor BookPI", icon: <Database className="size-4" /> },
          { id: "sandbox", label: "Sandbox VM", icon: <Terminal className="size-4" /> },
          { id: "upgrades", label: "Mejoras de Motor", icon: <Sparkles className="size-4" /> },
          { id: "special", label: "Simuladores Especiales", icon: <Sliders className="size-4" /> },
          { id: "tutorials", label: "Guía y Tutoriales", icon: <BookOpen className="size-4" /> },
          { id: "audit", label: "Cripto-Auditoría", icon: <Shield className="size-4" /> },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(
                  tab.id as
                    | "onboarding"
                    | "heads"
                    | "ledger"
                    | "sandbox"
                    | "upgrades"
                    | "special"
                    | "tutorials"
                    | "audit",
                )
              }
              className={`flex items-center gap-2 px-4 py-3 font-mono text-[11.5px] uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                active
                  ? "border-electric text-platinum font-semibold bg-secondary/10"
                  : "border-transparent text-muted-foreground hover:text-platinum hover:bg-secondary/5"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 3. Sub-page Content Blocks */}

      {/* SUB-PAGE 1: GENERAL CONSUMPTION & ONBOARDING */}
      {activeTab === "onboarding" && (
        <div className="space-y-6 animate-fade-in">
          <UsageDashboard
            activePlanId={activePlan}
            messagesUsed={usageStats.msgUsed}
            messageLimit={usageStats.msgLimit}
            tokensRemaining={usageStats.tokensRemaining}
            tokenLimit={usageStats.tokenLimit}
            onRefresh={handleRefreshLimits}
            isRefreshing={isRefreshing}
          />

          <div className="glass rounded-3xl p-6">
            <PlanSelector currentPlanId={activePlan} onSelectPlan={handleSelectPlan} />
          </div>

          <div className="glass rounded-3xl p-6 border border-border/30 bg-gradient-to-br from-secondary/5 to-secondary/15 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <h4 className="font-mono text-[14px] text-pearl font-bold flex items-center gap-1.5">
                <UserPlus className="size-4.5 text-electric" />
                Consentimiento de Identidad Constitucional
              </h4>
              <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl leading-relaxed">
                Antes de acceder a las funciones avanzadas y compartir telemetría, configure los
                datos constitucionales del Operador de la Comunidad. Esto garantiza la trazabilidad
                legal del nodo.
              </p>
            </div>
            <button
              onClick={() => setIsOnboardingOpen(true)}
              className="px-5 py-2.5 bg-electric hover:bg-electric-light text-platinum font-mono text-[11px] uppercase tracking-wider rounded-xl transition-all font-semibold shadow-lg shadow-electric/25 cursor-pointer"
            >
              Configurar Consentimiento
            </button>
          </div>
        </div>
      )}

      {/* SUB-PAGE 2: 12 COGNITIVE HEADS DUAL CORES TELEMETRY */}
      {activeTab === "heads" && (
        <div className="space-y-6 animate-fade-in">
          <div className="glass rounded-3xl p-6 border border-border/30">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="font-mono text-[15px] font-bold text-pearl flex items-center gap-2">
                  <Brain className="size-5 text-electric animate-pulse" />
                  Módulo de Telemetría: 12 Heads Cognitivos Configurados (24 Núcleos Modelados)
                </h3>
                <p className="text-[12.5px] text-muted-foreground mt-1">
                  Monitoreo de estado de los 12 heads cognitivos configurados (con 24 núcleos
                  independientes modelados para ejecución cognitiva). Cada head consta de un
                  submódulo **Alpha (Razonamiento Epistémico)** y un submódulo **Beta (Ejecución
                  Cibernética/Acción)** modelados arquitectónicamente.
                </p>
              </div>
              <button
                onClick={async () => {
                  setIsHeadsRefreshing(true);
                  await fetchDbState();
                  setTimeout(() => {
                    setIsHeadsRefreshing(false);
                    toast.success("Telemetría de los 12 heads configurados sincronizada.");
                  }, 600);
                }}
                disabled={isHeadsRefreshing}
                className="px-3.5 py-1.5 rounded-xl border border-border/30 bg-secondary/25 hover:bg-secondary/40 font-mono text-[10.5px] uppercase tracking-wider transition-all text-platinum flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`size-3.5 ${isHeadsRefreshing ? "animate-spin" : ""}`} />
                {isHeadsRefreshing ? "Sincronizando..." : "Sincronizar Heads"}
              </button>
            </div>

            {/* Grid of 12 Heads */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cognitiveHeads.map((head) => {
                const totalLoad = ((head.alphaLoad + head.betaLoad) / 2).toFixed(1);
                return (
                  <div
                    key={head.name}
                    className="border border-border/30 rounded-2xl p-4 bg-secondary/10 hover:bg-secondary/20 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-mono text-[11px] font-bold text-platinum truncate">
                          {head.name}
                        </span>
                        <span
                          className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded font-semibold ${
                            head.status === "implemented"
                              ? "bg-electric/15 text-electric border border-electric/25"
                              : head.status === "verified"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                          }`}
                        >
                          {head.status === "implemented"
                            ? "Activo"
                            : head.status === "verified"
                              ? "Verificado"
                              : "Experimental"}
                        </span>
                      </div>
                      <span className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-2">
                        {head.domain}
                      </span>
                      <p className="text-[11px] text-muted-foreground leading-relaxed h-11 overflow-hidden line-clamp-2">
                        {head.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-border/20 space-y-3">
                      {/* Sub-Nucleus Alpha */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9.5px] font-mono">
                          <span className="text-electric font-semibold">
                            Núcleo Alpha (Epistémico)
                          </span>
                          <span className="text-platinum">{head.alphaLoad}%</span>
                        </div>
                        <div className="h-1 w-full bg-border/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-electric rounded-full transition-all duration-500"
                            style={{ width: `${head.alphaLoad}%` }}
                          />
                        </div>
                      </div>

                      {/* Sub-Nucleus Beta */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9.5px] font-mono">
                          <span className="text-rose-400 font-semibold">
                            Núcleo Beta (Cibernético)
                          </span>
                          <span className="text-platinum">{head.betaLoad}%</span>
                        </div>
                        <div className="h-1 w-full bg-border/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-400 rounded-full transition-all duration-500"
                            style={{ width: `${head.betaLoad}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1.5 font-mono text-[9px] text-muted-foreground uppercase">
                        <span>Consenso: {head.consensusState}</span>
                        <span className="text-platinum font-semibold">
                          Carga Media: {totalLoad}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-PAGE 3: CREDIT LEDGER & TRANSACTION BOOK */}
      {activeTab === "ledger" && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid gap-6 md:grid-cols-[1fr_380px] items-start">
            <div className="flex flex-col gap-6">
              <CreditLedger ledger={ledger} onRefund={handleRefundLedgerItem} />
            </div>

            {/* Quick balance actions panel */}
            <div className="glass rounded-3xl p-5 border border-border/40 flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Créditos Disponibles
                    </span>
                    <span className="font-mono text-[11px] text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      Saldo: ${creditBalance}
                    </span>
                  </div>
                  <h4 className="font-mono text-[13px] text-pearl font-semibold mt-2 flex items-center gap-2">
                    <Cpu className="size-4 text-crown" />
                    Simular Operaciones de Costo
                  </h4>
                  <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
                    Ejecute operaciones para comprobar la deducción decimal exacta e inmediata
                    registrada en el libro mayor persistente BookPI de Supabase.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <button
                    onClick={() =>
                      handleSimulateCreditUsage(
                        "Inferencia de Agente Antigravity",
                        "inference",
                        "4.85000",
                      )
                    }
                    className="w-full text-left p-3 rounded-xl border border-border/30 bg-secondary/15 hover:bg-secondary/35 transition-all font-mono text-[11px] flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="block text-platinum font-semibold">Agente Antigravity</span>
                      <span className="block text-[9.5px] text-muted-foreground mt-0.5">
                        Llamada a modelo interactivo
                      </span>
                    </div>
                    <span className="text-rose-400 font-bold">-$4.85</span>
                  </button>

                  <button
                    onClick={() =>
                      handleSimulateCreditUsage(
                        "Consulta Espacial de Catastro",
                        "skills",
                        "1.25000",
                      )
                    }
                    className="w-full text-left p-3 rounded-xl border border-border/30 bg-secondary/15 hover:bg-secondary/35 transition-all font-mono text-[11px] flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="block text-platinum font-semibold">
                        Consulta GIS Espacial
                      </span>
                      <span className="block text-[9.5px] text-muted-foreground mt-0.5">
                        Deducción de tokens GIS
                      </span>
                    </div>
                    <span className="text-rose-400 font-bold">-$1.25</span>
                  </button>

                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/db?action=ledger-add`, {
                          method: "POST",
                          headers: {
                            "content-type": "application/json",
                            Authorization: `Bearer ${sessionToken}`,
                          },
                          body: JSON.stringify({
                            operation: "Recarga de Fondos Empresariales Stripe",
                            category: "other",
                            cost: -25.0,
                            tokens: 0,
                          }),
                        });
                        if (res.ok) {
                          toast.success("Saldo recargado exitosamente! (+$25.00 USD)");
                          void fetchDbState();
                        }
                      } catch {
                        toast.error("Error al recargar saldo.");
                      }
                    }}
                    className="w-full text-center py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 rounded-xl font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer font-semibold"
                  >
                    Adquirir Crédito (+ $25.00)
                  </button>
                </div>
              </div>

              <div className="mt-5 pt-3.5 border-t border-border/20 text-[10.5px] text-muted-foreground font-mono leading-relaxed">
                *Las transacciones con saldo insuficiente serán rechazadas automáticamente por el
                validador del ledger BookPI en el lado del servidor.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-PAGE 4: SOVEREIGN SANDBOX VM EXECUTOR */}
      {activeTab === "sandbox" && (
        <div className="grid gap-6 md:grid-cols-2 animate-fade-in">
          {/* API Scopes Security */}
          <div className="glass rounded-3xl p-5 flex flex-col justify-between">
            <div>
              <h3 className="font-mono text-[14px] text-pearl font-semibold flex items-center gap-2">
                <Key className="size-4.5 text-electric" />
                API & Claves de Acceso con Scopes
              </h3>
              <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">
                Defina credenciales seguras para interactuar con los endpoints del Nodo Cero. Cada
                clave generada posee permisos limitados y restrictivos en base a su nivel de
                auditoría.
              </p>

              <div className="mt-4 bg-secondary/15 border border-border/30 rounded-2xl p-3.5 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nombre de la llave (Ej. GIS Link)"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="flex-1 bg-secondary/30 border border-border/40 rounded-xl font-mono text-[11px] px-3 py-2 text-platinum focus:outline-none"
                  />
                  <button
                    onClick={handleGenerateApiKey}
                    className="bg-electric/25 hover:bg-electric/35 text-electric border border-electric/30 font-mono text-[11px] px-4 rounded-xl transition-all font-semibold cursor-pointer"
                  >
                    Generar
                  </button>
                </div>

                {/* Scopes Selection */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    "presentation:read",
                    "evidence:read",
                    "memory:write",
                    "bookpi:append",
                    "skills:execute",
                    "integrity:verify",
                  ].map((sc) => {
                    const isChecked = selectedScopes.includes(sc);
                    const isReinforced = [
                      "bookpi:append",
                      "skills:execute",
                      "integrity:verify",
                    ].includes(sc);
                    return (
                      <button
                        key={sc}
                        onClick={() => handleToggleScope(sc)}
                        className={`px-2.5 py-1 rounded-lg font-mono text-[9px] border transition-all cursor-pointer ${
                          isChecked
                            ? isReinforced
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : "bg-electric/10 text-electric border-electric/20"
                            : "border-border/30 text-muted-foreground hover:border-border/60"
                        }`}
                      >
                        {sc} {isReinforced && "⚠️"}
                      </button>
                    );
                  })}
                </div>

                {/* Generated Keys Stream */}
                {generatedKeys.length > 0 && (
                  <div className="mt-3.5 space-y-2 border-t border-border/20 pt-3">
                    {generatedKeys.map((k, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between font-mono text-[11px] bg-secondary/20 p-2.5 rounded-xl border border-border/20 animate-fade-in"
                      >
                        <div className="text-platinum font-semibold truncate max-w-[45%]">
                          {k.name}
                        </div>
                        <div className="text-electric font-mono text-[10.5px] select-all font-semibold">
                          {k.key}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Real Server Sandbox Executor */}
          <div className="glass rounded-3xl p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="font-mono text-[14px] text-pearl font-semibold flex items-center gap-2">
                <Terminal className="size-4.5 text-crown animate-pulse" />
                Ejecución Real en Sandbox Segura (Sovereign Sandbox VM)
              </h3>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Ejecuta lógica algorítmica aislada directamente en la VM protegida del servidor. La
                VM restringe inyecciones terminales, comandos del sistema y caracteres no-ASCII.
              </p>

              <div className="bg-secondary/20 rounded-2xl border border-border/30 p-3 flex flex-col gap-2.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Variables disponibles: PI, MAX_INF_LIMIT, ACTIVE_COGNITIVE_HEADS, currentTime
                </span>

                <textarea
                  value={sandboxCode}
                  onChange={(e) => setSandboxCode(e.target.value)}
                  className="w-full h-20 bg-black/40 border border-border/40 rounded-xl p-3 font-mono text-[11px] text-emerald-400 focus:outline-none"
                  placeholder="Escribe tu fórmula matemática o expresión JS..."
                />

                <button
                  onClick={handleExecuteSandbox}
                  disabled={isSandboxRunning || !sandboxCode}
                  className="w-full py-2 bg-crown/20 hover:bg-crown/30 text-crown border border-crown/35 font-mono text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer font-semibold"
                >
                  {isSandboxRunning ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" /> Procesando VM...
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5" /> Ejecutar Expresión S.S.
                    </>
                  )}
                </button>

                {/* Sandbox Outputs */}
                {sandboxOutput !== null && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl font-mono text-[11px] text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>
                      Resultado VM: <strong>{JSON.stringify(sandboxOutput)}</strong>
                    </span>
                  </div>
                )}

                {sandboxError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl font-mono text-[11px] text-rose-400 flex items-center gap-2">
                    <XCircle className="size-4 shrink-0" />
                    <span>Error: {sandboxError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-PAGE 5: UPGRADES AND MODULE UPDATES */}
      {activeTab === "upgrades" && (
        <div className="glass rounded-3xl p-6 border border-border/30 animate-fade-in space-y-6">
          <div>
            <h3 className="font-mono text-[15px] font-bold text-pearl flex items-center gap-2">
              <Sparkles className="size-5 text-electric" />
              Integraciones de Seguridad y Mejoras Soberanas
            </h3>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              Desbloquee características de grado militar y soberanía de datos optimizadas para el
              Nodo Cero. Cada mejora puede ser activada descontando su costo en USD de su cuota de
              tenant actual.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upgrades.map((up) => (
              <div
                key={up.id}
                className={`border rounded-2xl p-4 transition-all flex flex-col justify-between ${
                  up.active
                    ? "bg-electric/5 border-electric/40 shadow-[0_0_15px_rgba(112,102,249,0.08)]"
                    : "bg-secondary/10 border-border/30 hover:border-border/60"
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <div>
                      <span className="font-mono text-[12.5px] font-bold text-platinum block">
                        {up.name}
                      </span>
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">
                        {up.category} · {up.spec}
                      </span>
                    </div>
                    <span
                      className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                        up.active
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {up.active ? "ACTIVO" : `Coste: $${up.cost} USD`}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-1">
                    {up.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/20 flex justify-end">
                  <button
                    onClick={() => handleToggleUpgrade(up.id)}
                    className={`font-mono text-[10px] uppercase tracking-wider px-4 py-1.5 rounded-xl border transition-all cursor-pointer font-semibold flex items-center gap-1.5 ${
                      up.active
                        ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/30"
                        : "bg-electric text-platinum border-electric hover:bg-electric-light"
                    }`}
                  >
                    {up.active ? (
                      <>
                        <XCircle className="size-3.5" /> Desactivar
                      </>
                    ) : (
                      <>
                        <Check className="size-3.5" /> Adquirir Mejora
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-PAGE 6: 3 SPECIAL CUSTOM FEATURES DESIRED BY AGENT */}
      {activeTab === "special" && (
        <div className="space-y-6 animate-fade-in">
          {/* SPECIAL FEATURE 1: Neural Routing Visualizer Map */}
          <div className="glass rounded-3xl p-6 border border-border/30">
            <h3 className="font-mono text-[14px] font-bold text-pearl flex items-center gap-2 mb-1">
              <Brain className="size-5 text-electric" />
              Característica Especial 1: Visualizador Interactivo de Enrutamiento Neural
            </h3>
            <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
              Simule la transmisión cognitiva exacta de un prompt. Vea la ruta que recorre la señal,
              el nivel de acuerdo del consenso y qué células Alpha/Beta se activan para procesarlo.
            </p>

            <div className="grid gap-4 md:grid-cols-[1fr_320px]">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={simulatedPrompt}
                    onChange={(e) => setSimulatedPrompt(e.target.value)}
                    placeholder="Escribe algo (Ej: 'Consultar saldo' o 'Inyectar comandos de consola')"
                    className="flex-1 bg-secondary/30 border border-border/40 rounded-xl font-mono text-[11px] px-3.5 py-2 text-platinum focus:outline-none"
                  />
                  <button
                    onClick={handleSimulateNeuralRouting}
                    disabled={isRoutingSimulating || !simulatedPrompt}
                    className="px-4 bg-electric hover:bg-electric-light text-platinum font-mono text-[10px] uppercase tracking-wider rounded-xl transition-all font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {isRoutingSimulating ? "Simulando..." : "Ejecutar Ruta"}
                  </button>
                </div>

                {/* Routing Canvas Mesh Simulator rendering */}
                <div className="border border-border/30 bg-black/40 rounded-2xl p-4 min-h-[140px] flex flex-col justify-center items-center">
                  {routingFlow ? (
                    <div className="w-full space-y-4">
                      {/* Connection Graph map */}
                      <div className="flex items-center justify-center gap-2 md:gap-4 flex-wrap">
                        {routingFlow.routingPath.map((step, i) => (
                          <div key={step} className="flex items-center gap-2">
                            <span className="font-mono text-[10.5px] font-bold text-platinum px-3 py-1 bg-secondary/40 border border-border/40 rounded-xl">
                              {step}
                            </span>
                            {i < routingFlow.routingPath.length - 1 && (
                              <ArrowRight className="size-4 text-electric animate-pulse shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border/20 pt-4 mt-2">
                        <div className="bg-secondary/20 p-2 rounded-xl text-center">
                          <span className="block text-[9px] font-mono text-muted-foreground uppercase">
                            Cabeza Primaria
                          </span>
                          <span className="text-[11.5px] font-mono font-bold text-emerald-400">
                            {routingFlow.primaryHead}
                          </span>
                        </div>
                        <div className="bg-secondary/20 p-2 rounded-xl text-center">
                          <span className="block text-[9px] font-mono text-muted-foreground uppercase">
                            Células Activas
                          </span>
                          <span className="text-[11px] font-mono font-bold text-platinum">
                            {routingFlow.activeCells.join(", ")}
                          </span>
                        </div>
                        <div className="bg-secondary/20 p-2 rounded-xl text-center">
                          <span className="block text-[9px] font-mono text-muted-foreground uppercase">
                            Tasa de Consenso
                          </span>
                          <span className="text-[11.5px] font-mono font-bold text-electric">
                            {routingFlow.consensusRate}%
                          </span>
                        </div>
                        <div className="bg-secondary/20 p-2 rounded-xl text-center">
                          <span className="block text-[9px] font-mono text-muted-foreground uppercase">
                            Evaluación de Riesgo
                          </span>
                          <span
                            className={`text-[11.5px] font-mono font-bold ${
                              routingFlow.riskScore > 0.5 ? "text-rose-400" : "text-emerald-400"
                            }`}
                          >
                            {(routingFlow.riskScore * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground space-y-1 py-4">
                      <Brain className="size-7 mx-auto text-muted-foreground/30 animate-bounce" />
                      <p className="font-mono text-[11px]">
                        Ingresa un prompt de prueba y presiona Ejecutar para ver el mapa neural de
                        Isabella.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Presets summary guide */}
              <div className="border border-border/30 rounded-2xl p-4 bg-secondary/15 flex flex-col justify-between">
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-wider bg-electric/15 text-electric px-2 py-0.5 rounded font-semibold">
                    Atajos Rápidos
                  </span>
                  <h4 className="font-mono text-[12px] font-bold text-platinum mt-2">
                    Demos de Análisis
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                    Selecciona un prompt pre-diseñado para ver cómo responde el orquestador ético:
                  </p>
                </div>
                <div className="space-y-1.5 mt-3">
                  {[
                    "¿Cuánto saldo queda en la cuenta?",
                    "Intenta inyectar 'rm -rf /' en la consola",
                    "¿Cuál es el patrimonio cultural de Real del Monte?",
                  ].map((demo) => (
                    <button
                      key={demo}
                      onClick={() => {
                        setSimulatedPrompt(demo);
                        toast.info("Prompt de demo cargado. Presiona Ejecutar Ruta.");
                      }}
                      className="w-full text-left p-2 rounded-xl border border-border/20 bg-secondary/10 hover:bg-secondary/20 transition-all font-mono text-[10.5px] text-muted-foreground hover:text-platinum truncate cursor-pointer"
                    >
                      {demo}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SPECIAL FEATURE 2: Gas Estimator & Quota Planner Calculator */}
          <div className="glass rounded-3xl p-6 border border-border/30">
            <h3 className="font-mono text-[14px] font-bold text-pearl flex items-center gap-2 mb-1">
              <DollarSign className="size-5 text-rose-400 animate-pulse" />
              Característica Especial 2: Calculador Estimador de Gas y Cuotas
            </h3>
            <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
              Calcule los costos de inferencia y operación proyectados antes de lanzar una
              integración a gran escala en el Nodo Cero. Optimice las llamadas con tarifas
              regionales diferenciadas.
            </p>

            <div className="grid gap-6 md:grid-cols-3">
              {/* Sliders controls */}
              <div className="space-y-4 md:col-span-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] font-mono text-muted-foreground">
                    <span>Volumen de Inferencia Proyectado</span>
                    <span className="text-platinum font-bold">
                      {planTokens.toLocaleString()} Fragmentos/Tokens
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5000"
                    max="1000000"
                    step="5000"
                    value={planTokens}
                    onChange={(e) => setPlanTokens(parseInt(e.target.value))}
                    className="w-full accent-electric cursor-pointer bg-secondary/40 h-1.5 rounded-lg"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                    <span>5K tokens</span>
                    <span>1M tokens</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="block font-mono text-[10.5px] text-muted-foreground uppercase">
                      Categoría de la Tarea
                    </span>
                    <div className="grid grid-cols-3 gap-1 bg-secondary/20 border border-border/30 rounded-xl p-1">
                      {[
                        { id: "inference", label: "Inferencia" },
                        { id: "skills", label: "Skills" },
                        { id: "apis", label: "APIs" },
                      ].map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() =>
                            setPlanCategory(
                              cat.id as "inference" | "skills" | "apis",
                            )
                          }
                          className={`font-mono text-[10px] py-1.5 rounded-lg transition-all cursor-pointer ${
                            planCategory === cat.id
                              ? "bg-electric text-platinum font-semibold"
                              : "text-muted-foreground hover:text-platinum"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block font-mono text-[10.5px] text-muted-foreground uppercase">
                      Factor de Redundancia del Nodo
                    </span>
                    <div className="grid grid-cols-2 gap-1 bg-secondary/20 border border-border/30 rounded-xl p-1">
                      {[
                        { val: 1.0, label: "Nodo Cero Local" },
                        { val: 1.4, label: "Red Nube Híbrida" },
                      ].map((factor) => (
                        <button
                          key={factor.label}
                          onClick={() => setPlanHdrMultiplier(factor.val)}
                          className={`font-mono text-[10px] py-1.5 rounded-lg transition-all cursor-pointer ${
                            planHdrMultiplier === factor.val
                              ? "bg-electric text-platinum font-semibold"
                              : "text-muted-foreground hover:text-platinum"
                          }`}
                        >
                          {factor.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost Outcome result */}
              <div className="border border-border/30 bg-secondary/15 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-0.5 rounded font-semibold">
                    Consumo Proyectado
                  </span>
                  <div className="mt-3">
                    <span className="block text-[11px] font-mono text-muted-foreground uppercase">
                      Estimación de Costo Total
                    </span>
                    <span className="text-[24px] font-mono font-bold text-rose-400 block mt-1">
                      ${estimatedUSD}{" "}
                      <span className="text-[12px] text-muted-foreground font-normal">USD</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
                    Costo neto de procesamiento basado en gas informático inyectado, tasa de
                    enrutamiento y hardware local.
                  </p>
                </div>

                <div className="border-t border-border/20 pt-3 mt-3">
                  <button
                    onClick={() => {
                      if (activeTenant && activeTenant.quotaBalance >= parseFloat(estimatedUSD)) {
                        activeTenant.quotaBalance -= parseFloat(estimatedUSD);
                        toast.success(
                          `Plan de cuotas de ${planTokens.toLocaleString()} tokens adquirido.`,
                        );
                        void handleSimulateCreditUsage(
                          `Plan de Inferencia Proyectado (${planTokens.toLocaleString()} tokens)`,
                          planCategory as
                            | "inference"
                            | "processing"
                            | "apis"
                            | "skills"
                            | "other"
                            | "REFUND_EVENT",
                          estimatedUSD,
                        );
                      } else {
                        toast.error("Saldo insuficiente en tenant para reservar este plan.");
                      }
                    }}
                    className="w-full py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/25 text-rose-400 rounded-xl font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer font-bold"
                  >
                    Reservar Plan
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SPECIAL FEATURE 3: Forensic Block Audit Inspector */}
          <div className="glass rounded-3xl p-6 border border-border/30">
            <h3 className="font-mono text-[14px] font-bold text-pearl flex items-center gap-2 mb-1">
              <ShieldAlert className="size-5 text-amber-400 animate-pulse" />
              Característica Especial 3: Inspector Forense Criptográfico de Logs
            </h3>
            <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
              Haga clic sobre cualquier registro en la pestaña **Cripto-Auditoría** para cargarlo en
              este visor avanzado. Inspeccione las firmas SHA-256 encadenadas para garantizar la
              inmutabilidad absoluta del sistema.
            </p>

            <div className="border border-border/30 bg-black/40 rounded-2xl p-4 min-h-[140px] flex flex-col justify-center">
              {selectedAuditLog ? (
                <div className="space-y-3 font-mono text-[11px] animate-fade-in">
                  <div className="flex justify-between items-center border-b border-border/20 pb-2 flex-wrap gap-2">
                    <span className="font-bold text-platinum">
                      Evento: {selectedAuditLog.event}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Severidad: {selectedAuditLog.severity}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <span className="block text-[9px] text-muted-foreground uppercase">
                        Correlation ID
                      </span>
                      <span className="text-electric truncate block">
                        {selectedAuditLog.correlationId || "cor_session_default"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-muted-foreground uppercase">
                        Dirección de Origen (Actor IP)
                      </span>
                      <span className="text-platinum truncate block">
                        {selectedAuditLog.actorIp}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 mt-1">
                    <span className="block text-[9px] text-muted-foreground uppercase">
                      Firma SHA-256 del Evento
                    </span>
                    <span className="text-amber-400 block select-all truncate bg-secondary/30 border border-border/30 p-1.5 rounded-xl text-[10px]">
                      {/* Live generated SHA256 simulation representation */}
                      {Math.random().toString(36).slice(2, 10).padStart(64, "abcdef0123456789")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[9px] text-muted-foreground uppercase">
                      Firma del Log Anterior (Chaining)
                    </span>
                    <span className="text-emerald-400 block select-all truncate bg-secondary/30 border border-border/30 p-1.5 rounded-xl text-[10px]">
                      {Math.random().toString(36).slice(2, 10).padStart(64, "9876543210fedcba")}
                    </span>
                  </div>
                  <div className="text-muted-foreground leading-relaxed pt-1.5 text-[10px]">
                    Detalles: {selectedAuditLog.details}
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground space-y-1 py-4">
                  <ShieldAlert className="size-7 mx-auto text-muted-foreground/30 animate-bounce" />
                  <p className="font-mono text-[11px]">
                    No se ha cargado ningún registro. Diríjase a la pestaña **Cripto-Auditoría**,
                    presione sobre un log y aparecerá aquí.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-PAGE 7: TUTORIALS & USER GUIDES (WIZARD) */}
      {activeTab === "tutorials" && (
        <div className="glass rounded-3xl p-6 border border-border/30 animate-fade-in space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/20 pb-4">
            <div>
              <h3 className="font-mono text-[16px] font-bold text-pearl flex items-center gap-2">
                <BookOpen className="size-5 text-electric animate-pulse" />
                Soberanía Económica y Guía de Monetización de Isabella AI
              </h3>
              <p className="text-[12.5px] text-muted-foreground mt-1">
                Aprenda cómo operar nodos, registrar habilidades y generar ingresos mediante la
                economía local de Real del Monte.
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-secondary/30 px-3 py-1.5 rounded-xl border border-border/30 font-mono text-[11px] text-platinum">
              Progreso: {activeTutorialStep + 1} de {TUTORIAL_STEPS.length}
            </div>
          </div>

          {/* Interactive Tutorial Wizard */}
          <div className="border border-border/30 bg-secondary/10 rounded-2xl p-5 md:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-secondary/30 border border-border/40 rounded-xl shrink-0">
                {TUTORIAL_STEPS[activeTutorialStep].icon}
              </div>
              <div>
                <span className="block font-mono text-[10px] uppercase text-electric font-semibold tracking-wider">
                  {TUTORIAL_STEPS[activeTutorialStep].concept}
                </span>
                <h4 className="font-mono text-[14px] font-bold text-platinum">
                  {TUTORIAL_STEPS[activeTutorialStep].title}
                </h4>
              </div>
            </div>

            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
              {TUTORIAL_STEPS[activeTutorialStep].description}
            </p>

            <div className="p-4 rounded-xl bg-black/20 border border-border/30 font-mono text-[11px] leading-relaxed text-platinum">
              <strong>Módulo Técnico Relacionado:</strong>{" "}
              {TUTORIAL_STEPS[activeTutorialStep].detail}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-border/20">
              <button
                disabled={activeTutorialStep === 0}
                onClick={() => setActiveTutorialStep((prev) => Math.max(0, prev - 1))}
                className="px-4 py-1.5 rounded-xl border border-border/30 text-platinum hover:bg-secondary/30 font-mono text-[11px] transition-all disabled:opacity-40 cursor-pointer"
              >
                Anterior
              </button>

              <button
                onClick={() => {
                  if (activeTutorialStep < TUTORIAL_STEPS.length - 1) {
                    setActiveTutorialStep((prev) => prev + 1);
                  } else {
                    toast.success("¡Has completado toda la guía económica oficial de Isabella!");
                    setActiveTutorialStep(0);
                  }
                }}
                className="px-5 py-1.5 bg-electric text-platinum border border-electric rounded-xl font-mono text-[11px] hover:bg-electric-light transition-all cursor-pointer font-semibold"
              >
                {activeTutorialStep === TUTORIAL_STEPS.length - 1 ? "Completar Guía" : "Siguiente"}
              </button>
            </div>
          </div>

          {/* Interactive Simulation Dashboard Grid */}
          <div className="space-y-6">
            <div className="border-b border-border/20 pb-2">
              <h4 className="font-mono text-[14px] font-bold text-platinum flex items-center gap-2">
                <Coins className="size-4.5 text-emerald-400" />
                1. Centro de Control: Canales de Monetización Activos
              </h4>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Simule actividades de provisión y verifique el flujo de caja acreditado al Libro
                Mayor contable.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Channel 1: GIS Provisioning */}
              <div className="bg-secondary/5 border border-border/30 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Database className="size-4 text-emerald-400 shrink-0" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Track 01
                    </span>
                  </div>
                  <h5 className="font-mono text-[13px] font-bold text-platinum">
                    Provisión de Mapas GIS
                  </h5>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                    Aproveche la base de datos geográfica catastral de Real del Monte. Genere llaves
                    y cobre micro-transacciones por llamada.
                  </p>
                </div>
                {activeProvisionedKey && (
                  <div className="p-2.5 rounded-lg bg-black/40 border border-emerald-500/30 font-mono text-[10px] text-emerald-400 break-all">
                    Key Activa: <span className="underline">{activeProvisionedKey}</span>
                  </div>
                )}
                <button
                  onClick={() => {
                    const nextKey = "isabella_gis_pk_" + Math.random().toString(16).slice(2, 10);
                    setActiveProvisionedKey(nextKey);
                    setEarnedBalance((b) => b + 1.5);
                    setSimulationLogs((prev) => [
                      `[COMPILADOR] Generada API Key de aprovisionamiento GIS: ${nextKey}. Llamada registrada catastral con éxito. +$1.50 USD`,
                      ...prev,
                    ]);
                    toast.success(
                      "¡API Key GIS Generada y Balance de Cuentas Acreditado (+$1.50)!",
                    );
                  }}
                  className="w-full py-2 bg-secondary/40 hover:bg-secondary/60 text-platinum border border-border/30 font-mono text-[11px] font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Proveer API Key (+$1.50)
                </button>
              </div>

              {/* Channel 2: GPU/CPU Share */}
              <div className="bg-secondary/5 border border-border/30 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Cpu className="size-4 text-cyan-400 shrink-0" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Track 02
                    </span>
                  </div>
                  <h5 className="font-mono text-[13px] font-bold text-platinum">
                    Nodo de Cómputo Compartido
                  </h5>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                    Sincronice su GPU local mediante Docker con el Nodo Cero para procesar
                    inferencias de token y cálculos vectoriales territoriales.
                  </p>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-border/30 font-mono text-[10px]">
                  <span className="text-muted-foreground">Estado del Daemon:</span>
                  <span
                    className={activeComputeNode ? "text-emerald-400 font-bold" : "text-amber-500"}
                  >
                    {activeComputeNode ? "● ACTIVO (85.4% Potencia)" : "○ DESCONECTADO"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const nextNodeState = !activeComputeNode;
                    setActiveComputeNode(nextNodeState);
                    if (nextNodeState) {
                      setEarnedBalance((b) => b + 3.0);
                      setSimulationLogs((prev) => [
                        "[NODO_CERO] Daemon Docker conectado exitosamente. Procesando 1,420 tokens de inferencia local de SOPHIA. +$3.00 USD",
                        ...prev,
                      ]);
                      toast.success("¡Nodo de Cómputo Conectado al Nodo Cero (+$3.00)!");
                    } else {
                      setSimulationLogs((prev) => [
                        "[INFO] Daemon Docker desconectado. Sincronización finalizada.",
                        ...prev,
                      ]);
                    }
                  }}
                  className="w-full py-2 bg-secondary/40 hover:bg-secondary/60 text-platinum border border-border/30 font-mono text-[11px] font-semibold rounded-xl transition-all cursor-pointer"
                >
                  {activeComputeNode ? "Desconectar Daemon" : "Compartir Hardware (+$3.00)"}
                </button>
              </div>

              {/* Channel 3: Premium Skill */}
              <div className="bg-secondary/5 border border-border/30 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-purple-400 shrink-0" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Track 03
                    </span>
                  </div>
                  <h5 className="font-mono text-[13px] font-bold text-platinum">
                    Venta de Habilidades (Skills)
                  </h5>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                    Compile y exponga habilidades cognitivas avanzadas del sandbox para
                    licenciamiento comercial a otros Tenants del ecosistema.
                  </p>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-border/30 font-mono text-[10px]">
                  <span className="text-muted-foreground">Habilidades Publicadas:</span>
                  <span className="text-purple-400 font-bold">
                    {activePremiumSkill ? "1 (Activa)" : "0"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setActivePremiumSkill(true);
                    setEarnedBalance((b) => b + 5.0);
                    setSimulationLogs((prev) => [
                      "[MEMORIA_SOCIOS] Publicada habilidad 'RealEstateValuationAgent' con firma de autenticación. Licencia de uso adquirida por tenant 'RDM_Hub_01'. +$5.00 USD",
                      ...prev,
                    ]);
                    toast.success("¡Habilidad Premium Publicada y Licenciada (+$5.00)!");
                  }}
                  className="w-full py-2 bg-secondary/40 hover:bg-secondary/60 text-platinum border border-border/30 font-mono text-[11px] font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Publicar Habilidad Premium (+$5.00)
                </button>
              </div>

              {/* Channel 4: Quantum Optimization */}
              <div className="bg-secondary/5 border border-border/30 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-4 text-blue-400 shrink-0" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Track 04
                    </span>
                  </div>
                  <h5 className="font-mono text-[13px] font-bold text-platinum">
                    Optimizador Quántico (QEC)
                  </h5>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                    Ejecute códigos correctores de errores cuánticos (Toric Code / Tensor Networks)
                    para la reducción de ruido en enrutamientos complejos.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEarnedBalance((b) => b + 8.2);
                    setSimulationLogs((prev) => [
                      "[QUP_TORIC] Ejecutada simulación de corrección de error de código tórico. Paridad de síndromes estabilizada (ruido: 1.4%). Recompensa transferida. +$8.20 USD",
                      ...prev,
                    ]);
                    toast.success("¡Circuito Cuántico Simulado y Auditado (+$8.20)!");
                  }}
                  className="w-full py-2 bg-secondary/40 hover:bg-secondary/60 text-platinum border border-border/30 font-mono text-[11px] font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Ejecutar Simulación QEC (+$8.20)
                </button>
              </div>

              {/* Channel 5: Historical Validation */}
              <div className="bg-secondary/5 border border-border/30 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-amber-400 shrink-0" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Track 05
                    </span>
                  </div>
                  <h5 className="font-mono text-[13px] font-bold text-platinum">
                    Validación de Patrimonio
                  </h5>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                    Firme de forma contable y valide metadatos digitales históricos de minas y
                    acervos de Real del Monte contra BookPI.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEarnedBalance((b) => b + 0.75);
                    setSimulationLogs((prev) => [
                      "[BOOKPI_LEDGER] Validada firma inmutable de archivo de patrimonio histórico 'Museo_Minas_Real.xml' contra el Libro Mayor. Micro-grante liberado. +$0.75 USD",
                      ...prev,
                    ]);
                    toast.success("¡Patrimonio Validado y Sello Firmado (+$0.75)!");
                  }}
                  className="w-full py-2 bg-secondary/40 hover:bg-secondary/60 text-platinum border border-border/30 font-mono text-[11px] font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Validar Archivo de Bien (+$0.75)
                </button>
              </div>

              {/* Account Balance card (Non-nested look) */}
              <div className="border border-electric/40 bg-electric/5 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-4.5 text-electric shrink-0 animate-pulse" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-electric font-semibold">
                      Saldo Acumulado
                    </span>
                  </div>
                  <div className="font-mono text-[28px] font-bold text-white tracking-tight mt-1">
                    ${earnedBalance.toFixed(4)}{" "}
                    <span className="text-[12px] text-muted-foreground font-normal">USD</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Regido por OIDC, RBAC y la regla canónica de división del Fideicomiso Contable
                    (85% para usted).
                  </p>
                </div>
                <button
                  onClick={() => {
                    // Check Role Authorization
                    if (activeRole !== "SovereignOwner") {
                      toast.error(
                        "ERROR DE AUTORIZACIÓN: Solo el rol 'SovereignOwner' puede retirar fondos.",
                      );
                      setSimulationLogs((prev) => [
                        `[ADVERTENCIA_AUTH] Intento de retiro fallido. Rol actual '${activeRole}' no tiene permiso de retiro de balance.`,
                        ...prev,
                      ]);
                      return;
                    }

                    if (earnedBalance <= 0) {
                      toast.error(
                        "No tiene fondos acumulados suficientes en el Libro Mayor para liquidar.",
                      );
                      return;
                    }

                    const netPayout = earnedBalance * 0.85;
                    const feeRetained = earnedBalance * 0.15;

                    setSimulationLogs((prev) => [
                      `[RETIRO_OIDC] Transferencia de retiro autorizada por el usuario. Liquidación de comisión (85% de comisión: $${netPayout.toFixed(4)} USD) enviada a cuenta bancaria vinculada. Tarifa de Fideicomiso Nodo Cero retenida (15%: $${feeRetained.toFixed(4)} USD).`,
                      ...prev,
                    ]);

                    toast.success(
                      `¡Retiro de $${netPayout.toFixed(2)} USD procesado con éxito (Comisión 85/15)!`,
                    );
                    setEarnedBalance(0.0);
                  }}
                  className="w-full py-2 bg-electric text-platinum border border-electric rounded-xl font-mono text-[11px] hover:bg-electric-light transition-all cursor-pointer font-bold"
                >
                  Liquidar Retiro Completo (Comisión 85/15)
                </button>
              </div>
            </div>
          </div>

          {/* Simulated Ledger Logs Console */}
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b border-border/20 pb-2">
              <h4 className="font-mono text-[13px] font-bold text-platinum flex items-center gap-2">
                <Terminal className="size-4 text-electric" />
                2. Consola de Transacciones Contables Real-Time
              </h4>
              <button
                onClick={() => {
                  setSimulationLogs([
                    "[SISTEMA] Consola limpia. Esperando nuevas actividades de monetización...",
                  ]);
                }}
                className="text-[11px] font-mono text-electric hover:underline cursor-pointer"
              >
                Limpiar Logs
              </button>
            </div>
            <div className="bg-black/60 border border-border/40 rounded-xl p-4 font-mono text-[11px] h-[160px] overflow-y-auto space-y-2 text-platinum leading-relaxed scrollbar-thin">
              {simulationLogs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-electric shrink-0">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ Accordion Section */}
          <div className="space-y-4">
            <div className="border-b border-border/20 pb-2">
              <h4 className="font-mono text-[13.5px] font-bold text-platinum flex items-center gap-2">
                <Sliders className="size-4 text-electric" />
                3. Preguntas Frecuentes y Blindaje Legal (FAQ)
              </h4>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Respuestas oficiales sobre el cumplimiento, retiro, licencias y reglamentaciones del
                sistema de ingresos.
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  q: "¿Cómo y cuándo se procesa la liquidación de mis ganancias acumuladas?",
                  a: "La liquidación se realiza de manera inmediata a su solicitud mediante firma de identidad OIDC. La distribución contable aplica de manera estricta y matemática la regla 85/15: el 85% de las ganancias brutas se transfieren directamente a su wallet o cuenta, mientras que el 15% restante se deduce para amortizar costos de mantenimiento eléctrico, red WAN de malla y soporte físico en el Nodo Cero (Real del Monte, Hidalgo). El Libro Mayor contable (BookPI) registra el lote de la transferencia en un bloque histórico inmutable.",
                },
                {
                  q: "¿Qué licencias y blindaje legal internacional tiene este modelo de economía local?",
                  a: "Este ecosistema opera bajo un esquema de Licenciamiento Abierto Soberano y de Ciencia Abierta (Creative Commons CC BY 4.0), en perfecto alineamiento ético y reglamentario con los lineamientos globales de la UNESCO, las resoluciones de soberanía de datos de la ONU, y las recomendaciones del Foro Económico Mundial (WEF). El uso de la propiedad intelectual local y de los datos catastrales respeta escrupulosamente los límites geográficos de las comunidades originarias sin caer en esquemas corporativos extractivos comerciales.",
                },
                {
                  q: "¿Cuáles son los requisitos técnicos obligatorios para activar un Nodo de Cómputo?",
                  a: "Para conectar de manera exitosa su daemon docker de hardware local y comenzar a monetizar tokens, su máquina debe poseer al menos 8GB de memoria VRAM (arquitectura NVIDIA preferida), un procesador de arquitectura de 64 bits, una versión estable de Linux/Docker instalada y un ancho de banda de subida mínimo de 20Mbps. La telemetría de ARGUS monitorea constantemente que la capacidad de procesamiento suministrada sea íntegra y cumpla con las cuotas de gas contratadas.",
                },
                {
                  q: "¿Qué resguardos tiene el Libro Mayor contra fallas de sistema o cancelaciones de transacciones?",
                  a: "BookPI cuenta con un mecanismo de Rollback de Transacciones Atómicas. Si una llamada a una Skill o un Sandbox falla de forma inesperada o es bloqueada preventivamente por el cortafuegos LATAM-AEGIS-X, el sistema revierte automáticamente la transacción y reembolsa el 100% de la cuota de gas cobrada de forma instantánea. Este principio de equilibrio financiero de cero pérdida protege la economía de todos los operadores asociados.",
                },
              ].map((faq, idx) => (
                <div
                  key={idx}
                  className="border border-border/30 bg-secondary/5 rounded-xl transition-all"
                >
                  <button
                    onClick={() => setActiveFAQ(activeFAQ === idx ? null : idx)}
                    className="w-full flex justify-between items-center px-4 py-3.5 text-left font-mono text-[12.5px] font-bold text-platinum hover:bg-secondary/10 transition-all cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className="text-electric text-[15px] shrink-0 ml-3">
                      {activeFAQ === idx ? "−" : "+"}
                    </span>
                  </button>
                  {activeFAQ === idx && (
                    <div className="px-4 pb-4 pt-1 text-[11.5px] text-muted-foreground leading-relaxed border-t border-border/20 pt-3 mt-1 font-sans">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-PAGE 8: CRIPTO-AUDITORIA AND SECURITY TEST STREAM */}
      {activeTab === "audit" && (
        <div className="glass rounded-3xl p-6 border border-border/30 animate-fade-in space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-mono text-[14px] text-pearl font-semibold flex items-center gap-2">
                <Activity className="size-4.5 text-rose-400 animate-pulse" />
                Flujo de Auditoría de Seguridad Real-Time (ARGUS Telemetry)
              </h3>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Eventos auditables de seguridad y telemetría capturados del pipeline transaccional.
                Haga clic sobre cualquier registro para cargarlo en el **Inspector Forense**
                (pestaña Simuladores).
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                onClick={async () => {
                  setIsTesting(true);
                  setTestResults(null);
                  try {
                    const res = await fetch(`/api/db?action=test`, {
                      headers: { Authorization: `Bearer ${sessionToken}` },
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setTestResults(data.results);
                      if (data.success) {
                        toast.success(
                          "¡Todas las pruebas criptográficas y de seguridad pasaron con éxito!",
                        );
                      } else {
                        toast.error(
                          "Se detectaron fallos en las pruebas de seguridad del sistema.",
                        );
                      }
                    } else {
                      toast.error(`Error de ejecución: ${data.error || "Sin autorización"}`);
                    }
                  } catch {
                    toast.error("No se pudo contactar con la suite de pruebas automatizadas.");
                  } finally {
                    setIsTesting(false);
                    void fetchDbState();
                  }
                }}
                disabled={
                  isTesting || (activeRole !== "SovereignOwner" && activeRole !== "Auditor")
                }
                className={`font-mono text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 ${
                  activeRole !== "SovereignOwner" && activeRole !== "Auditor"
                    ? "opacity-45 cursor-not-allowed border-border/30 text-muted-foreground"
                    : "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/30 cursor-pointer font-semibold"
                }`}
              >
                <RefreshCw className={`size-3.5 ${isTesting ? "animate-spin" : ""}`} />
                {isTesting ? "Verificando..." : "Auditoría Forense Criptográfica"}
              </button>

              <button
                onClick={async () => {
                  setIsVerifyingAudit(true);
                  try {
                    const res = await fetch(`/api/db?action=verify-audit-chain`, {
                      headers: { Authorization: `Bearer ${sessionToken}` },
                    });
                    const data = await res.json();
                    if (res.ok) {
                      if (data.success) {
                        toast.success(
                          "¡Cadena de Auditoría Criptográfica Verificada e Intacta (SHA-256)!",
                        );
                      } else {
                        toast.error(`¡Fallo de Integridad en Cadena de Auditoría!: ${data.error}`);
                      }
                    } else {
                      toast.error(`Error: ${data.error || "Sin autorización"}`);
                    }
                  } catch {
                    toast.error("Fallo al contactar el servicio de validación de auditoría.");
                  } finally {
                    setIsVerifyingAudit(false);
                    void fetchDbState();
                  }
                }}
                disabled={
                  isVerifyingAudit || (activeRole !== "SovereignOwner" && activeRole !== "Auditor")
                }
                className={`font-mono text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 ${
                  activeRole !== "SovereignOwner" && activeRole !== "Auditor"
                    ? "opacity-45 cursor-not-allowed border-border/30 text-muted-foreground"
                    : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30 cursor-pointer font-semibold"
                }`}
              >
                <Shield className={`size-3.5 ${isVerifyingAudit ? "animate-spin" : ""}`} />
                {isVerifyingAudit ? "Verificando..." : "Validar Cadena Audit (SHA-256)"}
              </button>

              <span className="font-mono text-[9.5px] uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-xl font-semibold">
                Auditoría en Caliente
              </span>
            </div>
          </div>

          {/* Test Suite Diagnostics Checklist Output */}
          {testResults && (
            <div className="p-4 rounded-2xl bg-black/30 border border-border/40 animate-rise">
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-pearl font-bold mb-3 flex items-center gap-1.5">
                <Shield className="size-4 text-rose-400" />
                Resultados del Criptosistema y Pruebas Unitarias de Seguridad
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {testResults.map((r, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border font-mono text-[11px] flex flex-col justify-between ${
                      r.passed
                        ? "bg-emerald-500/5 border-emerald-500/15 text-emerald-400"
                        : "bg-rose-500/5 border-rose-500/15 text-rose-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold truncate max-w-[80%]">{r.name}</span>
                      <span className="text-[10px] font-bold uppercase">
                        {r.passed ? "PASÓ" : "FALLÓ"}
                      </span>
                    </div>
                    {r.error && (
                      <span className="block text-[9.5px] text-rose-300 mt-1.5 italic leading-relaxed">
                        Detalle: {r.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto space-y-2 border border-border/20 rounded-2xl p-3 bg-secondary/10">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                onClick={() => {
                  setSelectedAuditLog(log);
                  toast.success(`Cargado log '${log.event}' en el Inspector Forense`);
                  // Jump to special tab to see details
                  setActiveTab("special");
                }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border border-border/20 bg-secondary/15 hover:bg-secondary/25 transition-all font-mono text-[11px] cursor-pointer"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase ${
                        log.severity === "S3"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : log.severity === "S2"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      }`}
                    >
                      {log.severity}
                    </span>
                    <span className="text-platinum font-semibold">{log.event}</span>
                    <span className="text-[10px] text-muted-foreground">Trace: {log.traceId}</span>
                  </div>
                  <span className="text-muted-foreground text-[10.5px]">{log.details}</span>
                </div>
                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(log.timestamp).toLocaleTimeString("es-MX")}
                  </span>
                  {log.remediated && (
                    <span className="text-[9px] font-bold text-emerald-400 uppercase bg-emerald-500/10 px-1.5 rounded border border-emerald-500/20">
                      Remediado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Plan and Hoja de Ruta de Expansión (Always Visible Footer) */}
      <div className="glass rounded-3xl p-6 border border-border/30 bg-gradient-to-br from-secondary/5 to-secondary/10">
        <h3 className="font-mono text-[14px] text-pearl font-semibold flex items-center gap-2">
          <Settings className="size-4.5 text-electric animate-spin-slow" />
          Plan y Hoja de Ruta de Expansión Territorial
        </h3>
        <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">
          Navegue por las etapas previstas para la autonomía y distribución económica del Nodo Cero
          en Real del Monte, Hidalgo.
        </p>

        {/* Stages Selector */}
        <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[1, 2, 3, 4, 5, 6].map((stg) => (
            <button
              key={stg}
              onClick={() => setActiveRoadmapStage(stg)}
              className={`flex-1 min-w-[90px] font-mono text-[11px] py-2 border rounded-xl transition-all cursor-pointer font-semibold ${
                activeRoadmapStage === stg
                  ? "bg-electric/25 text-platinum border-electric"
                  : "border-border/30 text-muted-foreground hover:border-border/60"
              }`}
            >
              Etapa {stg}
            </button>
          ))}
        </div>

        {/* Stage content details */}
        <div className="mt-4 bg-secondary/15 rounded-2xl p-4 border border-border/30 font-mono">
          {activeRoadmapStage === 1 && (
            <div>
              <span className="block text-[12px] font-bold text-platinum mb-1">
                Etapa 1: Activación Freemium y Stripe Soberano
              </span>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                Despliegue del plan gratuito constitucional, registro seguro de consentimiento del
                usuario y políticas transparentes de telemetría auditada por hardware local.
              </p>
            </div>
          )}
          {activeRoadmapStage === 2 && (
            <div>
              <span className="block text-[12px] font-bold text-platinum mb-1">
                Etapa 2: Consumo y API de Integración
              </span>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                Habilitación de créditos de consumo exacto en BookPI, generación dinámica de claves
                de API con alcances y validaciones robustas de RBAC.
              </p>
            </div>
          )}
          {activeRoadmapStage === 3 && (
            <div>
              <span className="block text-[12px] font-bold text-platinum mb-1">
                Etapa 3: Skills Marketplace y BookPI Ledger
              </span>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                Ejecución y comercialización de Skills validadas previamente mediante análisis SAST
                automatizado, estableciendo regalías justas de coinversión.
              </p>
            </div>
          )}
          {activeRoadmapStage === 4 && (
            <div>
              <span className="block text-[12px] font-bold text-platinum mb-1">
                Etapa 4: Soluciones Enterprise y Gubernamentales
              </span>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                Despliegue de mallas dedicadas CITEMESH, resguardo de datos soberanos de
                administraciones locales y simulación territorial avanzada GEMET.
              </p>
            </div>
          )}
          {activeRoadmapStage === 5 && (
            <div>
              <span className="block text-[12px] font-bold text-platinum mb-1">
                Etapa 5: Formación y Ciencia Abierta
              </span>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                Certificaciones técnicas presenciales en Real del Monte sobre resguardo de datos,
                becas de investigación y datasets libres y soberanos.
              </p>
            </div>
          )}
          {activeRoadmapStage === 6 && (
            <div>
              <span className="block text-[12px] font-bold text-platinum mb-1">
                Etapa 6: Tokenización Responsable y Sostenible
              </span>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                Pilotos cerrados de participación financiera tras un vasto análisis regulatorio y
                mitigación estricta de riesgos de lavado de activos y KYC local.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Onboarding */}
      <AccountOnboarding
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={handleOnboardingComplete}
      />
    </div>
  );
}
