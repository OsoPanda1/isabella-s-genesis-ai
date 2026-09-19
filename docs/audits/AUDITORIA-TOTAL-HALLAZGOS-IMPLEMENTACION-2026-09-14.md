# Isabella AI Genesis — Auditoría Total + Implementación Real de Hallazgos

**Fecha:** 2026-09-14  
**Repositorio:** `OsoPanda1/isabella-ai-genesis`  
**Rama:** `main`  
**Último commit de esta intervención:** `b3c402346811bd0483680928a52421852931b56a`  
**Método:** inspección directa del repositorio + revisión de rutas/servicios + implementación mediante GitHub + verificación estática posterior.

## 1. Veredicto ejecutivo

**Estado:** HARDENED / NO CERTIFICADO AÚN PARA PRODUCCIÓN PLENA.

La intervención corrigió los hallazgos de seguridad de prioridad Alta relacionados con confianza de proxy, CSP y creación repetitiva de PaymentIntents, además del bypass de recuperación de sesión de desarrollo y la opacidad del wrapper de `/api/security`.

Esto **no equivale** a una certificación de producción total. El propio repositorio mantiene componentes que requieren evidencia operacional real antes de un GO definitivo: persistencia de memoria PostgreSQL, validación de esquema vivo, reconciliación financiera, sandbox aislado, despliegue Vercel smoke-tested, OTEL operativo, DR/restore y pruebas de ataque/load.

## 2. Hallazgos solicitados y estado real

| Hallazgo | Severidad | Estado | Implementación |
|---|---|---|---|
| Confianza excesiva en `X-Forwarded-For` | Alta | **CORREGIDO** | Resolver explícito de proxy + sanitización de headers antes del router |
| CSP `connect-src https:` + nonce falso | Alta | **CORREGIDO** | Allowlist de egress + eliminación del Report-Only con nonce ficticio |
| PaymentIntent sin rate limit específico | Alta | **CORREGIDO** | Rate limit distribuido 5/min por tenant/principal/IP + fail-closed |
| Recuperación de sesión basada solo en `NODE_ENV` | Media | **CORREGIDO** | Requiere `isExplicitDevelopmentAuth()` completo |
| `/api/security` con contexto `unknown` | Media | **CORREGIDO** | Boundary de delegación tipado explícitamente |
| `aria-modal` sin focus management | Media | **NO APLICA EN EL ESTADO ACTUAL** | El componente actual no contiene `aria-modal`; no se realizó una modificación ficticia |
| Copy visual más fuerte que garantía real | Baja | **PENDIENTE** | Requiere contrato de estados verificables de ejecución |
| Estado de audio engañoso | Baja | **PENDIENTE** | Debe distinguir `loading/ready/blocked/unavailable` |

## 3. Implementaciones efectuadas

### 3.1 Trusted Proxy / IP

Se añadió `src/lib/trusted-client-ip.ts`.

Contrato:

- `vercel` → solo `x-vercel-forwarded-for`
- `cloudflare` → solo `cf-connecting-ip`
- `generic` → solo `x-real-ip`
- cualquier otro valor, incluido el legacy `true` → `unknown`
- se valida que el valor sea IPv4/IPv6 mediante `node:net/isIP`

Además, `src/server.ts` elimina antes del router:

- `x-forwarded-for`
- `x-forwarded-host`
- `x-forwarded-proto`
- `x-real-ip`
- `cf-connecting-ip`
- `x-vercel-forwarded-for`

y solo reinyecta `x-real-ip` con la identidad ya resuelta por el contrato de proxy.

Esto evita que una cabecera enviada directamente por el cliente pueda contaminar rate limiting, autorización o trazabilidad downstream.

`SecuritySystem.resolveClientIp()` fue endurecido con el mismo contrato explícito.

### 3.2 CSP

Se sustituyó la política genérica `connect-src 'self' https:` por allowlist explícita de los upstreams actualmente utilizados:

- Google Generative Language
- Groq
- xAI
- Stripe API
- Mux
- Supabase

La política de producción mantiene `script-src 'self'`.

Se eliminó el `Content-Security-Policy-Report-Only` que contenía `nonce-{REQUEST_NONCE}` / `nonce-{STYLE_NONCE}` literales. Un nonce que no se genera ni se inyecta es evidencia engañosa y no debe publicarse.

La misma corrección se aplicó al generador de headers de `SecuritySystem`, no únicamente al entrypoint HTTP.

### 3.3 Stripe / PaymentIntent abuse

`src/routes/api/billing-topup-intent.ts` ahora ejecuta un rate limit distribuido antes de crear el PaymentIntent:

`billing-topup:{tenantId}:{userId}:{resolvedIp}`

Límite actual: **5 solicitudes/minuto**.

En producción/staging, si Redis/Upstash no está disponible, la operación falla cerrada con `503`; no se degrada silenciosamente a memoria local.

El `Idempotency-Key` de Stripe continúa siendo obligatorio, por lo que ahora existen dos barreras complementarias:

1. control de frecuencia;
2. idempotencia del proveedor.

### 3.4 Desarrollo explícito

La recuperación de sesión de `SovereignOwner` ya no acepta:

`NODE_ENV=development`

como condición suficiente.

Ahora requiere exclusivamente:

- `NODE_ENV=development`
- `ISABELLA_RUNTIME_MODE=development`
- `AUTH_DEV_SESSION_ENABLED=true`

mediante `isExplicitDevelopmentAuth(config())`.

### 3.5 `/api/security`

El wrapper público dejó de declarar un handler como `unknown` sin contrato. Ahora existe una frontera explícita `ServerRequestContext` / `ServerHandlers`, manteniendo la implementación canónica en `src/server-routes/api/security.ts`.

La implementación canónica ya usa `withSovereignAuth("system", "execute", ...)`, por lo que la autenticación y autorización permanecen en la capa única de autoridad.

### 3.6 Pruebas añadidas

Se añadió:

`test/security/trusted-client-ip.test.ts`

Cubre:

- Vercel trusted header;
- rechazo de `X-Forwarded-For` genérico;
- rechazo de valores malformados;
- rechazo del modo legacy booleano `true`.

## 4. Hallazgos que permanecen y bloquean un GO pleno

### P0 — Persistencia de memoria

`src/lib/repositories/memory-repository.ts` continúa basado en fichero JSON y `memory-engine.ts` continúa pudiendo construir el motor con `createMemoryRepository()`.

La propia implementación bloquea el fichero por defecto en producción, pero eso no equivale a tener un `MemoryPostgresRepository` productivo integrado en `RepositoryFactory`.

**Acción obligatoria:** implementar repositorio PostgreSQL real, RLS, retención, consentimiento, borrado, provenance y pruebas de aislamiento.

### P0 — SovereignDB legacy en hot path

`withSovereignAuth()` todavía ejecuta `SovereignDB.hydrate()` para rutas no guest. La existencia de esta dependencia mantiene dos capas de persistencia/estado en el camino de ejecución.

**Acción obligatoria:** migrar el hot path a `PrincipalContext → Authorization → Service → Repository → PostgreSQL` y retirar `SovereignDB` del runtime productivo.

### P0 — BookPI / durable financial evidence

La arquitectura ha mejorado con bindings financieros y controles de Stripe, pero la certificación requiere ejecutar el ledger contra PostgreSQL/Neon real, probar concurrencia y reconciliación con eventos reales del proveedor.

### P0 — Auditoría durable

El sistema posee mecanismos criptográficos y repositorios de auditoría, pero la certificación requiere demostrar persistencia durable, integridad transaccional y comportamiento correcto cuando el almacenamiento de auditoría falla.

### P0 — Sandbox

`SANDBOX_ENABLED=false` es una postura correcta para no declarar seguridad inexistente, pero todavía no existe evidencia de un executor aislado real con límites de CPU/memoria/red/filesystem verificables.

### P0 — Despliegue

El estado de GitHub consultado para el commit de esta intervención todavía no aporta checks de CI/Vercel concluyentes. Por lo tanto, **no se declara PASS de build, typecheck, lint o E2E** desde esta auditoría.

## 5. Estado de CinematicIntro

La revisión del estado actual de `CinematicIntro.tsx` no encontró `aria-modal`; por tanto, el hallazgo que describía específicamente un elemento con `aria-modal="true"` no corresponde al estado actual de `main`.

Sí permanecen dos observaciones válidas:

- el copy debe reflejar estados reales de capacidades, especialmente en modo degradado;
- el audio actualmente solo diferencia esencialmente `ready` frente a `not ready`, por lo que debe evolucionar a estados explícitos `loading`, `ready`, `blocked` y `unavailable`.

## 6. Evaluación actual

La referencia existente del repositorio del 13 de septiembre clasificaba la ejecución como **72% actual de capacidad de ejecución**, con el bloqueo principal en evidencia operacional real. Esta intervención mejora varios controles de seguridad de borde, pero no debe convertirse artificialmente en un porcentaje mayor sin ejecutar CI, staging y pruebas reales.

### Clasificación recomendada después de esta intervención

**Seguridad de los hallazgos solicitados:** ~90% corregida.  
**Preparación operacional total:** todavía **NO-GO para certificación plena**.

El número correcto para una presentación pública debe ser el que resulte de la siguiente evidencia, no de la cantidad de código existente:

1. CI verde.
2. Build reproducible.
3. PostgreSQL/Neon real.
4. RLS + aislamiento tenant probado.
5. Stripe sandbox + webhook + refund + reconciliation.
6. Redis distribuido bajo carga.
7. OTEL real.
8. backup + restore drill.
9. Vercel staging smoke test.
10. security regression + load + concurrency.

## 7. Regla de GO

No debe marcarse `PRODUCTION-CERTIFIED` mientras cualquiera de estos permanezca sin evidencia real:

- memoria durable;
- auditoría durable;
- BookPI durable/concurrente;
- tenant isolation/RLS probado;
- Stripe reconciliado;
- deployment smoke-tested;
- backup/restore probado;
- CI/build verde en el commit final.

**Conclusión:** los hallazgos de seguridad solicitados fueron llevados a código real donde el estado actual del repositorio los hacía reproducibles. Los componentes que todavía carecen de infraestructura/evidencia real permanecen explícitamente como bloqueadores y no se presentan como "implementados" solo porque exista código o documentación.
