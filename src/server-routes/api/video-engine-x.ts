import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { videoEngineXManager } from "@/lib/video-x/engine";
import { DEFAULT_SHOT_CARDS, routeModel } from "@/lib/video-x/contracts";
import type { InferenceRequest } from "@/lib/video-x/types";

const createProjectSchema = z.object({
  title: z.string().min(3),
  premise: z.string().min(5),
  genre: z.string().default("Documental & Ficción Cinematográfica"),
});

const advanceStatusSchema = z.object({
  projectId: z.string(),
});

const mutateNodeSchema = z.object({
  projectId: z.string(),
  nodeId: z.string(),
  properties: z.record(z.unknown()),
});

const regenerateShotSchema = z.object({
  projectId: z.string(),
  shotId: z.string(),
});

const runQASchema = z.object({
  projectId: z.string(),
});

const exportC2PASchema = z.object({
  projectId: z.string(),
});

export const Route = createFileRoute("/api/video-engine-x")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "projects";
        const projectId = url.searchParams.get("id") || "proj-isabella-mineral-01";

        if (action === "projects") {
          return new Response(
            JSON.stringify({
              success: true,
              projects: videoEngineXManager.getProjects(),
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        if (action === "project") {
          const project = videoEngineXManager.getProject(projectId);
          if (!project) {
            return new Response(
              JSON.stringify({ success: false, error: "Proyecto no encontrado" }),
              { status: 404, headers: { "Content-Type": "application/json" } },
            );
          }

          const graph = videoEngineXManager.getNarrativeGraph(project.narrativeGraphId);
          const timeline = videoEngineXManager.getTimeline(project.timelineId);
          const qaReport = videoEngineXManager.getQAReport(projectId);
          const c2paManifest = videoEngineXManager.getC2PAManifest(projectId);

          return new Response(
            JSON.stringify({
              success: true,
              project,
              narrativeGraph: graph,
              timeline,
              qaReport,
              c2paManifest,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        if (action === "shot-cards") {
          return new Response(
            JSON.stringify({
              success: true,
              shotCards: DEFAULT_SHOT_CARDS,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        if (action === "route-model") {
          const req: InferenceRequest = {
            task: (url.searchParams.get("task") as InferenceRequest["task"]) || "i2v",
            quality:
              (url.searchParams.get("quality") as InferenceRequest["quality"]) || "production",
            privacy: (url.searchParams.get("privacy") as InferenceRequest["privacy"]) || "public",
            latencyBudgetMs: 15000,
            costBudgetUsd: 0.5,
            requiredCapabilities: ["controlnet_depth", "facial_consistency"],
          };
          const routeResult = routeModel(req);
          return new Response(
            JSON.stringify({
              success: true,
              request: req,
              choice: routeResult,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(JSON.stringify({ success: false, error: "Acción no válida" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      },

      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const action = body?.action || "create-project";

          if (action === "create-project") {
            const parsed = createProjectSchema.parse(body);
            const project = videoEngineXManager.createProject(
              parsed.title,
              parsed.premise,
              parsed.genre,
            );
            return new Response(JSON.stringify({ success: true, project }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "advance-status") {
            const parsed = advanceStatusSchema.parse(body);
            const updated = videoEngineXManager.advanceProjectStatus(parsed.projectId);
            if (!updated) {
              return new Response(
                JSON.stringify({ success: false, error: "Fallo al avanzar estado del proyecto" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
            return new Response(JSON.stringify({ success: true, project: updated }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "mutate-node") {
            const parsed = mutateNodeSchema.parse(body);
            const impact = videoEngineXManager.mutateGraphNode(
              parsed.projectId,
              parsed.nodeId,
              parsed.properties,
            );
            return new Response(JSON.stringify({ success: true, impactAnalysis: impact }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "regenerate-shot") {
            const parsed = regenerateShotSchema.parse(body);
            const result = videoEngineXManager.regenerateShot(parsed.projectId, parsed.shotId);
            return new Response(JSON.stringify({ success: true, result }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "run-qa") {
            const parsed = runQASchema.parse(body);
            const report = videoEngineXManager.runMultimodalQA(parsed.projectId);
            return new Response(JSON.stringify({ success: true, qaReport: report }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "export-c2pa") {
            const parsed = exportC2PASchema.parse(body);
            const project = videoEngineXManager.getProject(parsed.projectId);
            if (!project) {
              return new Response(
                JSON.stringify({ success: false, error: "Proyecto no encontrado" }),
                { status: 404, headers: { "Content-Type": "application/json" } },
              );
            }
            // Advance to provenance signed if needed
            if (project.status !== "PROVENANCE_SIGNED" && project.status !== "PUBLISHED") {
              project.status = "PROVENANCE_SIGNED";
            }
            videoEngineXManager.advanceProjectStatus(project.id);
            const manifest = videoEngineXManager.getC2PAManifest(project.id);
            return new Response(JSON.stringify({ success: true, c2paManifest: manifest }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ success: false, error: "Acción desconocida" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
