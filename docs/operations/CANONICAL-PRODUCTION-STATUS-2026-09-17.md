# Isabella AI Genesis — Estado Canónico de Producción

**Fecha de corte:** 2026-09-17  
**Repositorio:** `OsoPanda1/isabella-ai-genesis`  
**Versión de aplicación:** `4.3.3`

## 1. Regla de autoridad

Este documento define el estado operativo verificable del sistema. Los porcentajes históricos o declaraciones de certificación presentes en documentación anterior no sustituyen evidencia de ejecución.

Un estado **READY** de Vercel demuestra que el artefacto de despliegue fue construido y publicado; no demuestra por sí mismo que PostgreSQL, autenticación, proveedores de inferencia, BookPI, memoria, AEGIS/CROWN y flujos de extremo a extremo estén correctamente configurados.

## 2. Estado actual

| Control | Estado canónico |
|---|---|
| Código fuente en `main` | Implementado |
| TanStack Start + Nitro para Vercel | Configurado |
| Node runtime | 24.x configurado |
| Instalación CI | `pnpm --frozen-lockfile` en el gate de CI |
| Instalación Vercel | `pnpm --no-frozen-lockfile` para sincronizar el lockfile existente |
| CROWN / gateway soberano | Implementado; requiere evidencia E2E |
| AEGIS / `/api/security` | Implementado; requiere corpus adversarial E2E |
| Auth producción | Backend endurecido; bootstrap E2E requiere verificación |
| PostgreSQL/Neon | Arquitectura implementada; conexión y migraciones requieren verificación runtime |
| BookPI | Implementado; integridad E2E requiere verificación runtime |
| Gobernanza IA | Perfil y endpoint de transparencia implementados |
| Telemetría sintética | Prohibida en producción |
| Backup/restore | Implementación disponible; evidencia operativa requiere ejecución |
| Vercel producción | Requiere confirmación del deployment más reciente como `READY` |

## 3. Criterio para declarar 80%

El índice operativo de 80% solo se puede declarar cuando exista evidencia de todos los P0 siguientes:

1. `typecheck`, `lint` y tests pasan.
2. Build de producción completa.
3. Deployment Vercel `READY`.
4. Health/ready/deep responde correctamente.
5. Auth de producción obtiene una sesión válida.
6. `/api/isabella` alcanza el gateway canónico y entrega stream real.
7. CROWN y AEGIS tienen casos allow/deny/challenge y falsos positivos medidos.
8. PostgreSQL persiste y recupera datos de tenant real.
9. BookPI mantiene integridad de ledger bajo escritura/lectura.
10. API keys soportan emisión, scopes, expiración, revocación y rotación.
11. Provider routing usa únicamente proveedores autorizados y no fabrica disponibilidad.
12. Audit/trace IDs correlacionan una petición completa.
13. Endpoint `/api/ai/transparency` responde el perfil canónico.
14. Existe evidencia de backup/restore y rollback.
15. Smoke test de navegador verifica carga, consola y flujo principal.

**Regla:** ausencia de evidencia = `UNKNOWN`, nunca `PASS`.

## 4. Sobre certificación

Este repositorio documenta controles de ingeniería y alineación técnica. No debe presentarse como certificado legal, conformidad regulatoria, certificación de seguridad, certificación ISO, conformidad con el AI Act ni garantía de producción mientras los controles de evidencia anteriores no estén ejecutados y archivados.

## 5. Evidencia de despliegue

Los deployments deben registrarse por:

- commit SHA;
- estado (`BUILDING`, `ERROR`, `READY`);
- target (`production`/`preview`);
- fecha/hora;
- build/runtime evidence;
- smoke test;
- resultado de health checks;
- evidencia E2E de los subsistemas críticos.

## 6. Política de no-regresión

Ningún cambio de UI, documentación, configuración o integración puede convertir datos simulados, valores por defecto o resultados locales en evidencia de producción.

Los dashboards financieros y de seguridad deben mostrar únicamente estado proveniente del servidor cuando representen actividad real. Los escenarios de simulación deben estar explícitamente etiquetados como simulación.
