import { useState } from "react";
import {
  Cpu,
  Layers,
  Activity,
  Sliders,
  Play,
  RotateCcw,
  CheckCircle2,
  Gauge,
  Clock,
  ShieldCheck,
  Binary,
} from "lucide-react";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
} from "recharts";

// Helper function implementing the selection rule dynamically in the UI
function chooseAddonsLocal({
  objective,
  circuitDepth,
  qubitCount,
  expectsObservables,
  expectsSamples,
}: {
  objective: string;
  circuitDepth: number;
  qubitCount: number;
  expectsObservables: boolean;
  expectsSamples: boolean;
}): string[] {
  const selected: string[] = [];

  if (circuitDepth > 100) {
    selected.push("aqc_tensor");
  }

  if (expectsObservables && circuitDepth > 50) {
    selected.push("operator_backpropagation");
  }

  if (expectsObservables) {
    selected.push("propagated_noise_absorption");
    selected.push("shaded_lightcones");
  }

  if (expectsSamples) {
    selected.push("mthree");
    selected.push("postselection_bit_flip");
  }

  if (qubitCount > 20 && objective === "hamiltonian_spectrum") {
    selected.push("sqd");
  }

  return selected;
}

const REGISTERED_ADDONS = [
  {
    id: "optimization_mapper",
    name: "Optimization Mapper",
    package: "qiskit-addon-opt-mapper",
    stage: "Map",
    desc: "Mapeo optimizado de disposición física de qubits.",
  },
  {
    id: "fermionic_mapper",
    name: "Fermionic Mapper",
    package: "qiskit-fermions",
    stage: "Map",
    desc: "Mapeador específico para hamiltonianos fermiónicos.",
  },
  {
    id: "aqc_tensor",
    name: "AQC Tensor Network",
    package: "qiskit-addon-aqc-tensor",
    stage: "Optimize",
    desc: "Reducción de profundidad mediante redes tensoriales.",
  },
  {
    id: "mpf",
    name: "Multi-Product Formula (MPF)",
    package: "qiskit-addon-mpf",
    stage: "Optimize",
    desc: "Descomposición en fórmulas de productos múltiples.",
  },
  {
    id: "operator_backpropagation",
    name: "Operator Backpropagation",
    package: "qiskit-core",
    stage: "Optimize",
    desc: "Propagación hacia atrás de operadores observables.",
  },
  {
    id: "circuit_cutting",
    name: "Circuit Cutting",
    package: "qiskit-addon-cutting",
    stage: "Optimize",
    desc: "Segmentación de circuitos grandes para QPU pequeñas.",
  },
  {
    id: "propagated_noise_absorption",
    name: "Propagated Noise Absorption (PNA)",
    package: "qiskit-core",
    stage: "Postprocess",
    desc: "Mitigación mediante absorción de ruido propagado.",
  },
  {
    id: "shaded_lightcones",
    name: "Shaded Lightcones",
    package: "qiskit-core",
    stage: "Optimize",
    desc: "Poda de circuitos mediante conos de luz sombreados.",
  },
  {
    id: "sqd",
    name: "Sparse Quantum Distribution (SQD)",
    package: "qiskit-core",
    stage: "Postprocess",
    desc: "Muestreador disperso de alta fidelidad.",
  },
  {
    id: "sqd_hpc",
    name: "SQD HPC Accelerator",
    package: "qiskit-core",
    stage: "Postprocess",
    desc: "Muestreo disperso acelerado por nodos HPC de clúster.",
  },
  {
    id: "postselection_bit_flip",
    name: "Postselection Bit-Flip",
    package: "qiskit-core",
    stage: "Postprocess",
    desc: "Filtro de postselección para errores tipo Bit-Flip.",
  },
  {
    id: "mthree",
    name: "M3 Measurement Mitigation",
    package: "mthree",
    stage: "Postprocess",
    desc: "Mitigación de errores de lectura libre de matriz.",
  },
  {
    id: "paulice",
    name: "Pauli Correction (Paulice)",
    package: "qiskit-core",
    stage: "Postprocess",
    desc: "Corrección probabilística a nivel de compuertas Pauli.",
  },
];

const CIRCUIT_TEMPLATES = {
  bell: {
    name: "Estado Bell (Entrelazamiento Simple)",
    qubits: 2,
    depth: 5,
    gates: { h: 1, cx: 1, measure: 2 },
    optimized: { depth: 3, size: 4, cx: 1, gates: { h: 1, cx: 1, measure: 2 } },
    representation: "q[0]: ──H───●───M──\n           │\nq[1]: ──────●───M──",
  },
  ghz: {
    name: "Estado GHZ (5 Qubits)",
    qubits: 5,
    depth: 12,
    gates: { h: 1, cx: 4, measure: 5 },
    optimized: { depth: 7, size: 10, cx: 4, gates: { h: 1, cx: 4, measure: 5 } },
    representation:
      "q[0]: ──H───●───────────────M──\n           │\nq[1]: ──────●───●───────────M──\n               │\nq[2]: ──────────●───●───────M──\n                   │\nq[3]: ──────────────●───●───M──\n                       │\nq[4]: ──────────────────●───M──",
  },
  qaoa: {
    name: "Ansatz QAOA (Espectro de Espín)",
    qubits: 8,
    depth: 140,
    gates: { h: 8, rx: 16, rz: 16, cx: 28 },
    optimized: { depth: 45, size: 38, cx: 14, gates: { h: 8, rx: 12, rz: 12, cx: 14 } },
    representation:
      "q[0..7]: ──H───[Rz(γ)]───●───[Rx(β)]───\n                         │\n                         ●───[Rz(γ)]───",
  },
  qml: {
    name: "Feature Map de QML Híbrido",
    qubits: 4,
    depth: 85,
    gates: { h: 4, ry: 4, rz: 4, cx: 12 },
    optimized: { depth: 32, size: 16, cx: 6, gates: { h: 4, ry: 4, rz: 4, cx: 6 } },
    representation:
      "q[0]: ──H───[Rz(x0)]───●───────[Ry(w0)]───M──\n                       │\nq[1]: ──H───[Rz(x1)]───●───●───[Ry(w1)]───M──\n                           │\nq[2]: ──H───[Rz(x2)]───────●───[Ry(w2)]───M──",
  },
};

const EXECUTION_METRICS = [
  { run: "Ejec. 1", compilerLatency: 120, executionLatency: 850, fidelity: 94.2, noiseLevel: 5.8 },
  { run: "Ejec. 2", compilerLatency: 145, executionLatency: 910, fidelity: 95.8, noiseLevel: 4.2 },
  { run: "Ejec. 3", compilerLatency: 190, executionLatency: 1100, fidelity: 97.4, noiseLevel: 2.6 },
  { run: "Ejec. 4", compilerLatency: 90, executionLatency: 750, fidelity: 93.1, noiseLevel: 6.9 },
  { run: "Ejec. 5", compilerLatency: 210, executionLatency: 1350, fidelity: 98.6, noiseLevel: 1.4 },
  { run: "Ejec. 6", compilerLatency: 165, executionLatency: 980, fidelity: 96.5, noiseLevel: 3.5 },
];

const DEPTH_EFFICIENCY_DATA = [
  { name: "Bell State", level1: 4, level2: 3, level3: 3 },
  { name: "GHZ State", level1: 10, level2: 8, level3: 7 },
  { name: "QML Feature Map", level1: 68, level2: 45, level3: 32 },
  { name: "QAOA Ansatz", level1: 110, level2: 78, level3: 45 },
];

export function QuantumUtilityDashboard() {
  // Config States
  const [objective, setObjective] = useState("hamiltonian_spectrum");
  const [circuitDepth, setCircuitDepth] = useState(75);
  const [qubitCount, setQubitCount] = useState(12);
  const [expectsObservables, setExpectsObservables] = useState(true);
  const [expectsSamples, setExpectsSamples] = useState(false);

  // Manual Addon Overrides
  const [manualAddons, setManualAddons] = useState<Record<string, boolean>>({
    optimization_mapper: true,
    mthree: true,
  });

  // Diagnostic View States
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof CIRCUIT_TEMPLATES>("ghz");
  const [isTranspiling, setIsTranspiling] = useState(false);
  const [diagnosticRunCount, setDiagnosticRunCount] = useState(0);

  // Active Dynamic Recommended Addons
  const recommendedAddons = chooseAddonsLocal({
    objective,
    circuitDepth,
    qubitCount,
    expectsObservables,
    expectsSamples,
  });

  // Toggle Manual Override
  const handleAddonToggle = (id: string) => {
    setManualAddons((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Run Transpilation Diagnostic
  const triggerTranspilation = () => {
    setIsTranspiling(true);
    setTimeout(() => {
      setIsTranspiling(false);
      setDiagnosticRunCount((c) => c + 1);
    }, 1100);
  };

  const currentCircuit = CIRCUIT_TEMPLATES[selectedTemplate];

  // Qiskit package availability mocking (reactive status)
  return (
    <div className="space-y-6 text-foreground p-6 bg-background rounded-3xl border border-border/20 shadow-xl max-w-7xl mx-auto">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-border/15">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-crown/15 border border-crown/30 flex items-center justify-center shadow-[0_0_15px_-4px_rgba(180,112,249,0.3)]">
            <Cpu className="size-6 text-crown animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display tracking-wide text-platinum flex items-center gap-2">
              Plataforma Cuántica de Utilidad{" "}
              <span className="font-mono text-xs bg-crown/20 text-crown px-2 py-0.5 rounded-full">
                qup v0.1.0
              </span>
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Patrón Qiskit Canónico: Map → Optimize → Execute → Post-process
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-mono">
            <CheckCircle2 className="size-3.5" /> Core: Qiskit 1.4 + Aer
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-crown/10 border border-crown/20 text-[11px] text-crown font-mono">
            <ShieldCheck className="size-3.5" /> Auditoría Hash-Chain Activa
          </div>
        </div>
      </div>

      {/* Grid Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Controls & Form Toggles */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-5 rounded-2xl bg-secondary/10 border border-border/15 space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b border-border/10">
              <Sliders className="size-4 text-electric" />
              <h3 className="text-sm font-bold font-mono text-platinum uppercase tracking-wider">
                Configurar Lógica de Selección Directa
              </h3>
            </div>

            {/* Slider: Circuit Depth */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">Profundidad del Circuito:</span>
                <span className="text-electric font-semibold">{circuitDepth} compuertas</span>
              </div>
              <input
                type="range"
                min="5"
                max="500"
                value={circuitDepth}
                onChange={(e) => setCircuitDepth(Number(e.target.value))}
                className="w-full accent-electric bg-secondary/20 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Slider: Qubit Count */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">Cantidad de Qubits:</span>
                <span className="text-electric font-semibold">{qubitCount} qubits</span>
              </div>
              <input
                type="range"
                min="2"
                max="100"
                value={qubitCount}
                onChange={(e) => setQubitCount(Number(e.target.value))}
                className="w-full accent-electric bg-secondary/20 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Dropdown: Objective */}
            <div className="space-y-1.5">
              <label className="block text-xs font-mono text-muted-foreground">
                Objetivo del Experimento:
              </label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full bg-secondary/30 border border-border/25 rounded-xl p-2 text-xs font-mono text-platinum outline-none focus:border-electric"
              >
                <option value="hamiltonian_spectrum">Cálculo de Espectro Hamiltoniano (VQE)</option>
                <option value="qml_classification">Clasificación por QML Híbrido</option>
                <option value="qec_syndrome">Control y Extracción de Síndromes QEC</option>
                <option value="quantum_simulation">Simulación Dinámica de Espines</option>
              </select>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/5 border border-border/10 cursor-pointer hover:bg-secondary/10 transition-all select-none">
                <input
                  type="checkbox"
                  checked={expectsObservables}
                  onChange={(e) => setExpectsObservables(e.target.checked)}
                  className="rounded border-border/40 text-electric focus:ring-electric"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-platinum font-mono">Observables</span>
                  <span className="text-[10px] text-muted-foreground">Espera valores</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/5 border border-border/10 cursor-pointer hover:bg-secondary/10 transition-all select-none">
                <input
                  type="checkbox"
                  checked={expectsSamples}
                  onChange={(e) => setExpectsSamples(e.target.checked)}
                  className="rounded border-border/40 text-electric focus:ring-electric"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-platinum font-mono">Muestras</span>
                  <span className="text-[10px] text-muted-foreground">Frecuencia bitstrings</span>
                </div>
              </label>
            </div>

            {/* Auto-selected list badge view */}
            <div className="p-3.5 rounded-xl bg-electric/5 border border-electric/15 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-electric font-semibold">
                <span>RECOMENDACIÓN DINÁMICA (choose_addons):</span>
                <span className="px-1.5 py-0.5 rounded-md bg-electric/10 border border-electric/25">
                  AUTO
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recommendedAddons.length > 0 ? (
                  recommendedAddons.map((addon) => (
                    <span
                      key={addon}
                      className="text-[10px] font-mono bg-electric/15 border border-electric/30 text-electric px-2.5 py-1 rounded-lg"
                    >
                      {addon}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] font-mono text-muted-foreground italic">
                    Ninguno seleccionado para esta profundidad/tipo.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Manual Addon Override Panel */}
          <div className="p-5 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/10">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-crown" />
                <h3 className="text-sm font-bold font-mono text-platinum uppercase tracking-wider">
                  Habilitación Manual de Addons
                </h3>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">Override</span>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {REGISTERED_ADDONS.map((addon) => {
                const isAuto = recommendedAddons.includes(addon.id);
                const isActive = manualAddons[addon.id] || isAuto;

                return (
                  <div
                    key={addon.id}
                    onClick={() => handleAddonToggle(addon.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? "bg-crown/5 border-crown/30"
                        : "bg-secondary/5 border-transparent hover:border-border/15"
                    }`}
                  >
                    <div className="flex flex-col max-w-[70%]">
                      <span className="text-xs font-bold text-platinum font-mono">
                        {addon.name}
                      </span>
                      <span className="text-[9.5px] text-muted-foreground truncate">
                        {addon.desc}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAuto && (
                        <span className="text-[8.5px] font-mono font-semibold text-electric bg-electric/10 border border-electric/20 px-1 rounded">
                          AUTO
                        </span>
                      )}
                      <span
                        className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${
                          isActive
                            ? "bg-crown/20 text-crown font-bold"
                            : "bg-secondary/30 text-muted-foreground"
                        }`}
                      >
                        {isActive ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Diagnostic Circuit Inspector & Recharts Visualizations */}
        <div className="lg:col-span-7 space-y-6">
          {/* Diagnostic Circuit Inspector Section */}
          <div className="p-5 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/10">
              <div className="flex items-center gap-2">
                <Binary className="size-4 text-emerald-400" />
                <h3 className="text-sm font-bold font-mono text-platinum uppercase tracking-wider">
                  Inspector de Disposición de Circuitos
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">Template:</span>
                <select
                  value={selectedTemplate}
                  onChange={(e) =>
                    setSelectedTemplate(e.target.value as keyof typeof CIRCUIT_TEMPLATES)
                  }
                  className="bg-secondary/40 border border-border/20 rounded-xl px-2 py-1 text-xs font-mono text-platinum outline-none"
                >
                  <option value="bell">Estado Bell</option>
                  <option value="ghz">Estado GHZ (5Q)</option>
                  <option value="qml">QML Feature Map</option>
                  <option value="qaoa">QAOA Ansatz</option>
                </select>
              </div>
            </div>

            {/* Before / After Transpilation Side-by-side Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ORIGINAL CIRCUIT CARD */}
              <div className="p-4 rounded-xl bg-secondary/5 border border-border/10 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex justify-between items-center pb-2 border-b border-border/5">
                    <span className="text-xs font-mono font-bold text-platinum">
                      Circuito Original (Pre-Mapeo)
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground bg-secondary/20 px-1.5 py-0.5 rounded">
                      Fisico
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-emerald-400 bg-secondary/30 p-2.5 rounded-xl border border-border/10 mt-2.5 h-[110px] overflow-auto whitespace-pre">
                    {currentCircuit.representation}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center font-mono pt-1">
                  <div className="p-1 bg-secondary/20 rounded">
                    <div className="text-[10px] text-muted-foreground">Profundidad</div>
                    <div className="text-xs font-bold text-platinum">{currentCircuit.depth}</div>
                  </div>
                  <div className="p-1 bg-secondary/20 rounded">
                    <div className="text-[10px] text-muted-foreground">Tamaño</div>
                    <div className="text-xs font-bold text-platinum">
                      {Object.values(currentCircuit.gates).reduce((a, b) => a + b, 0)}
                    </div>
                  </div>
                  <div className="p-1 bg-secondary/20 rounded">
                    <div className="text-[10px] text-muted-foreground">CX Compuertas</div>
                    <div className="text-xs font-bold text-platinum">
                      {"cx" in currentCircuit.gates
                        ? (currentCircuit.gates as Record<string, number>).cx
                        : 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* OPTIMIZED ISA CIRCUIT CARD */}
              <div className="p-4 rounded-xl bg-crown/5 border border-crown/20 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex justify-between items-center pb-2 border-b border-crown/10">
                    <span className="text-xs font-mono font-bold text-crown">
                      Circuito ISA (Optimizado)
                    </span>
                    {diagnosticRunCount > 0 ? (
                      <span className="text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded">
                        -
                        {Math.round(
                          (1 - currentCircuit.optimized.depth / currentCircuit.depth) * 100,
                        )}
                        % Depth
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground bg-secondary/20 px-1.5 py-0.5 rounded">
                        Pendiente
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-crown bg-crown/5 p-2.5 rounded-xl border border-crown/10 mt-2.5 h-[110px] overflow-auto flex items-center justify-center">
                    {isTranspiling ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <RotateCcw className="size-5 text-crown animate-spin" />
                        <span className="text-[9px] font-mono text-muted-foreground">
                          Optimizando layout...
                        </span>
                      </div>
                    ) : diagnosticRunCount > 0 ? (
                      <pre className="text-left w-full text-crown leading-tight">
                        {currentCircuit.representation.replace(/──/g, "─")}
                      </pre>
                    ) : (
                      <span className="text-xs italic text-muted-foreground text-center">
                        Presiona &quot;Optimizar Circuito&quot; para ejecutar transpilador QUP.
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center font-mono pt-1">
                  <div className="p-1 bg-crown/10 rounded">
                    <div className="text-[10px] text-muted-foreground">Profundidad</div>
                    <div className="text-xs font-bold text-platinum">
                      {diagnosticRunCount > 0 ? currentCircuit.optimized.depth : "-"}
                    </div>
                  </div>
                  <div className="p-1 bg-crown/10 rounded">
                    <div className="text-[10px] text-muted-foreground">Tamaño</div>
                    <div className="text-xs font-bold text-platinum">
                      {diagnosticRunCount > 0 ? currentCircuit.optimized.size : "-"}
                    </div>
                  </div>
                  <div className="p-1 bg-crown/10 rounded">
                    <div className="text-[10px] text-muted-foreground">CX Compuertas</div>
                    <div className="text-xs font-bold text-platinum">
                      {diagnosticRunCount > 0 ? currentCircuit.optimized.cx : "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Diagnostic trigger control */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10.5px] font-mono text-muted-foreground flex items-center gap-1">
                <Clock className="size-3.5 text-electric" /> Latencia estimada:{" "}
                {diagnosticRunCount > 0 ? "~14ms compiler" : "Pendiente"}
              </span>
              <button
                onClick={triggerTranspilation}
                disabled={isTranspiling}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-platinum text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/10"
              >
                {isTranspiling ? (
                  <>
                    <RotateCcw className="size-3.5 animate-spin" /> Ejecutando...
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" /> Optimizar Circuito
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Performance Analytics (Recharts Visualization) */}
          <div className="p-5 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/10">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-emerald-400" />
                <h3 className="text-sm font-bold font-mono text-platinum uppercase tracking-wider">
                  Métricas de Latencia y Rendimiento de Compilación (qup)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">
                Historial AuditLogger
              </span>
            </div>

            {/* Recharts Tabs and charts container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Latency Comparison (Stacked Bar Chart) */}
              <div className="p-3 bg-secondary/5 border border-border/10 rounded-xl space-y-2">
                <span className="text-xs font-mono text-platinum block font-bold">
                  Latencia de Ejecución por Corrida (ms)
                </span>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={EXECUTION_METRICS}
                      margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2935" />
                      <XAxis dataKey="run" tick={{ fill: "#9ca3af", fontSize: 9 }} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 9 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1e1d29", borderColor: "#3d3a54" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Bar
                        dataKey="compilerLatency"
                        name="Compilador (ms)"
                        stackId="a"
                        fill="#b470f9"
                      />
                      <Bar
                        dataKey="executionLatency"
                        name="Hardware QPU (ms)"
                        stackId="a"
                        fill="#10b981"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Depth reduction chart (Grouped Bar Chart) */}
              <div className="p-3 bg-secondary/5 border border-border/10 rounded-xl space-y-2">
                <span className="text-xs font-mono text-platinum block font-bold">
                  Profundidad según Nivel Transpilador
                </span>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={DEPTH_EFFICIENCY_DATA}
                      margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2935" />
                      <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 9 }} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 9 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1e1d29", borderColor: "#3d3a54" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Line
                        type="monotone"
                        dataKey="level1"
                        name="Nivel 1"
                        stroke="#ef4444"
                        strokeWidth={1.5}
                      />
                      <Line
                        type="monotone"
                        dataKey="level2"
                        name="Nivel 2"
                        stroke="#eab308"
                        strokeWidth={1.5}
                      />
                      <Line
                        type="monotone"
                        dataKey="level3"
                        name="Nivel 3"
                        stroke="#10b981"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER: Environmental Operational Availability Status Dashboard */}
      <div className="p-5 rounded-2xl bg-secondary/10 border border-border/15 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/10">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-crown" />
            <h3 className="text-sm font-bold font-mono text-platinum uppercase tracking-wider">
              Disponibilidad y Diagnóstico del Entorno Qiskit SDK
            </h3>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="size-3.5 text-emerald-400 animate-pulse" /> Estado: Operativo
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-secondary/5 border border-border/10 space-y-1">
            <span className="block text-[10px] font-mono text-muted-foreground uppercase">
              Qiskit SDK Core
            </span>
            <span className="block text-xs font-bold text-platinum font-mono">
              v1.4.0 (Installed)
            </span>
            <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
              🟢 Nativo Completo
            </span>
          </div>
          <div className="p-3 rounded-xl bg-secondary/5 border border-border/10 space-y-1">
            <span className="block text-[10px] font-mono text-muted-foreground uppercase">
              Aer Simulator
            </span>
            <span className="block text-xs font-bold text-platinum font-mono">
              v0.15.2 (Running)
            </span>
            <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
              🟢 GPU / CPU Hilo
            </span>
          </div>
          <div className="p-3 rounded-xl bg-secondary/5 border border-border/10 space-y-1">
            <span className="block text-[10px] font-mono text-muted-foreground uppercase">
              Runtime Connection
            </span>
            <span className="block text-xs font-bold text-platinum font-mono">
              Local Offline Driver
            </span>
            <span className="text-[9px] font-mono text-crown flex items-center gap-1">
              🟡 Gateway C.R.O.W.N.
            </span>
          </div>
          <div className="p-3 rounded-xl bg-secondary/5 border border-border/10 space-y-1">
            <span className="block text-[10px] font-mono text-muted-foreground uppercase">
              Mitigación M3
            </span>
            <span className="block text-xs font-bold text-platinum font-mono">
              Disponibilidad Fallback
            </span>
            <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
              🟢 Listo para postprocesar
            </span>
          </div>
        </div>

        {/* Detailed diagnostic logs scroll block */}
        <div className="p-3 bg-black/40 border border-border/10 rounded-xl font-mono text-[10px] text-muted-foreground space-y-1 select-none max-h-[85px] overflow-auto">
          <div>
            [INFO] Initializing quantum-utility-platform (qup) driver backend configuration...
          </div>
          <div>
            [INFO] Registering 13 optional quantum addons successfully in local AddonRegistry.
          </div>
          <div>
            [INFO] Transpiler loaded with optimization level 1..3 defaults; transpiling mapped
            layouts directly into ISA circuits.
          </div>
          <div>
            [SUCCESS] System bound gracefully to local AerSimulator high-fidelity backend.
            Operational readiness 100%.
          </div>
        </div>
      </div>
    </div>
  );
}
