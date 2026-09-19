# FGAIS Production Go-Live Gate

**Estado:** Executable gate / not a production certificate
**Fecha:** 2026-09-08
**Principio:** Capability does not imply authority.

## 1. Regla absoluta

El repositorio no puede declarar `Production-Verified` por documentación, build local o existencia de código. Esa etiqueta requiere evidencia reproducible del despliegue real y de un smoke test contra el entorno productivo.

## 2. Gates automáticos

El pipeline `FGAIS Production Gate` debe ejecutar, en este orden:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`
5. `pnpm build`
6. `pnpm production:integrity`
7. `pnpm production:preflight`
8. `pnpm capabilities`
9. `pnpm audit:routes`
10. `node scripts/sanitize-repo.mjs`

Un fallo bloquea la promoción.

## 3. Variables de producción

La configuración de producción debe declarar las variables críticas exigidas por `ENV_VAR_CATALOG`, incluyendo autoridad durable, autenticación, cifrado, CROWN, AEGIS, BookPI, proveedor Gemini y servicios financieros cuando esas capacidades estén habilitadas.

Nunca colocar secretos en `VITE_*`.

`ALLOW_GUEST_CHAT=true` es compatible con producción únicamente porque el canal guest está limitado a inferencia conversacional gobernada: sin memoria durable, tools, mutaciones, administración de tenants, elevación de scopes o acciones críticas. Puede desactivarse operativamente.

## 4. Persistencia

- PostgreSQL/Neon: autoridad durable de producción.
- Redis/Upstash: estado derivado, rate limiting y caché cuando esté configurado.
- JSON/memoria/SQLite: nunca sustituyen silenciosamente la autoridad durable requerida por producción.
- Readiness debe fallar cerrado cuando una dependencia durable requerida no está disponible.

## 5. Smoke test real obligatorio

Después de un deployment exitoso, el operador debe conservar evidencia de:

- `GET /api/health` → liveness 200.
- `GET /api/health/ready` → readiness compatible con el estado de infraestructura esperado.
- `POST /api/isabella` con un prompt inocuo → HTTP 200 y stream SSE válido.
- El stream contiene provenance de provider/model/trace sin secretos.
- Un request inválido → envelope JSON estándar y HTTP 400.
- Rate limit degradado → inferencia bloqueada, nunca fallback silencioso.
- Kill switch activo → inferencia bloqueada.
- Falta de `GEMINI_API_KEY` → 503, nunca respuesta simulada.
- Guest chat, si está habilitado → no puede mutar tenant, memoria, tools ni scopes.

## 6. Evidencia mínima de certificación

Registrar para cada release:

```text
commit_sha
build_run_id
deployment_id
production_url
health_evidence
readiness_evidence
inference_smoke_evidence
security_gate_evidence
rollback_reference
operator
utc_timestamp
```

No se deben guardar secretos ni prompts sensibles en el registro de certificación.

## 7. Rollback

Toda promoción debe tener un deployment anterior identificable y una ruta de rollback conocida antes de marcar la release como `Production-Verified`.

## 8. Estado actual

Este documento no certifica por sí mismo el deployment. A la fecha de escritura, la evidencia externa disponible para el último commit observado todavía muestra el check de Vercel como no exitoso; por tanto el estado correcto permanece **no Production-Verified** hasta obtener un deployment verde y smoke tests reales.
