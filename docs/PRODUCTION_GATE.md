# 🛡️ C.R.O.W.N. PRODUCTION GATE

Este documento actúa como el **estado oficial de madurez y despliegue** del proyecto Isabella Villaseñor AI en su camino hacia la Producción, siguiendo los criterios de **Soberanía Humana, Zero Trust y Auditabilidad**.

> **NUNCA DEPLOYAR A PRODUCCIÓN HASTA QUE EL CHECKLIST FINAL ESTÉ AL 100%.**

---

## 📊 Tablero de Madurez Actual

| Nivel | Score Actual | Gate de Producción | Estado |
| :--- | :--- | :--- | :--- |
| **Arquitectura** | 82% | 90% | 🟡 |
| **Seguridad** | 78% | 95% | 🟡 |
| **Identidad** | 78% | 95% | 🟡 |
| **IA Segura** | 62% | 90% | 🔴 |
| **CROWN / AEGIS** | 75% | 95% | 🔴 |
| **BookPI** | 72% | 95% | 🔴 |
| **Pagos** | 60% | 100% | 🔴 |
| **Base de Datos** | 65% | 95% | 🔴 |
| **CI / CD** | 70% | 95% | 🔴 |
| **Supply Chain** | 65% | 95% | 🔴 |
| **Observabilidad** | 55% | 90% | 🔴 |
| **DR (Disaster Recovery)**| 50% | 95% | 🔴 |
| **Performance** | 55% | 90% | 🔴 |
| **Compliance Legal** | 50% | 90% | 🔴 |

---

## 🚨 Workstreams Activos (P0 / P1 Tickets)

A continuación, los 15 tickets secuenciales que rigen el pase a producción:

### Fase 1: Estabilización y Criptografía
- [x] **P0 — Fijar package manager + lockfile reproducible:** pnpm y node en versiones estrictas de producción, eliminando builds inestables (ej. nitro beta).
- [x] **P0 — Eliminar Nitro beta / fijar runtime:** Garantizar entorno de ejecución de Edge/Node determinista.
- [ ] **P0 — Production Secrets Manager + rotation:** Configurar KMS/Vault, eliminar hardcoded fallback keys, habilitar rotación (CROWN, AEGIS, BookPI, Stripe, Gemini).
- [ ] **P0 — Completar OIDC/JWKS + MFA + session revocation:** Revocación en caliente, rotación de sesiones y MFA resistente a phishing (Zero Trust Auth).

### Fase 2: Gobernanza Zero Trust & IA Segura
- [ ] **P0 — Formalizar CROWN authorization matrix:** Cierre total de endpoints, requiriendo `withSovereignAuth` en toda ruta y validación ABAC.
- [ ] **P0 — Formalizar AEGIS threat/risk matrix:** Listas de permitidos (allowlists), veto automático para payload anómalo, límites de array y validación de tipos estricta (Zod).
- [ ] **P0 — Server-authoritative AI policy:** Política inyectada desde el backend, cliente incapaz de modificar `tool authorization` o scopes.
- [ ] **P0 — Prompt injection + tool security suite:** Bypasses, guardrails contra indirect prompt injection, tool sanitization (ej. no URL requests arbitrarios).
- [ ] **P0 — BookPI tamper-evident audit:** Enlace criptográfico de logs (hash chains), ids inmutables, correlationIds, y exportación forense real.

### Fase 3: Infraestructura, Dinero y Desastre
- [ ] **P0 — Stripe financial ledger + concurrency verification:** Firmas en webhooks, atomic debits sin balances negativos, idempotencia, y reconciliación BookPI ↔ Stripe.
- [ ] **P0 — DB architecture consolidation:** Único primary DB definido (Supabase/Neon/Pg), RLS activo, disaster recovery, connection pooling configurado.
- [ ] **P0 — Production CI/CD gates + branch protection:** Pruebas requeridas, sin deploy manual a prod, aprobaciones de PR, DAST/SAST.
- [ ] **P0 — Disaster recovery + restore drill + incident response:** Ejercicios de RPO/RTO demostrables, restauración validada.
- [ ] **P1 — SBOM + signed artifacts + provenance:** Seguridad en supply chain y trazabilidad de artefactos.
- [ ] **P1 — OpenTelemetry + SLO + alerting:** Trazabilidad en peticiones a modelos de IA, logs estructurados por tenant y alarmas por anomalías (CROWN vetoes, Latency).

---

## 🏁 PRODUCTION GATE (100% REQUIRED)

[ ] 100% Auth
[ ] 100% Tenant isolation
[ ] 100% Payment invariants
[ ] 100% Secrets
[ ] 100% CROWN policy
[ ] 100% AEGIS critical actions
[ ] 100% BookPI integrity
[ ] 100% Backup/restore
[ ] 100% CI/CD security gates
[ ] 100% Production environment separation
[ ] 100% Critical security tests
[ ] 100% Incident response
[ ] 100% External pentest
