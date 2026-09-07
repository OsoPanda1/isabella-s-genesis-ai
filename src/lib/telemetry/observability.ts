import { IsabellaCoreId, ISABELLA_MODULE_CATALOG, IsabellaModuleId } from "../latam-aegis-x";

export interface CoreTelemetryMetric {
  id: IsabellaCoreId;
  moduleId: IsabellaModuleId;
  status: "active" | "warning" | "error" | "restarting";
  memoryUsageBytes: number;
  stackDepth: number;
  temperatureCelsius: number;
  loadPercentage: number;
  errorCount: number;
}

export interface ObservabilitySnapshot {
  timestamp: string;
  throughput: number; // requests/sec
  avgLatencyMs: number;
  anomalyScore: number;
  totalEventsProcessed: number;
  incidentsCount: number;
  cores: Record<IsabellaCoreId, CoreTelemetryMetric>;
}

type TelemetryListener = (snapshot: ObservabilitySnapshot) => void;

class ObservabilityEngine {
  private currentSnapshot: ObservabilitySnapshot;
  private listeners: Set<TelemetryListener> = new Set();
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.currentSnapshot = this.generateInitialSnapshot();
    this.startSimulation();
  }

  private generateInitialSnapshot(): ObservabilitySnapshot {
    const coresRecord = {} as Record<IsabellaCoreId, CoreTelemetryMetric>;

    // Dynamically list all 24 cores from the module catalog
    for (const [modId, modMeta] of Object.entries(ISABELLA_MODULE_CATALOG)) {
      const moduleId = modId as IsabellaModuleId;
      for (const coreId of modMeta.cores) {
        coresRecord[coreId] = {
          id: coreId,
          moduleId,
          status: "active",
          memoryUsageBytes: 15 * 1024 * 1024 + Math.random() * 45 * 1024 * 1024, // 15MB - 60MB
          stackDepth: Math.floor(5 + Math.random() * 20),
          temperatureCelsius: 32 + Math.random() * 15, // 32°C - 47°C
          loadPercentage: 5 + Math.random() * 25, // 5% - 30%
          errorCount: 0,
        };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      throughput: 12 + Math.random() * 8,
      avgLatencyMs: 42 + Math.random() * 15,
      anomalyScore: 0.04,
      totalEventsProcessed: 14205,
      incidentsCount: 0,
      cores: coresRecord,
    };
  }

  private startSimulation() {
    if (typeof window === "undefined" && typeof global === "undefined") return;

    this.intervalId = setInterval(() => {
      this.updateMetrics();
    }, 2000);
  }

  private updateMetrics() {
    const s = this.currentSnapshot;
    s.timestamp = new Date().toISOString();

    // Simulate slight variations in global stats
    s.throughput = Math.max(2, s.throughput + (Math.random() * 6 - 3));
    s.avgLatencyMs = Math.max(10, s.avgLatencyMs + (Math.random() * 10 - 5));
    s.totalEventsProcessed += Math.floor(s.throughput * 2);

    // Dynamic variation for each core
    for (const coreId of Object.keys(s.cores) as IsabellaCoreId[]) {
      const core = s.cores[coreId];
      if (core.status === "restarting") {
        core.status = "active";
        core.memoryUsageBytes = 12 * 1024 * 1024 + Math.random() * 5 * 1024 * 1024;
        core.stackDepth = 1;
        core.temperatureCelsius = 30 + Math.random() * 2;
        core.loadPercentage = 2;
      } else {
        // Random drift
        const deltaLoad = Math.random() * 12 - 6;
        core.loadPercentage = Math.max(1, Math.min(99, core.loadPercentage + deltaLoad));

        const deltaMem = Math.random() * 200000 - 90000;
        core.memoryUsageBytes = Math.max(5 * 1024 * 1024, core.memoryUsageBytes + deltaMem);

        const deltaTemp = core.loadPercentage / 20 + (Math.random() * 2 - 1);
        core.temperatureCelsius = Math.max(25, Math.min(85, core.temperatureCelsius + deltaTemp));

        core.stackDepth = Math.max(
          1,
          Math.min(250, core.stackDepth + Math.floor(Math.random() * 5 - 2)),
        );
      }
    }

    // Notify all active listeners
    this.notifyListeners();
  }

  private notifyListeners() {
    const snapshotCopy = JSON.parse(JSON.stringify(this.currentSnapshot)) as ObservabilitySnapshot;
    this.listeners.forEach((listener) => {
      try {
        listener(snapshotCopy);
      } catch (err) {
        console.error("Error invoking telemetry listener:", err);
      }
    });
  }

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    // Call immediately with initial state
    listener(JSON.parse(JSON.stringify(this.currentSnapshot)));
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): ObservabilitySnapshot {
    return JSON.parse(JSON.stringify(this.currentSnapshot));
  }

  public recordEvent(latencyMs: number, score: number) {
    const s = this.currentSnapshot;
    s.totalEventsProcessed += 1;
    s.avgLatencyMs = (s.avgLatencyMs * 19 + latencyMs) / 20;
    s.anomalyScore = (s.anomalyScore * 19 + score) / 20;
    this.notifyListeners();
  }

  public forceRestartCore(coreId: IsabellaCoreId) {
    const s = this.currentSnapshot;
    if (s.cores[coreId]) {
      s.cores[coreId].status = "restarting";
      s.cores[coreId].errorCount = 0;
      this.notifyListeners();
    }
  }

  public flagCoreWarning(coreId: IsabellaCoreId, load: number, stack: number) {
    const s = this.currentSnapshot;
    if (s.cores[coreId]) {
      s.cores[coreId].status = "warning";
      s.cores[coreId].loadPercentage = load;
      s.cores[coreId].stackDepth = stack;
      this.notifyListeners();
    }
  }

  public flagCoreError(coreId: IsabellaCoreId, memory: number) {
    const s = this.currentSnapshot;
    if (s.cores[coreId]) {
      s.cores[coreId].status = "error";
      s.cores[coreId].errorCount += 1;
      s.cores[coreId].memoryUsageBytes = memory;
      this.notifyListeners();
    }
  }

  public dispose() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const ObservabilityService = new ObservabilityEngine();
