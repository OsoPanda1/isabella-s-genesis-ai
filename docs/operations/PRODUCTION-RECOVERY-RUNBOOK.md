# Production Recovery Runbook

## Estado

Este runbook define el procedimiento operativo; no convierte una capacidad en evidencia hasta que se ejecuta y se adjunta el resultado firmado al bundle `release/`.

## Objetivos

- RPO: declarar por entorno antes de habilitar persistencia crítica.
- RTO: declarar por entorno y verificarlo con una restauración en staging.
- Toda recuperación debe producir `traceId`, `requestId`, operador, versión y evidencia de checksum.

## Procedimiento

1. Activar el kill switch de la capacidad afectada y registrar el evento de auditoría.
2. Identificar el último backup válido y verificar su checksum fuera del origen.
3. Ejecutar `pnpm db:restore` únicamente en el entorno de recuperación aprobado.
4. Ejecutar `pnpm db:verify` y comprobar migraciones, índices, tenant boundaries y ledger balance.
5. Revalidar health/readiness, autenticación, CROWN, rate limiting y conectores.
6. Ejecutar smoke tests de inferencia sin exponer secretos ni datos de tenant.
7. Reabrir tráfico gradualmente y registrar la decisión humana responsable.
8. Adjuntar `rollback.json`, `migration.json`, `deployment.json` y el informe del incidente.

## Condiciones de no-go

- Backup sin checksum o sin retención conocida.
- Restauración no ejecutada en staging.
- Readiness degradada.
- Ledger desbalanceado.
- Aislamiento multi-tenant no verificado.
- Conector revocado que aún pueda operar.
- Ausencia de evidencia de rollback.

La recuperación silenciosa, el fallback a memoria/JSON en producción y la continuidad después de un fallo crítico están prohibidos.
