# Production Hardening — Execution Roadmap

## P0 — antes de producción real

- Consolidar una única autoridad de persistencia y retirar rutas legacy de producción.
- Probar aislamiento multi-tenant con casos positivos y negativos.
- Completar auth/session/revocation y step-up MFA para operaciones sensibles.
- Mantener rate limiting distribuido fail-closed.
- Completar transacciones financieras, outbox e idempotencia y reconciliación.
- Completar CSP nonce real antes de declarar CLAIM-010 como satisfecho.
- Generar SBOM y provenance del artefacto.
- Ejecutar restore drill y validar RPO/RTO observados.
- Ejecutar DAST y pentest externo.
- Verificar deployment SHA == audited SHA == released SHA.

## P1 — robustez operacional

- Secure aggregation federada.
- Differential privacy.
- Poisoning/anomaly detection.
- Replay protection durable multi-instancia.
- Model drift/fairness/contamination evaluation.
- Key rotation drills.
- Incident response drills.
- License inventory automatizado y revisión jurídica de excepciones.

## P2 — evolución FGAIS

- Model consensus/arbitration.
- Specialized Genesis models.
- Distillation.
- Continued pretraining.
- Foundation-model R&D con infraestructura GPU reproducible.

## Regla

Una mejora no se considera cerrada por existir el archivo o la función. Debe tener implementación, prueba, evidencia y, para claims críticos, verificación independiente cuando la política lo exige.
