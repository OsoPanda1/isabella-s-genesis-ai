# ADR-008: Runtime Authority Reconciliation — Isabella v3.2

**Estado:** Accepted  
**Fecha:** 2026-09-08  
**Clasificación:** ARCHITECTURE / PRODUCTION CONSISTENCY  
**Principio constitucional:** Capability does not imply authority.

## 1. Propósito

Este ADR reconcilia la documentación histórica de Isabella con la implementación actualmente desplegable. Los ADR anteriores siguen siendo normativos cuando no contradicen este documento. Cuando exista conflicto entre documentación histórica y evidencia ejecutable actual, este ADR define la autoridad de runtime y exige corregir la documentación derivada.

## 2. Fuentes de verdad

La precedencia obligatoria es:

1. **Código ejecutable + pruebas reproducibles** — autoridad de comportamiento.
2. **Contratos Zod ejecutables (`src/lib/api-contracts.ts`)** — autoridad de payloads y envelopes compartidos.
3. **Authorization Plane / CROWN** — autoridad de autorización y obligaciones.
4. **Evidence Ledger / BookPI** — autoridad de evidencia, integridad y auditoría.
5. **ADRs aceptados** — autoridad arquitectónica y decisiones de diseño.
6. **OpenAPI y catálogos generados** — documentación derivada; nunca deben describir rutas inexistentes como implementadas.
7. **README, material comercial y diagramas** — documentación informativa.

Ningún documento puede convertir `Designed`, `Partial`, `Prototype`, `Simulated` o `Planned` en `Production`.

## 3. Canal cognitivo canónico

La conversación de Isabella tiene una única implementación de runtime:

```text
Client/UI
  -> /api/isabella
  -> withSovereignAuth(system, execute)
  -> guest exception (chat only, stateless) OR authenticated principal
  -> CROWN / authorization obligations
  -> AEGIS-X firewall
  -> distributed rate limit
  -> inference kill-switch
  -> configured Gemini provider
  -> SSE adapter
  -> client renderer
```

`/api/v1/isabella` es una superficie de compatibilidad que delega al mismo gateway; no contiene una segunda implementación cognitiva.

### 3.1 Guest chat

Guest chat es una capacidad limitada de **inferencia conversacional sin mutación**. No puede:

- escribir memoria;
- ejecutar tools;
- modificar tenant state;
- administrar políticas;
- acceder a secretos;
- elevar scopes;
- ejecutar acciones críticas.

El guest no requiere hidratar estado durable para conversar. Esto evita que una dependencia de persistencia no relacionada bloquee el canal cognitivo público. `ALLOW_GUEST_CHAT` puede desactivarse operativamente en producción; su activación no equivale a autorización de herramientas ni de estado durable.

## 4. Persistencia y modo offline

La documentación histórica de BookPI contempla SQLite/WAL como implementación offline. La implementación de producción del repositorio utiliza PostgreSQL/Neon como autoridad durable.

Por tanto:

- **Production:** PostgreSQL/Neon es la autoridad durable para tenants, sesiones, auditoría y registros gobernados.
- **Development/Lab/Offline:** SQLite puede utilizarse cuando el módulo correspondiente lo declara explícitamente y las invariantes de integridad están activas.
- Un fallback local no puede sustituir silenciosamente una dependencia requerida por producción.
- Readiness debe fallar cerrado cuando una dependencia durable requerida para producción no está disponible.

## 5. Ledger y auditoría

BookPI/evidence ledger conserva el principio append-only y hash-chain definido en ADR-0004. El backend de persistencia puede variar por entorno, pero la semántica de integridad no cambia.

Toda operación gobernada debe conservar como mínimo:

- tenant;
- timestamp UTC;
- operation/event type;
- trace/correlation identifier;
- actor/principal;
- payload/evidence hash cuando aplique;
- resultado de autorización;
- maturity/status cuando una capacidad sea experimental.

La ausencia de evidencia no puede producir una afirmación `verified`.

## 6. Tool policy

ADR-0005 permanece obligatorio para toda herramienta. La conversación normal no implica autorización de herramientas.

Antes de ejecutar cualquier tool:

1. tenant match;
2. scope authorization;
3. role/risk assessment;
4. quota/rate limits;
5. human approval cuando corresponda;
6. parameter validation;
7. audit event;
8. execution.

Critical tools permanecen bloqueadas sin aprobación humana válida.

## 7. Quantum boundary

ADR-0006 permanece obligatorio. Los módulos cuánticos no se consideran producción por el mero hecho de existir en el repositorio.

`FEATURE_LAB_MODE=false` mantiene ocultos/deshabilitados los paths experimentales en producción. Las etiquetas `PROTOTYPE`, `SIMULATED` y `PRODUCTION` deben conservarse en código, evidencia y documentación.

## 8. Contrato API

Los endpoints JSON nuevos deben utilizar `src/lib/api-contracts.ts`.

El envelope canónico es:

```json
{
  "meta": {
    "request_id": "uuid",
    "trace_id": "trace",
    "api_version": "3.2.0",
    "timestamp": "ISO-8601 UTC"
  },
  "data": null,
  "error": null
}
```

Los streams SSE mantienen el protocolo de eventos necesario para compatibilidad con el renderer, incluyen trace/correlation headers y provenance de provider/model/gobernanza sin secretos.

## 9. Reglas de organización

- No duplicar implementaciones de Isabella en `src/routes` y `src/server-routes` para la misma operación.
- Los `server-routes` legacy deben permanecer fuera de la autoridad de routing o ser eliminados después de verificar referencias.
- Toda ruta documentada debe existir en el router o marcarse `legacy`, `planned` o `removed`.
- Todo provider debe declarar disponibilidad, modelo, maturity y failure mode.
- Toda métrica de producción debe proceder de evidencia real; no se permiten `Math.random()`, valores hardcoded o simulaciones en rutas productivas.
- Toda capacidad sensible debe poder ser deshabilitada sin redeploy mediante un kill-switch gobernado.

## 10. Definition of Done para una capacidad

Una capacidad se marca `Production-Verified` únicamente cuando:

- existe implementación ejecutable;
- contrato validado;
- autorización verificada;
- aislamiento tenant verificado;
- auditoría reproducible;
- manejo de errores y timeouts probado;
- observabilidad basada en datos reales;
- CI verde;
- smoke test de despliegue real exitoso;
- documentación coincide con el código;
- no depende de mocks/simulaciones no declaradas.

Hasta entonces debe conservar su estado real: `Planned`, `Designed`, `Partial`, `Implemented`, `Tested` o `Verified`.
