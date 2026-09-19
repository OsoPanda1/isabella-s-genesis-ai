import type {
  IntelligenceProvider,
  IntelligenceRequest,
  IntelligenceResponse,
  Modality,
} from "./contracts";

export interface HttpProviderOptions {
  providerId: string;
  modelId: string;
  endpoint: string;
  apiKey: string;
  modalities?: Modality[];
  timeoutMs?: number;
}

function assertHttps(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost")
    throw new Error("Intelligence upstream must use HTTPS");
}

export class OpenAICompatibleProvider implements IntelligenceProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilities: ReadonlySet<Modality>;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: HttpProviderOptions) {
    assertHttps(options.endpoint);
    if (!options.apiKey) throw new Error(`Missing credential for ${options.providerId}`);
    this.providerId = options.providerId;
    this.modelId = options.modelId;
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 8500;
    this.capabilities = new Set(options.modalities ?? ["text"]);
  }

  async health(): Promise<boolean> {
    return true;
  }

  async invoke(request: IntelligenceRequest): Promise<IntelligenceResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = performance.now();
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 2048,
        }),
      });
      if (!response.ok) throw new Error(`Upstream ${this.providerId} returned ${response.status}`);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = payload.choices?.[0]?.message?.content;
      if (!text) throw new Error(`Upstream ${this.providerId} returned no text`);
      return {
        requestId: request.requestId,
        modelId: this.modelId,
        providerId: this.providerId,
        text,
        latencyMs: performance.now() - started,
        degraded: false,
        risk: "LOW",
        usage: {
          inputTokens: payload.usage?.prompt_tokens,
          outputTokens: payload.usage?.completion_tokens,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
