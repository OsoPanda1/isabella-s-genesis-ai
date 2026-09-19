# Isabella Learning Architecture

## Objective

Isabella must improve behavior and knowledge without reducing learning to token accumulation. The learning core therefore separates durable knowledge from model inference.

## Learning modes

1. **Supervised** — input → target → outcome. Used for explicit operator examples.
2. **Contrastive** — positive/negative examples. Used to distinguish preferred behavior from rejected behavior.
3. **Preference** — explicit human preferences with consent.
4. **Episodic** — successful or failed experiences retained with provenance and outcome.
5. **Procedural** — sequences and operational patterns extracted from demonstrations.
6. **Reflective** — post-task evaluation can reinforce or weaken competence without changing provider weights.
7. **Multimodal** — modality-aware context can be attached without requiring a text-only representation.

## Token-independent state

The learning core stores:

- concepts and stable signatures;
- procedures and ordered action fragments;
- preferences;
- episode outcomes;
- evidence source and provenance;
- reinforcement counts;
- skill competence scores.

The state is deliberately provider-neutral. It can be supplied to any inference provider through the native API layer.

## Safety boundaries

- Durable non-supervised learning requires explicit consent.
- Prompt-injection patterns are rejected before persistence.
- Inputs are sanitized for control characters and null bytes.
- Learning samples are deduplicated by a SHA3-512 content signature.
- Competence updates are bounded to `[0,1]`.
- Learning state is versioned so incompatible snapshots fail closed.
- The engine does not claim to modify model weights; weight training remains a separate provider-specific capability requiring independent evidence.

## Native API surface

`src/lib/isabella-learning-api.ts` exposes four native operations:

- `ingest(payload)`
- `retrieve({query, limit})`
- `evaluate({query})`
- `snapshot()`

These handlers are intentionally framework-neutral so they can be attached to the canonical API gateway without duplicating validation logic.

## Production rule

A learning record is not proof of intelligence improvement. Production claims must distinguish:

- knowledge acquisition;
- procedural competence;
- preference alignment;
- retrieval quality;
- task success;
- model-weight updates.

Only the last category constitutes model training in the conventional ML sense, and it requires a separately verifiable training pipeline and evaluation evidence.
