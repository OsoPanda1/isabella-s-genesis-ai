# Isabella Cognitive Training Layer

## Purpose

The cognitive-training layer expands Isabella's learning beyond token accumulation or prompt retrieval. It converts experience into auditable signals for concepts, procedures, preferences, episodes, contrastive distinctions, counterfactual reasoning and self-reflection.

## Strategies

- **semantic** — grounds concepts and target meanings.
- **procedural** — extracts repeatable operational procedures.
- **contrastive** — learns desired vs. undesired alternatives.
- **counterfactual** — evaluates changed assumptions and alternative outcomes.
- **retrieval** — strengthens active recall of prior knowledge.
- **reflection** — creates self-critique and review signals.
- **preference** — records explicit preference signals.
- **multimodal** — associates non-text context with learned concepts.

## Safety model

Every strategy ultimately passes through `IsabellaLearningEngine`, preserving its validation, sanitization, prompt-injection filtering, consent requirements, bounded quality scores and SHA3-512 deduplication.

The layer does **not** claim to update foundation-model weights. It builds durable cognitive state that a provider can consume during inference.

## Training lifecycle

1. Normalize and sanitize the training sample.
2. Expand it into one or more strategy-specific learning signals.
3. Persist through the canonical learning engine.
4. Deduplicate identical signals by stable cryptographic signature.
5. Update concepts and skill competence.
6. Retrieve and evaluate learned understanding independently from the underlying model provider.
7. Snapshot the resulting state for audit and recovery.

## Production boundary

A successful learning operation is evidence that Isabella accepted and incorporated a durable cognitive signal. It is not evidence that an external LLM was fine-tuned. Provider-specific weight training, if introduced later, must have its own adapter, dataset lineage, training run identity, evaluation suite and reproducible artifact evidence.
