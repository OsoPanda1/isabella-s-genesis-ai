# Isabella AI Genesis — Registro de riesgos operativos

| Riesgo | Nivel | Mitigación | Criterio de salida |
|---|---|---|---|
| proveedor IA indisponible | Alto | health + fallback gobernado | proveedor aprobado disponible |
| rate limiting indisponible | Crítico | fail-closed | autoridad distribuida operativa |
| estado durable indisponible | Crítico | fail-closed | DB healthy + verified |
| tenant isolation defectuosa | Crítico | deny-by-default + tests | suite de aislamiento aprobada |
| modelo no aprobado | Crítico | registry/release gate | aprobación vigente |
| recomendación de alto impacto | Alto | human review | aprobación registrada |
| pago duplicado | Crítico | idempotencia/outbox/reconciliation | pruebas de concurrencia + restore |
| secret leakage | Crítico | redaction + secret scan | scan limpio |
| dependencia vulnerable | Alto/Crítico | SCA + exception process | remediación o riesgo aprobado |
| licencia incompatible | Crítico | license gate | resolución documentada |
| evidencia insuficiente | Alto | GEAE/release gate | evidencia requerida completa |

Los niveles son controles operativos y no sustituyen una evaluación de riesgo específica del despliegue.
