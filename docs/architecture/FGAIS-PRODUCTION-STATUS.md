# FGAIS Production Status

## Scope
This document is the implementation boundary for the Federated Governed Artificial Intelligence System (FGAIS) integration.

### Implemented in this wave
- Provider-neutral intelligence contracts.
- Governed model registry with explicit production approval.
- Gemini adapter behind the intelligence plane.
- `/api/intelligence` governed API surface.
- Durable PostgreSQL registries for datasets, models, training runs, evaluations and releases.
- Dataset provenance requirements.
- Deterministic native binary ML training capability.
- Evidence-backed model release gate.
- Federated update validation, hashing, replay guard and sample-weighted FedAvg.
- Repository sanitization scan and CI verification gate.
- Financial ledger audit no longer falls back to an in-memory repository.

## Explicit boundaries
- A model being registered does not authorize production use.
- Native ML is not a generative foundation model.
- Federated aggregation is not yet a production-grade secure-aggregation protocol; node replay state is process-local and must be moved to durable consensus/storage before federation is enabled across instances.
- No foundation-model training is claimed. GENESIS-4 remains an R&D objective requiring GPU infrastructure, licensed corpora, tokenizer/checkpoints, evaluation and release evidence.
- No scientific claim about consciousness, energy savings, bias elimination, sovereignty or ethical superiority is certified by implementation alone.
- Real-money production remains gated by the existing evidence-driven release gate until external operational validation is complete.

## Release rule
A production release must have reproducible evidence for mandatory claims, security, financial integrity, runtime, deployment and disaster recovery. Absence of evidence is a blocker; it is never converted into a positive status by convention.
