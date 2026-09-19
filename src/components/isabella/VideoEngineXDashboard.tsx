import { useEffect, useState, useCallback } from "react";
import {
  Video,
  Play,
  Film,
  Sparkles,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Clock,
  Cpu,
  RefreshCw,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  Sliders,
  Maximize2,
  Lock,
  GitBranch,
} from "lucide-react";
import type {
  VideoProject,
  NarrativeGraph,
  ITSGTimeline,
  QualityReport,
  C2PAManifest,
  ImpactAnalysisResult,
  ShotCardX,
  TargetFormat,
} from "@/lib/video-x/types";
import { PROJECT_STATUS_FLOW } from "@/lib/video-x/engine";

export function VideoEngineXDashboard() {
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("proj-isabella-mineral-01");
  const [project, setProject] = useState<VideoProject | null>(null);
  const [graph, setGraph] = useState<NarrativeGraph | null>(null);
  const [timeline, setTimeline] = useState<ITSGTimeline | null>(null);
  const [qaReport, setQaReport] = useState<QualityReport | null>(null);
  const [c2paManifest, setC2paManifest] = useState<C2PAManifest | null>(null);
  const [shotCards, setShotCards] = useState<ShotCardX[]>([]);

  const [activeTab, setActiveTab] = useState<
    "graph" | "timeline" | "shotcards" | "fabric" | "qa" | "c2pa"
  >("graph");

  const [loading, setLoading] = useState(false);
  const [impactAnalysis, setImpactAnalysis] = useState<ImpactAnalysisResult | null>(null);
  const [selectedShotCardCategory, setSelectedShotCardCategory] = useState<string>("all");

  // New project modal state
  const [newTitle, setNewTitle] = useState("");
  const [newPremise, setNewPremise] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch project details
  const fetchProjectDetails = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/video-engine-x?action=project&id=${projectId}`);
      const data = await res.json();
      if (data.success) {
        setProject(data.project);
        setGraph(data.narrativeGraph);
        setTimeline(data.timeline);
        setQaReport(data.qaReport);
        setC2paManifest(data.c2paManifest);
      }
    } catch (e) {
      console.error("Error fetching Video X details", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch projects list & shotcards on mount
  useEffect(() => {
    async function initData() {
      try {
        const [projRes, cardsRes] = await Promise.all([
          fetch("/api/video-engine-x?action=projects"),
          fetch("/api/video-engine-x?action=shot-cards"),
        ]);
        const projData = await projRes.json();
        const cardsData = await cardsRes.json();

        if (projData.success) {
          setProjects(projData.projects);
          if (projData.projects.length > 0) {
            setSelectedProjectId(projData.projects[0].id);
            fetchProjectDetails(projData.projects[0].id);
          }
        }
        if (cardsData.success) {
          setShotCards(cardsData.shotCards);
        }
      } catch (e) {
        console.error("Error initializing Video X Dashboard", e);
      }
    }
    initData();
  }, [fetchProjectDetails]);

  // Advance state machine
  const handleAdvanceState = async () => {
    if (!project) return;
    try {
      const res = await fetch("/api/video-engine-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance-status",
          projectId: project.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProject(data.project);
        fetchProjectDetails(project.id);
      }
    } catch (e) {
      console.error("Error advancing state", e);
    }
  };

  // Mutate graph node and compute narrative impact
  const handleMutateNode = async (nodeId: string) => {
    if (!project) return;
    try {
      const res = await fetch("/api/video-engine-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mutate-node",
          projectId: project.id,
          nodeId,
          properties: { wardrobe: "historical_coat_dark_blue_v2", lighting: "blue_hour_enhanced" },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setImpactAnalysis(data.impactAnalysis);
      }
    } catch (e) {
      console.error("Error mutating node", e);
    }
  };

  // Regenerate individual shot
  const handleRegenerateShot = async (shotId: string) => {
    if (!project) return;
    try {
      const res = await fetch("/api/video-engine-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "regenerate-shot",
          projectId: project.id,
          shotId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchProjectDetails(project.id);
      }
    } catch (e) {
      console.error("Error regenerating shot", e);
    }
  };

  // Run Multimodal QA
  const handleRunQA = async () => {
    if (!project) return;
    try {
      const res = await fetch("/api/video-engine-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run-qa",
          projectId: project.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setQaReport(data.qaReport);
      }
    } catch (e) {
      console.error("Error running QA", e);
    }
  };

  // Export C2PA Manifest
  const handleExportC2PA = async () => {
    if (!project) return;
    try {
      const res = await fetch("/api/video-engine-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export-c2pa",
          projectId: project.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setC2paManifest(data.c2paManifest);
        fetchProjectDetails(project.id);
      }
    } catch (e) {
      console.error("Error exporting C2PA", e);
    }
  };

  // Create Project
  const handleCreateProject = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch("/api/video-engine-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-project",
          title: newTitle,
          premise: newPremise || "Producción audiovisual determinista",
          genre: "Documental & Ficción Cinematográfica",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProjects((prev) => [...prev, data.project]);
        setSelectedProjectId(data.project.id);
        fetchProjectDetails(data.project.id);
        setShowCreateModal(false);
        setNewTitle("");
        setNewPremise("");
      }
    } catch (e) {
      console.error("Error creating project", e);
    }
  };

  const filteredShotCards =
    selectedShotCardCategory === "all"
      ? shotCards
      : shotCards.filter((c) => c.category === selectedShotCardCategory);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 font-sans text-foreground">
      {/* HEADER BAR */}
      <div className="flex flex-col gap-4 rounded-3xl border border-electric/30 bg-background/60 p-6 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Video className="size-6 text-electric animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Isabella-Engine-Video X
            </h1>
            <span className="rounded-full border border-electric/40 bg-electric/10 px-2.5 py-0.5 font-mono text-[10px] uppercase text-electric">
              Deterministic V2.1
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Sistema operativo audiovisual verificable, determinista y gobernado por contratos
            formales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Project selector */}
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              fetchProjectDetails(e.target.value);
            }}
            className="rounded-xl border border-border/40 bg-background/80 px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-electric"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.version})
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-electric/40 bg-electric/10 px-3 py-1.5 text-xs font-semibold text-electric transition-colors hover:bg-electric/20"
          >
            <Sparkles className="size-3.5" />
            Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* PROJECT METRICS & LIFECYCLE BAR */}
      {project && (
        <div className="space-y-4 rounded-3xl border border-border/20 bg-background/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/15 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">{project.title}</h2>
                <span className="rounded-md border border-crown/40 bg-crown/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-crown">
                  {project.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{project.brief.premise}</p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 rounded-lg border border-border/20 bg-background/60 px-3 py-1.5">
                <Cpu className="size-3.5 text-electric" />
                <span className="text-muted-foreground">GPU:</span>
                <span className="font-bold text-foreground">
                  {project.budget.spentGpuSeconds}s / {project.budget.maxGpuSeconds}s
                </span>
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-border/20 bg-background/60 px-3 py-1.5">
                <Zap className="size-3.5 text-emerald-400" />
                <span className="text-muted-foreground">Coste:</span>
                <span className="font-bold text-foreground">
                  ${project.budget.spentCostUsd.toFixed(2)} USD
                </span>
              </div>

              <button
                onClick={handleAdvanceState}
                className="flex items-center gap-1.5 rounded-xl border border-electric/40 bg-electric px-3 py-1.5 text-xs font-medium text-black transition-transform hover:scale-105 active:scale-95"
              >
                <Play className="size-3.5 fill-current" />
                Avanzar Estado
              </button>
            </div>
          </div>

          {/* STATE MACHINE STEPPER */}
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-[900px] items-center gap-1">
              {PROJECT_STATUS_FLOW.map((statusItem, idx) => {
                const currentIdx = PROJECT_STATUS_FLOW.indexOf(project.status);
                const isCompleted = idx < currentIdx;
                const isCurrent = idx === currentIdx;

                return (
                  <div key={statusItem} className="flex-1 flex items-center gap-1">
                    <div
                      className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition-all text-[10px] font-mono ${
                        isCurrent
                          ? "border-electric bg-electric/20 text-electric font-bold shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                          : isCompleted
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-border/20 bg-background/20 text-muted-foreground/60"
                      }`}
                    >
                      <span>{statusItem.replace(/_/g, " ")}</span>
                    </div>
                    {idx < PROJECT_STATUS_FLOW.length - 1 && (
                      <div
                        className={`h-0.5 w-2 shrink-0 ${
                          idx < currentIdx ? "bg-emerald-500/40" : "bg-border/20"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TABS NAVIGATION */}
      <div className="flex border-b border-border/20 overflow-x-auto gap-2">
        {[
          { id: "graph", label: "Narrative Graph", icon: GitBranch },
          { id: "timeline", label: "Temporal Media Core (ITSG)", icon: Film },
          { id: "shotcards", label: "Shot Cards X Library", icon: Sliders },
          { id: "fabric", label: "Execution Fabric & Router", icon: Cpu },
          { id: "qa", label: "Multimodal QA & Remediation", icon: ShieldCheck },
          { id: "c2pa", label: "C2PA Provenance & Master", icon: FileCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "border-electric text-electric bg-electric/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENTS */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-border/20 bg-background/40">
          <RefreshCw className="size-6 animate-spin text-electric" />
        </div>
      ) : (
        <>
          {/* TAB 1: NARRATIVE GRAPH */}
          {activeTab === "graph" && graph && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-4 rounded-3xl border border-border/20 bg-background/40 p-5">
                <div className="flex items-center justify-between border-b border-border/15 pb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <GitBranch className="size-4 text-electric" />
                    Grafo Narrativo de Entidades y Relaciones
                  </h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {graph.nodes.length} Nodos • {graph.edges.length} Relaciones
                  </span>
                </div>

                {/* Nodes List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {graph.nodes.map((node) => (
                    <div
                      key={node.id}
                      className="group flex flex-col justify-between rounded-2xl border border-border/30 bg-background/60 p-4 transition-all hover:border-electric/50"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-electric bg-electric/10 border border-electric/20 px-2 py-0.5 rounded-full">
                            {node.type}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {node.id}
                          </span>
                        </div>
                        <h4 className="mt-2 text-xs font-semibold text-foreground">
                          {String(node.properties.name || node.properties.action || node.id)}
                        </h4>
                        <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
                          {Object.entries(node.properties).map(([k, v]) => (
                            <div key={k} className="truncate">
                              <span className="text-foreground/70">{k}:</span> {String(v)}
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => handleMutateNode(node.id)}
                        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-border/30 bg-background/80 py-1.5 text-[11px] font-medium text-foreground hover:bg-electric/10 hover:text-electric transition-colors"
                      >
                        <Sliders className="size-3" />
                        Simular Modificación
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Impact Engine Panel */}
              <div className="space-y-4 rounded-3xl border border-border/20 bg-background/40 p-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border/15 pb-3">
                  <Activity className="size-4 text-crown" />
                  Motor de Impacto Narrativo
                </h3>

                {impactAnalysis ? (
                  <div className="space-y-4 font-mono text-xs">
                    <div className="rounded-xl border border-crown/30 bg-crown/10 p-3">
                      <div className="text-[10px] uppercase text-crown font-bold">
                        Nodo Modificado
                      </div>
                      <div className="font-bold text-foreground mt-0.5">
                        {impactAnalysis.modifiedNodeId}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-muted-foreground">Tomas Afectadas:</div>
                      <div className="flex flex-wrap gap-1">
                        {impactAnalysis.affectedShots.length > 0 ? (
                          impactAnalysis.affectedShots.map((s) => (
                            <span
                              key={s}
                              className="rounded-md bg-electric/20 text-electric px-2 py-0.5 text-[10px]"
                            >
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground/60">Ninguna toma directa</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-muted-foreground">Workers Requeridos:</div>
                      <div className="flex flex-wrap gap-1">
                        {impactAnalysis.requiredWorkers.map((w) => (
                          <span
                            key={w}
                            className="rounded-md bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px]"
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/15">
                      <div>
                        <span className="text-muted-foreground text-[10px]">GPU Est.:</span>
                        <div className="font-bold text-foreground">
                          {impactAnalysis.estimatedGpuSeconds}s
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px]">Coste Est.:</span>
                        <div className="font-bold text-emerald-400">
                          ${impactAnalysis.estimatedCostUsd} USD
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-muted-foreground font-mono">
                    Haz clic en "Simular Modificación" en cualquier nodo del grafo para calcular su
                    impacto en la producción.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TEMPORAL MEDIA CORE (ITSG) */}
          {activeTab === "timeline" && timeline && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-border/20 bg-background/40 p-5">
                <div className="flex flex-wrap items-center justify-between border-b border-border/15 pb-4 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Film className="size-4 text-electric" />
                      Especificación de Timeline Racional (ITSG v1.0)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Timebase: {timeline.timebase.fps} fps • Audio:{" "}
                      {timeline.timebase.audioSampleRate} Hz
                    </p>
                  </div>
                </div>

                {/* Shot Timeline Cards */}
                <div className="mt-4 space-y-4">
                  {timeline.shots.map((shot) => (
                    <div
                      key={shot.id}
                      className="rounded-2xl border border-border/30 bg-background/60 p-4 font-mono text-xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between border-b border-border/15 pb-2 gap-2">
                        <div className="flex items-center gap-3">
                          <span className="rounded-lg bg-electric/20 px-2.5 py-1 text-electric font-bold text-xs">
                            {shot.id}
                          </span>
                          <span className="text-foreground font-semibold">{shot.purpose}</span>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>IN: {shot.in}</span>
                          <span>OUT: {shot.out}</span>
                          <span className="text-foreground">({shot.durationFrames} frames)</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 text-[11px]">
                        <div>
                          <div className="text-muted-foreground font-semibold mb-1">Cámara:</div>
                          <div>
                            Tamaño: {shot.camera.shotSize} ({shot.camera.lensMm}mm)
                          </div>
                          <div>Movimiento: {shot.camera.movement}</div>
                          <div>Ángulo: {shot.camera.angle}</div>
                        </div>

                        <div>
                          <div className="text-muted-foreground font-semibold mb-1">
                            Generación:
                          </div>
                          <div>Modo: {shot.generation.mode}</div>
                          <div>Semilla: {shot.generation.seed}</div>
                          <div>ControlNet: {shot.generation.controlnet.join(", ")}</div>
                        </div>

                        <div>
                          <div className="text-muted-foreground font-semibold mb-1">
                            Audio & Diálogo:
                          </div>
                          <div className="text-emerald-400">
                            {shot.audio.dialogue || "Sin diálogo"}
                          </div>
                          <div>Ambiente: {shot.audio.ambience}</div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => handleRegenerateShot(shot.id)}
                          className="flex items-center gap-1.5 rounded-xl border border-electric/40 bg-electric/10 px-3 py-1.5 text-xs font-semibold text-electric hover:bg-electric/20 transition-colors"
                        >
                          <RefreshCw className="size-3.5" />
                          Re-ejecutar Toma (DAG Parcial)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SHOT CARDS X */}
          {activeTab === "shotcards" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {["all", "discovery", "character_reveal", "tension"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedShotCardCategory(cat)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-mono transition-colors uppercase ${
                      selectedShotCardCategory === cat
                        ? "border-electric bg-electric/20 text-electric font-bold"
                        : "border-border/20 bg-background/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat.replace("_", " ")}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredShotCards.map((card) => (
                  <div
                    key={card.id}
                    className="flex flex-col justify-between rounded-3xl border border-border/20 bg-background/40 p-5 space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-crown uppercase tracking-wider bg-crown/10 border border-crown/20 px-2 py-0.5 rounded-full">
                          {card.category}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {card.id}
                        </span>
                      </div>
                      <h4 className="mt-2 text-sm font-bold text-foreground">{card.name}</h4>
                      <p className="mt-2 font-mono text-xs text-muted-foreground italic bg-background/60 p-2.5 rounded-xl border border-border/15">
                        "{card.generationPrompt}"
                      </p>
                    </div>

                    <div className="space-y-2 font-mono text-[11px] border-t border-border/15 pt-3">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Lente: {card.cameraModel.lensMm}mm</span>
                        <span>Plano: {card.cameraModel.shotSize}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Movimiento: {card.cameraModel.movement}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: EXECUTION FABRIC */}
          {activeTab === "fabric" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4 rounded-3xl border border-border/20 bg-background/40 p-5 font-mono text-xs">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border/15 pb-3">
                  <Cpu className="size-4 text-electric" />
                  Model Router inteligente
                </h3>

                <div className="p-4 rounded-2xl border border-electric/30 bg-electric/10 space-y-3">
                  <div className="flex justify-between font-bold text-foreground text-sm">
                    <span>Proveedor Seleccionado:</span>
                    <span className="text-electric">ComfyUI Local GPU Worker</span>
                  </div>
                  <div>Latencia Estimada: 12,000 ms</div>
                  <div>Coste Estimado: $0.05 USD / generación</div>
                  <div className="text-emerald-400">
                    Gobernanza & Privacidad: Zero Trust Guard Verificado
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-3xl border border-border/20 bg-background/40 p-5 font-mono text-xs">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border/15 pb-3">
                  <Activity className="size-4 text-emerald-400" />
                  Estado de Workers en Colas
                </h3>

                <div className="space-y-2">
                  {[
                    { name: "VideoWorker_ComfyUI", status: "ONLINE", vram: "18.4 / 24.0 GB" },
                    { name: "AudioWorker_TTS_Dubbing", status: "ONLINE", vram: "4.2 / 8.0 GB" },
                    { name: "MattingWorker_RVM", status: "IDLE", vram: "1.1 / 8.0 GB" },
                    { name: "MultimodalQAWorker", status: "ACTIVE", vram: "6.5 / 16.0 GB" },
                  ].map((w) => (
                    <div
                      key={w.name}
                      className="flex items-center justify-between p-3 rounded-xl border border-border/20 bg-background/60"
                    >
                      <span className="font-semibold text-foreground">{w.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{w.vram}</span>
                        <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px] font-bold">
                          {w.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MULTIMODAL QA */}
          {activeTab === "qa" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-semibold text-foreground">
                  Reporte de Evaluación de Calidad Multimodal
                </h3>
                <button
                  onClick={handleRunQA}
                  className="flex items-center gap-2 rounded-xl border border-electric/40 bg-electric px-4 py-2 text-xs font-semibold text-black"
                >
                  <RefreshCw className="size-3.5" />
                  Ejecutar Test QA Multimodal
                </button>
              </div>

              {qaReport && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
                  <div className="space-y-3 rounded-3xl border border-border/20 bg-background/40 p-5">
                    <h4 className="text-sm font-bold text-foreground">Score Radar</h4>
                    {[
                      { label: "Técnico (Codecs/Resolution)", score: qaReport.technical },
                      { label: "Estética Visual & Composición", score: qaReport.visual },
                      { label: "Consistencia de Identidad", score: qaReport.identity },
                      { label: "Estabilidad Temporal", score: qaReport.temporal },
                      { label: "Sincronía de Audio", score: qaReport.audio },
                      { label: "OCR & Control de Texto", score: qaReport.text },
                      { label: "Coherencia Narrativa", score: qaReport.narrative },
                      { label: "Seguridad & Contenido", score: qaReport.safety },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-muted-foreground text-[11px]">
                          <span>{item.label}</span>
                          <span className="font-bold text-foreground">
                            {(item.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-border/20 overflow-hidden">
                          <div
                            className="h-full bg-electric rounded-full transition-all"
                            style={{ width: `${item.score * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4 rounded-3xl border border-border/20 bg-background/40 p-5">
                    <div className="flex items-center justify-between border-b border-border/15 pb-3">
                      <span className="text-sm font-bold text-foreground">
                        Decisión de Evaluación
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full font-bold uppercase text-xs ${
                          qaReport.decision === "pass"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {qaReport.decision}
                      </span>
                    </div>

                    {qaReport.remediationPlan ? (
                      <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="flex items-center gap-2 text-amber-400 font-bold">
                          <AlertTriangle className="size-4" />
                          Plan de Remediación Sugerido
                        </div>
                        <div>Fallo Detectado: {qaReport.remediationPlan.failure}</div>
                        <div>
                          Acción Recomendada:{" "}
                          <span className="font-bold text-foreground uppercase">
                            {qaReport.remediationPlan.action}
                          </span>
                        </div>
                        <div>Coste Estimado: ${qaReport.remediationPlan.estimatedCost.usd} USD</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                        <CheckCircle2 className="size-5" />
                        Todas las pruebas multimediales han sido aprobadas satisfactoriamente.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: C2PA PROVENANCE */}
          {activeTab === "c2pa" && (
            <div className="space-y-6 font-mono text-xs">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-semibold text-foreground">
                  Firma Digital & Proveniencia C2PA Standard
                </h3>
                <button
                  onClick={handleExportC2PA}
                  className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                >
                  <Lock className="size-3.5" />
                  Exportar y Firmar C2PA Manifest
                </button>
              </div>

              {c2paManifest ? (
                <div className="rounded-3xl border border-emerald-500/30 bg-background/40 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-border/15 pb-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">{c2paManifest.title}</div>
                      <div className="text-muted-foreground text-[11px]">
                        {c2paManifest.manifestId}
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                      FIRMADO C2PA
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-muted-foreground font-bold">Firma Criptográfica:</div>
                    <div className="p-3 rounded-xl bg-background/80 border border-border/20 text-electric break-all text-[11px]">
                      {c2paManifest.signature}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                      <div className="text-muted-foreground font-bold mb-1">
                        Hashes de Assets Entrantes:
                      </div>
                      {c2paManifest.inputs.map((i) => (
                        <div
                          key={i.assetId}
                          className="p-2 rounded-lg bg-background/60 border border-border/15 mb-1 text-[10px]"
                        >
                          <div>
                            Asset: {i.assetId} ({i.role})
                          </div>
                          <div className="text-muted-foreground truncate">{i.sha256}</div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="text-muted-foreground font-bold mb-1">
                        Determinismo de Render:
                      </div>
                      <div className="p-2.5 rounded-lg bg-background/60 border border-border/15 text-[10px] space-y-1">
                        <div>Seed: {c2paManifest.determinism.seed}</div>
                        <div className="truncate">
                          Workflow Digest: {c2paManifest.determinism.workflowHash}
                        </div>
                        <div className="truncate">
                          Container Digest: {c2paManifest.determinism.containerDigest}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground rounded-3xl border border-border/20 bg-background/40">
                  Aún no se ha generado un manifiesto C2PA. Haz clic en "Exportar y Firmar C2PA
                  Manifest".
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CREATE PROJECT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-electric/40 bg-background/95 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-foreground">Crear Nuevo Proyecto Video X</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground">
                  Título del Proyecto
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ej: Isabella en las Minas de Real del Monte"
                  className="mt-1 w-full rounded-xl border border-border/40 bg-background/80 p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-electric"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground">Premisa Creativa</label>
                <textarea
                  value={newPremise}
                  onChange={(e) => setNewPremise(e.target.value)}
                  placeholder="Premisa narrativa..."
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-border/40 bg-background/80 p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-electric"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-border/40 px-4 py-2 text-xs font-mono text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateProject}
                className="rounded-xl bg-electric px-4 py-2 text-xs font-mono font-bold text-black hover:bg-electric/90"
              >
                Crear Proyecto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
