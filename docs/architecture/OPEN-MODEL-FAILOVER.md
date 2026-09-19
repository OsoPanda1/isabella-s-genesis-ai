# Open-model failover and safety boundary

## Objective

Isabella remains model-agnostic. Gemini remains the configured primary when available; local/open-weight models are optional fallback providers and are never trusted merely because they are open-weight, reachable, or free to run locally.

## Implemented providers

- `google-gemini` — existing primary provider.
- `ollama-local` — local Ollama runtime, no paid API required.
- `openai-compatible-local` — self-hosted vLLM/llama.cpp/LM Studio or equivalent OpenAI-compatible endpoint.

Both local providers are disabled unless explicitly enabled and remain subject to the same production model-approval gate as Gemini.

## Recommended open-weight candidates

The project may evaluate, but must not automatically approve:

| Model family | License | Typical local route | Status in Isabella |
|---|---|---|---|
| Qwen3 4B / 8B / 30B-A3B / 32B | Apache 2.0 | Ollama / vLLM / Transformers | EVALUATE |
| OpenAI gpt-oss-20b / 120b | Apache 2.0 | Ollama / vLLM / Transformers | EVALUATE |
| Mistral Small 4 | Apache 2.0 | compatible local runtimes | EVALUATE |
| Ministral 3 3B / 8B / 14B | Apache 2.0 | compatible local runtimes | EVALUATE |

License openness is not a safety certification. Every model must pass Isabella's own evaluation harness, prompt-injection tests, tool-use tests, data-leakage tests, regression tests, and governance approval before production authorization.

## Required environment variables

```text
OLLAMA_ENABLED=false
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b

OPENAI_COMPATIBLE_LOCAL_ENABLED=false
OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:8000/v1
OPENAI_COMPATIBLE_MODEL=Qwen/Qwen3-8B
OPENAI_COMPATIBLE_API_KEY=
```

Do not expose local provider endpoints to the public Internet without an authenticated, encrypted, network-policy-controlled boundary.

## Failover rules

1. Preferred model is attempted first.
2. A provider must be healthy.
3. In production, the durable model authority must approve the exact model/provider identity.
4. A failed provider is skipped; Isabella does not silently elevate an unapproved provider.
5. If no approved provider is healthy, inference fails closed.
6. Local providers report `degraded=true` so observability can distinguish primary from fallback inference.

## Security boundary

All inference requests pass through the inference firewall before provider dispatch. The firewall removes ASCII control characters, enforces message/request size bounds, and rejects a small set of high-confidence prompt-injection markers. This is a first barrier, not a claim of complete prompt-injection prevention.

Tool execution, secrets, filesystem access, network access, memory writes, billing, ledger mutation, and governance state remain outside model authority. A model response is data, not authorization.
