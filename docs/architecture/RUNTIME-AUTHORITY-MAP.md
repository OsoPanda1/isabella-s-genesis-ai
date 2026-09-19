# FGAIS Runtime Authority Map

**Estado:** normativo / sincronizado con runtime 2026-09-08  
**Regla constitucional:** Capability does not imply authority.

## 1. Fuente de verdad

Cuando documentación y ejecución divergen, la autoridad se resuelve en este orden:

1. Código ejecutable y sus tests reproducibles.
2. Contratos ejecutables (`src/lib/api-contracts.ts`).
3. CROWN / Constitutional Gate / PDP.
4. Evidence/BookPI y registros de auditoría.
5. ADRs y políticas Genesis 2.0.
6. Matrices de capacidad, OpenAPI y catálogos.
7. README y material descriptivo.

Una afirmación no puede elevarse a `VERIFIED` o `PRODUCTION-VERIFIED` sin evidencia reproducible suficiente.

## 2. Isabella inference

```text
UI
  -> /api/isabella
  -> /api/v1/isabella
  -> principal-context
  -> CROWN / Constitutional Gate
  -> AEGIS
  -> distributed rate limit
  -> durable kill switch
  -> canonical Isabella Chat Gateway
  -> Google Gemini streaming
  -> governed SSE response
```

Las dos rutas HTTP comparten exactamente el mismo gateway. No existe una segunda implementación cognitiva autorizada.

## 3. Estado y memoria

- PostgreSQL/Neon: autoridad durable de estado en producción.
- Redis/Upstash: estado derivado, rate limiting y cache; nunca sustituye la autoridad durable.
- SQLite/JSON: únicamente offline/lab/dev cuando una política lo habilite explícitamente.
- Memoria: acceso determinado por `memory-engine`, con frontera de tenant y scopes; el repositorio de memoria no decide autorización.

## 4. Evidence / Claim

La estructura normativa es:

```text
CLAIM -> ARGUMENT -> EVIDENCE -> TEST -> RESULT -> APPROVER -> DATE
```

Los tipos de evidencia y su procedencia se validan con `EvidenceSchema`. Los estados permitidos son `PLANNED`, `DESIGNED`, `PARTIAL`, `IMPLEMENTED`, `TESTED`, `VERIFIED`, `PRODUCTION-VERIFIED`, `FAILED`, `UNKNOWN` y `NOT-APPLICABLE`.

## 5. Tools

Chat conversacional no concede capacidad de ejecución. Una herramienta debe pasar por registro, identidad, tenant, scopes, política, riesgo, aprobación cuando corresponda, sandbox/ejecutor, validación de salida y auditoría.

## 6. Multimodalidad

El contrato de chat admite texto, imágenes inline y audio inline. Los límites de cuerpo, mensajes y adjuntos son controles del servidor. Un bloque multimodal no es una autorización ni una fuente de verdad.

## 7. Producción

Producción falla cerrada cuando falta infraestructura crítica. No se permite:

- fallback cognitivo silencioso;
- autorización implícita por rol;
- persistencia local como sustituto de PostgreSQL;
- `dry-run` de CROWN en producción;
- firma BookPI declarada como criptográfica cuando el algoritmo sea experimental;
- métricas sintéticas presentadas como telemetría real;
- claims elevados por documentación sin evidencia.

## 8. Gate mínimo

El gate debe ejecutar typecheck, lint, tests, integrity gate, production preflight, capability matrix y route audit. Un despliegue Vercel exitoso no equivale por sí solo a `PRODUCTION-VERIFIED`.
