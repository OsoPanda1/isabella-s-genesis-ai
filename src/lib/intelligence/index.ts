import { config } from "@/lib/config";
import { GeminiProvider } from "./gemini-provider";
import { OllamaProvider } from "./ollama-provider";
import { OpenAICompatibleLocalProvider } from "./openai-compatible-provider";
import { addProvider, invokeIntelligence, governIntelligence } from "./router";

let initialized = false;

export function initializeIntelligencePlane(): void {
  if (initialized) return;
  const runtime = config();
  const configured = runtime.LLM_DEFAULT_MODEL || "google/gemini-3.8-flash";
  const model = configured.split("/").at(-1) ?? "gemini-3.8-flash";

  // Registration is not authorization. Production approval must come from the durable governance registry.
  addProvider(new GeminiProvider(model), false);

  // Local/open-weight fallbacks are opt-in. They never become production-authorized merely by being reachable.
  if (runtime.OLLAMA_ENABLED) {
    addProvider(new OllamaProvider(), false);
  }
  if (runtime.OPENAI_COMPATIBLE_LOCAL_ENABLED) {
    addProvider(new OpenAICompatibleLocalProvider(), false);
  }
  initialized = true;
}

export { invokeIntelligence, governIntelligence };
export * from "./contracts";
export * from "./model-registry";
