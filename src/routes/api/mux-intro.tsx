import { createFileRoute } from "@tanstack/react-router";
import { loadConfig } from "@/lib/config";
import { SecuritySystem } from "@/lib/security";
import { ObservabilityService } from "@/lib/telemetry/observability";

interface IntroConfig {
  enabled: boolean;
  playbackId?: string;
  assetId?: string;
  metadata?: {
    title?: string;
    duration?: number;
    aspectRatio?: string;
  };
  fallback: {
    type: "static" | "procedural" | "none";
    url?: string;
  };
  cacheTtl: number;
}

const CACHE_TTL_SECONDS = 60;
const FALLBACK_URL = "/assets/isabella-intro-backdrop.png";
const INTRO_TITLE = "Isabella AI Genesis — Cinematic Introduction";
const PLAYBACK_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

function json(data: IntroConfig, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: SecuritySystem.injectSecureHeaders(
      new Headers({
        "content-type": "application/json; charset=utf-8",
        "cache-control": `private, max-age=${data.cacheTtl}, stale-while-revalidate=300`,
        "x-cache-status": "MISS",
      }),
    ),
  });
}

function fallbackConfig(type: IntroConfig["fallback"]["type"], assetId?: string): IntroConfig {
  return {
    enabled: type !== "none",
    assetId,
    metadata: { title: INTRO_TITLE, aspectRatio: "16:9" },
    fallback: { type, url: type === "static" ? FALLBACK_URL : undefined },
    cacheTtl: CACHE_TTL_SECONDS,
  };
}

function recordIntroRequest(startTime: number, result: "mux" | "fallback" | "disabled" | "error") {
  try {
    ObservabilityService.recordEvent(performance.now() - startTime, result === "error" ? 1 : 0);
  } catch {
    // Observability never changes the media response contract.
  }
}

function resolveIntroConfig(): IntroConfig {
  const cfg = loadConfig();
  const fallbackType = cfg.MUX_INTRO_FALLBACK_TYPE ?? "static";
  const playbackId = cfg.MUX_PLAYBACK_ID?.trim();
  const assetId = cfg.MUX_INTRO_ASSET_ID?.trim();

  // Runtime uses exactly one canonical media reference: the configured public
  // Mux playback ID. The asset ID is provenance metadata, never a second source
  // for selecting playback. Mux API management stays outside the request path.
  if (!playbackId || !PLAYBACK_ID_PATTERN.test(playbackId)) {
    return fallbackConfig(fallbackType, assetId);
  }
  if (assetId && !ASSET_ID_PATTERN.test(assetId)) {
    return fallbackConfig(fallbackType);
  }

  return {
    enabled: true,
    playbackId,
    assetId,
    metadata: {
      title: INTRO_TITLE,
      aspectRatio: "16:9",
    },
    fallback: {
      type: fallbackType,
      url: fallbackType === "static" ? FALLBACK_URL : undefined,
    },
    cacheTtl: CACHE_TTL_SECONDS,
  };
}

export const Route = createFileRoute("/api/mux-intro")({
  server: {
    handlers: {
      GET: async () => {
        const startTime = performance.now();
        try {
          const resolved = resolveIntroConfig();
          recordIntroRequest(
            startTime,
            resolved.playbackId ? "mux" : resolved.enabled ? "fallback" : "disabled",
          );
          return json(resolved);
        } catch {
          const cfg = loadConfig();
          const fallbackType = cfg.MUX_INTRO_FALLBACK_TYPE ?? "static";
          recordIntroRequest(startTime, "error");
          return json(fallbackConfig(fallbackType), 503);
        }
      },
    },
  },
});
