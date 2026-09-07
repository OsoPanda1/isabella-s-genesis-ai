import { useState, useEffect } from "react";
import { Cpu, Server, HardDrive, RefreshCw, Layers, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface K8sNode {
  name: string;
  role: string;
  status: "Ready" | "NotReady";
  cpu: number;
  memory: number;
}

export function SystemMonitor() {
  const [envMode, setEnvMode] = useState<"development" | "staging" | "production">("production");
  const [replicas, setReplicas] = useState(3);
  const [globalCpu, setGlobalCpu] = useState(24);
  const [globalMem, setGlobalMem] = useState(38);
  const [isScaling, setIsScaling] = useState(false);

  // Simulated node details
  const [nodes, setNodes] = useState<K8sNode[]>([
    { name: "nodo-cero-master", role: "control-plane", status: "Ready", cpu: 18, memory: 30 },
    { name: "tamv-worker-1", role: "worker", status: "Ready", cpu: 27, memory: 42 },
    { name: "tamv-worker-2", role: "worker", status: "Ready", cpu: 22, memory: 35 },
  ]);

  // Detect environment mode based on active window hostname
  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host.includes("-dev") || host.includes("localhost") || host.includes("127.0.0.1")) {
        setEnvMode("development");
      } else if (host.includes("-pre") || host.includes("staging")) {
        setEnvMode("staging");
      } else {
        setEnvMode("production");
      }
    }
  }, []);

  // Update CPU/Memory utilization dynamically to simulate real-time metrics
  useEffect(() => {
    const interval = setInterval(() => {
      setGlobalCpu((prev) => {
        const delta = Math.floor(Math.random() * 5) - 2;
        return Math.max(10, Math.min(95, prev + delta));
      });
      setGlobalMem((prev) => {
        const delta = Math.floor(Math.random() * 3) - 1;
        return Math.max(20, Math.min(90, prev + delta));
      });

      // Update individual nodes
      setNodes((prevNodes) =>
        prevNodes.map((n) => {
          const cpuDelta = Math.floor(Math.random() * 6) - 3;
          const memDelta = Math.floor(Math.random() * 4) - 2;
          return {
            ...n,
            cpu: Math.max(5, Math.min(98, n.cpu + cpuDelta)),
            memory: Math.max(10, Math.min(95, n.memory + memDelta)),
          };
        }),
      );
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  const handleScaleReplicas = () => {
    setIsScaling(true);
    const target = replicas === 3 ? 5 : 3;
    toast.info(`Iniciando escalado de pods K8s de ${replicas} a ${target} réplicas...`);

    setTimeout(() => {
      setReplicas(target);
      setIsScaling(false);

      if (target === 5) {
        setNodes((prev) => [
          ...prev,
          { name: "tamv-worker-3-temp", role: "worker", status: "Ready", cpu: 12, memory: 18 },
          { name: "tamv-worker-4-temp", role: "worker", status: "Ready", cpu: 15, memory: 20 },
        ]);
        toast.success("Réplicas escaladas con éxito: 5/5 pods activos.");
      } else {
        setNodes((prev) => prev.slice(0, 3));
        toast.success("Escalado inverso completado: 3/3 pods optimizados.");
      }
    }, 1800);
  };

  return (
    <div
      className="p-5 rounded-2xl bg-[#13151f] border border-border/10 space-y-4 font-mono text-xs text-muted-foreground"
      id="system-k8s-monitor"
    >
      <div className="flex items-center justify-between pb-2 border-b border-border/5">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-emerald-400" />
          <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
            Consola K8s y Monitoreo del Entorno
          </h3>
        </div>
        <div
          className="flex items-center gap-1.5 font-bold uppercase text-[9px] px-2.5 py-0.5 rounded-full border"
          style={{
            borderColor:
              envMode === "production"
                ? "rgba(16, 185, 129, 0.3)"
                : envMode === "staging"
                  ? "rgba(234, 179, 8, 0.3)"
                  : "rgba(180, 112, 249, 0.3)",
            color:
              envMode === "production" ? "#10b981" : envMode === "staging" ? "#eab308" : "#b470f9",
            backgroundColor:
              envMode === "production"
                ? "rgba(16, 185, 129, 0.05)"
                : envMode === "staging"
                  ? "rgba(234, 179, 8, 0.05)"
                  : "rgba(180, 112, 249, 0.05)",
          }}
        >
          ENTORNO: {envMode}
        </div>
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Metric 1: CPU */}
        <div className="p-3 bg-black/25 border border-border/5 rounded-xl space-y-2">
          <div className="flex justify-between items-center text-[10px]">
            <span className="flex items-center gap-1 font-bold text-white uppercase">
              <Cpu className="size-3.5 text-emerald-400" /> Uso de CPU
            </span>
            <span className="font-bold text-emerald-400">{globalCpu}%</span>
          </div>
          <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-400 h-full transition-all duration-1000"
              style={{ width: `${globalCpu}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Memory */}
        <div className="p-3 bg-black/25 border border-border/5 rounded-xl space-y-2">
          <div className="flex justify-between items-center text-[10px]">
            <span className="flex items-center gap-1 font-bold text-white uppercase">
              <HardDrive className="size-3.5 text-blue-400" /> Uso de Memoria
            </span>
            <span className="font-bold text-blue-400">{globalMem}%</span>
          </div>
          <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-400 h-full transition-all duration-1000"
              style={{ width: `${globalMem}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Pod replicas */}
        <div className="p-3 bg-black/25 border border-border/5 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[10px] font-bold text-white uppercase flex items-center gap-1">
              <Layers className="size-3.5 text-crown" /> Réplicas de Pod
            </span>
            <span className="block text-lg font-bold text-white">{replicas} de 5 habilitados</span>
          </div>
          <button
            type="button"
            onClick={handleScaleReplicas}
            disabled={isScaling}
            className="px-2.5 py-1.5 rounded-lg bg-crown/15 hover:bg-crown/25 text-crown border border-crown/20 text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
          >
            {isScaling ? <RefreshCw className="size-3 animate-spin" /> : <span>Escalar K8s</span>}
          </button>
        </div>
      </div>

      {/* DETAILED NODE TABLE */}
      <div className="space-y-1.5">
        <span className="block text-[10px] uppercase font-bold text-white pb-1">
          Estado Detallado de Réplicas de Nodo:
        </span>
        <div className="space-y-1 max-h-[110px] overflow-auto pr-1">
          {nodes.map((node) => (
            <div
              key={node.name}
              className="flex items-center justify-between p-2 bg-black/15 border border-border/5 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="size-3.5 text-emerald-400" />
                <span className="text-white font-semibold font-mono text-[11px]">{node.name}</span>
                <span className="text-[9px] text-muted-foreground bg-black/35 px-1.5 py-0.5 rounded border border-border/5 capitalize">
                  {node.role}
                </span>
              </div>
              <div className="flex gap-4 font-mono text-[10px]">
                <span>
                  CPU: <strong className="text-white">{node.cpu}%</strong>
                </span>
                <span>
                  MEM: <strong className="text-white">{node.memory}%</strong>
                </span>
                <span className="text-emerald-400 font-bold uppercase">Ready</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
