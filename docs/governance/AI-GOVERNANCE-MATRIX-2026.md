# Isabella AI Genesis — AI Governance Matrix 2026

## Purpose

This document converts internationally recognized AI-risk and security guidance into engineering controls for Isabella AI Genesis. It is an **engineering alignment artifact**, not a legal certification, conformity assessment, or claim of compliance in every jurisdiction.

## Reference frameworks

- **EU AI Act:** transparency, human oversight, logging/traceability, robustness and cybersecurity requirements are treated as design targets where applicable. The European Commission states that Article 50 transparency obligations apply from 2 August 2026. See the official AI Act materials.
- **NIST AI RMF 1.0:** Govern, Map, Measure, Manage are treated as the lifecycle structure for risk management.
- **ISO/IEC 42001:2023:** AI management-system principles are treated as organizational governance targets.
- **OWASP Top 10 for LLM Applications 2025:** prompt injection, sensitive-information disclosure, supply chain, data/model poisoning, improper output handling, excessive agency, prompt leakage, vector/embedding weaknesses, misinformation and unbounded consumption are treated as security test families.
- **OWASP Top 10:2025:** access control, misconfiguration, supply chain, cryptography, injection, insecure design, authentication, integrity, logging/alerting and exceptional-condition handling are treated as application-security test families.

## Control matrix

| Domain | Engineering control | Isabella implementation | Evidence gate |
|---|---|---|---|
| Human oversight | Consequential decisions remain human-authorized | Governance profile + policy gateway | Unit test + runtime review |
| Transparency | User is informed that Isabella is an AI system | Public governance profile | `/api/ai/transparency` |
| Traceability | Requests and governed actions correlate to audit evidence | CROWN/audit/telemetry surfaces | Integration evidence |
| Safety | Critical configuration failures fail closed | Production config + repository factory | Production preflight |
| Security | Prompt injection and abuse are policy-gated | AEGIS/CROWN + sanitization | Security test corpus |
| Authentication | Production guest bypass is forbidden | PrincipalContext + config gate | Auth tests |
| Data protection | Secrets excluded from public governance artifacts | Static profile + secret scanning | Secret scan |
| Model/provider transparency | Runtime provider is not fabricated | Provider registry/runtime detection | Runtime evidence |
| Evaluation | AI risk is measured before and during operation | NCUA/evaluation/telemetry architecture | TEVV evidence |
| Resilience | Kill switches and controlled failure paths exist | Runtime kill-switch contracts | Chaos/failure tests |
| Supply chain | Frozen lockfile and integrity gates | pnpm frozen install + integrity scripts | CI/preflight |
| Observability | Synthetic infrastructure telemetry prohibited | Production integrity gate | Integrity test |
| Governance | Policies are versioned and machine-readable | `src/lib/ai-governance.ts` | Unit test |

## 90% functional gate

The 90% target is reached only when all of the following are true:

1. Static typecheck, lint, unit and integration suites pass.
2. Production build succeeds from the frozen lockfile.
3. `/api/health/live`, `/api/health/ready`, and `/api/health/deep` pass in the target environment.
4. Authenticated Isabella chat reaches the canonical gateway and returns a real streamed response.
5. AEGIS/CROWN deny, allow and escalation paths are tested with a false-positive corpus.
6. Durable PostgreSQL persistence and memory read/write are verified against the production database.
7. API-key issuance, scope enforcement, expiry, revocation and rotation are verified.
8. Provider selection and failover are verified without synthetic provider claims.
9. Audit/trace identifiers are present and correlate a request through governance and inference.
10. The public AI transparency contract is reachable and contains no secrets.
11. Backup/restore and rollback procedures have executable evidence.
12. Vercel production deployment reaches `READY` and browser smoke tests pass.

## Non-negotiable principle

Do not convert an engineering control into a certification claim. Evidence must come from executable tests, runtime observations, configuration, logs, migration state, and independent review.

The system should be designed so that when evidence is missing, the status is **unknown**, not **passed**.
