# Isabella AI Genesis — Production Release Checklist

## P0 — bloqueo

- [ ] typecheck
- [ ] lint
- [ ] unit/integration/security/bookpi tests
- [ ] dependency/SCA scan
- [ ] secret scan
- [ ] SBOM generado
- [ ] artifact hash y provenance
- [ ] database migration review
- [ ] backup y restore probado
- [ ] tenant isolation probado
- [ ] auth/session/revocation probado
- [ ] rate limiting fail-closed en rutas críticas
- [ ] CSP sin `unsafe-inline` en el modo declarado como hardened
- [ ] production capability matrix consistente con implementación real
- [ ] todos los claims críticos tienen evidencia suficiente
- [ ] human approval para acciones L2-L4 según política
- [ ] financial flows con transacción durable/idempotencia/outbox/reconciliation
- [ ] Vercel deployment verificado sobre el mismo SHA auditado

## P1 — obligatorio antes de escalar

- [ ] DAST
- [ ] pentest externo
- [ ] restore drill periódico
- [ ] key rotation drill
- [ ] incident response drill
- [ ] observabilidad de negocio
- [ ] license compliance review
- [ ] accessibility audit
- [ ] privacy/jurisdiction review

## Regla de release

Un estado `GO` requiere evidencia de todos los P0 aplicables. `Designed`, `Partial` o `Planned` no cuentan como evidencia de una capacidad `Production-Verified`.
