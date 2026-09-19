# ARGUS Defense Architecture

## Objective

ARGUS is a security orchestrator and therefore must not be a single point of security failure. The architecture uses defense in depth: the primary policy engine, constitutional gate, execution authority, audit integrity, kill switch, and the ARGUS shadow guard remain independently capable of denying unsafe execution.

## Security principle

ARGUS never becomes an authorization oracle that can grant authority by itself. It may preserve an allowed decision, escalate it, or veto it. A failure, timeout, malformed decision, integrity mismatch, or unavailable security dependency must degrade to denial for privileged actions.

## Shadow placement

The shadow guard is deliberately small, deterministic, dependency-light, and colocated with the security boundary. It should not depend on the external LLM provider, database round trips, telemetry availability, or a remote policy service for its hot-path veto.

The implementation is `src/lib/argus-shadow-guard.ts`.

## Fast path

For authenticated, integrity-verified, approval-bound, low-risk requests with a valid SHA-256 payload digest, the shadow evaluation is CPU-only and performs bounded arithmetic plus hashing. It makes no network call and does not invoke an LLM. This minimizes added latency while retaining an independent veto layer.

## Guarded path

Medium/high/critical risk, missing approval, identity failures, malformed digests, and integrity failures enter the guarded path. The shadow guard can return `REVIEW` or `DENY`; it never upgrades authority.

## Cryptographic binding

Every decision digest binds:

- tenant;
- actor;
- request;
- trace;
- action;
- payload digest;
- decision;
- risk level;
- reason codes.

Verification recomputes this digest and compares it in constant time. A decision copied from another request therefore cannot be replayed successfully.

## Failure assumptions

Security dependencies must be treated as mutually suspicious. If the primary policy layer fails open, the shadow layer can veto. If the shadow layer is unavailable, privileged execution must not infer permission from its absence. If audit is unavailable for an operation that requires durable audit evidence, the operation must fail closed according to the production policy.

## What this does not claim

This architecture does not make ARGUS mathematically unbreakable, nor does it hide security controls through obscurity. The source remains auditable. The objective is to make compromise of one security component insufficient to authorize unsafe execution.
