import { useState } from "react";
import { Cpu, Play, ListCollapse, Clock, Percent } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { toast } from "sonner";

interface QuantumJob {
  id: string;
  objective: string;
  backend: string;
  status: "Queued" | "Transpiling" | "Executing" | "Completed" | "Failed";
  qubits: number;
  fidelity: number;
  durationMs: number;
  timestamp: string;
}

export function QuantumJobMonitor() {
  // Sin jobs semilla: la cola inicia vacía y solo muestra trabajos
  // ejecutados de verdad contra /api/db?action=qup-run en esta sesión.
  const [jobs, setJobs] = useState<QuantumJob[]>([]);

  const [isSimulating, setIsSimulating] = useState(false);

  const handleSimulateNewJob = async () => {
    setIsSimulating(true);
    const newId = `qup-job-${Math.random().toString(36).substring(2, 6)}`;

    const randomObjectives = [
      { obj: "qml_classification", label: "Clasificación QML Híbrido" },
      { obj: "hamiltonian_spectrum", label: "Cálculo Hamiltonian VQE" },
      { obj: "quantum_simulation", label: "Estado Bell (2 Qubits)" },
      { obj: "hamiltonian_spectrum", label: "Ansatz QAOA de Espín" },
    ] as const;

    const randomBackends = ["aer_simulator_local", "aws_braket_dm1", "ibm_sherbrooke_qpu"] as const;

    const choice = randomObjectives[Math.floor(Math.random() * randomObjectives.length)];
    const backend = randomBackends[Math.floor(Math.random() * randomBackends.length)];
    const qubits = Math.floor(Math.random() * 8) + 2;

    const newJob: QuantumJob = {
      id: newId,
      objective: choice.label,
      backend: backend,
      status: "Queued",
      qubits: qubits,
      fidelity: 0,
      durationMs: 0,
      timestamp: "Recién adicionado",
    };

    setJobs((prev) => [newJob, ...prev]);
    toast.info(`Trabajo ${newId} enviado a la cola del transpilador QUP.`);

    try {
      const { getSessionToken, ensureSessionToken } = await import("@/lib/auth-client");
      let token = getSessionToken();
      if (!token) {
        try {
          token = await ensureSessionToken();
        } catch {
          const devRes = await fetch("/api/db?action=dev-session", {
            method: "POST",
          });
          if (devRes.ok) {
            token = (await devRes.json()).token;
          }
        }
      }

      if (!token) throw new Error("No token disponible");

      const payload = {
        dataset: {
          name: "random-job-dataset",
          features: [{ x: 1, y: 0 }],
        },
        backend: backend,
        config: {
          qubitCount: qubits,
          circuitDepth: 15,
          objective: choice.obj,
          errorMitigation: [],
          errorCorrection: "none",
          classicalBaseline: "xgboost",
        },
      };

      setJobs((prev) =>
        prev.map((j) =>
          j.id === newId ? { ...j, status: "Transpiling", timestamp: "Transpilando..." } : j,
        ),
      );

      const res = await fetch("/api/db?action=qup-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Error en API cuántica");
      }

      const { result } = await res.json();

      setJobs((prev) =>
        prev.map((j) =>
          j.id === newId
            ? {
                ...j,
                status: "Completed",
                fidelity: parseFloat((result.runtime.quantumFidelity * 100).toFixed(1)),
                durationMs: result.compilation.latencyMs,
                timestamp: "Hace unos instantes",
              }
            : j,
        ),
      );
      toast.success(
        `Trabajo cuántico ${newId} completado con fidelidad: ${(result.runtime.quantumFidelity * 100).toFixed(1)}%`,
      );
    } catch (e) {
      setJobs((prev) =>
        prev.map((j) => (j.id === newId ? { ...j, status: "Failed", timestamp: "Falló" } : j)),
      );
      toast.error(`Error ejecutando job: ${e instanceof Error ? e.message : "Desconocido"}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // Compile data for Recharts chart
  const completedJobsData = jobs
    .filter((j) => j.status === "Completed")
    .map((j) => ({
      name: j.id,
      fidelity: j.fidelity,
      duration: j.durationMs,
    }))
    .reverse();

  // Latencia promedio real de los trabajos completados en esta sesión.
  const averageLatencyLabel = (() => {
    const done = jobs.filter((j) => j.status === "Completed" && j.durationMs > 0);
    if (done.length === 0) return "Sin corridas aún";
    const avg = done.reduce((acc, j) => acc + j.durationMs, 0) / done.length;
    return `${(avg / 1000).toFixed(2)} seg / Corrida (${done.length})`;
  })();

  return (
    <div
      className="p-5 rounded-2xl bg-[#13151f] border border-border/10 space-y-4 text-muted-foreground text-xs"
      id="quantum-job-monitor-module"
    >
      <div className="flex items-center justify-between pb-2 border-b border-border/5">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-emerald-400" />
          <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
            Monitor de Trabajos y Colas de Ejecución (QUP Monitor)
          </h3>
        </div>
        <button
          type="button"
          onClick={handleSimulateNewJob}
          disabled={isSimulating}
          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold uppercase flex items-center gap-1 transition-all"
        >
          <Play className="size-3" /> Inyectar Job a Cola
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* JOBS LIST TABLE */}
        <div className="lg:col-span-7 space-y-2.5">
          <span className="block text-[10px] uppercase font-bold text-white font-mono flex items-center gap-1">
            <ListCollapse className="size-3.5 text-crown" /> Cola de estimación (estimador clásico
            QUP):
          </span>
          <div className="border border-border/10 rounded-xl overflow-hidden bg-black/15">
            <div className="grid grid-cols-12 gap-2 p-2 bg-black/40 text-[9.5px] font-bold text-white border-b border-border/5 uppercase font-mono">
              <div className="col-span-3">Job ID</div>
              <div className="col-span-4">Algoritmo/Ansatz</div>
              <div className="col-span-3">Estado</div>
              <div className="col-span-2 text-right">Fidelidad</div>
            </div>
            <div className="divide-y divide-border/5 max-h-[190px] overflow-auto">
              {jobs.length === 0 && (
                <div className="p-4 text-center italic text-muted-foreground text-[11px]">
                  Cola vacía. Inyecta un job para ejecutar el pipeline QUP real (compilación +
                  estimación + gobernanza + sello de auditoría).
                </div>
              )}
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="grid grid-cols-12 gap-2 p-2.5 items-center font-mono text-[10.5px] hover:bg-black/10 transition-colors"
                >
                  <div className="col-span-3 text-white font-bold truncate" title={job.id}>
                    {job.id}
                  </div>
                  <div className="col-span-4 text-muted-foreground truncate" title={job.objective}>
                    {job.objective}{" "}
                    <span className="text-[9px] text-crown font-semibold block">
                      ({job.qubits} qubits)
                    </span>
                  </div>
                  <div className="col-span-3 flex items-center gap-1.5">
                    <span
                      className={`size-1.5 rounded-full ${
                        job.status === "Completed"
                          ? "bg-emerald-400"
                          : job.status === "Executing"
                            ? "bg-purple-400 animate-pulse"
                            : job.status === "Transpiling"
                              ? "bg-amber-400 animate-spin"
                              : "bg-blue-400 animate-pulse"
                      }`}
                    />
                    <span
                      className={`capitalize font-bold text-[9px] ${
                        job.status === "Completed"
                          ? "text-emerald-400"
                          : job.status === "Executing"
                            ? "text-purple-400"
                            : job.status === "Transpiling"
                              ? "text-amber-400"
                              : "text-blue-400"
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <div className="col-span-2 text-right font-extrabold text-white">
                    {job.fidelity > 0 ? `${job.fidelity}%` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* METRICS CHARTS PANEL */}
        <div className="lg:col-span-5 p-3.5 bg-black/25 border border-border/5 rounded-xl flex flex-col justify-between">
          <div className="space-y-2">
            <span className="block text-[10px] uppercase font-bold text-white font-mono flex items-center gap-1">
              <Percent className="size-3.5 text-emerald-400" /> Fidelidad Histórica:
            </span>
            <div className="h-[120px] w-full">
              {completedJobsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={completedJobsData}
                    margin={{ top: 5, right: 5, left: -32, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#232635" />
                    <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 8.5 }} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 8.5 }} domain={[90, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#13151f",
                        borderColor: "#2d2f3d",
                      }}
                    />
                    <Bar
                      dataKey="fidelity"
                      fill="#10b981"
                      radius={[3, 3, 0, 0]}
                      name="Fidelidad (%)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center italic text-muted-foreground text-[11px]">
                  Esperando trabajos completados para graficar...
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-border/5 flex items-center justify-between text-[9.5px] font-mono">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3 text-purple-400" /> Latencia Promedio:
            </span>
            <strong className="text-white font-bold">{averageLatencyLabel}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
