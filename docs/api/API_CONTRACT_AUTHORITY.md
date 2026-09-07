# ISA-API Contract Authority — Especificación ampliada, gobernanza y operativa

## 0. Contexto del Usuario y Metadatos de Sesión

**Metadatos de pestañas Edge (referencia contextual):**

```json
{
  "session_id": "edge_session_20260904_0137",
  "tabs": [
    {
      "pageTitle": "Isabella's Genesis AI | Lovable",
      "pageUrl": "https://lovable.dev/projects/f3517818-75e1-4222-ad2d-af106e9d49a0",
      "tabId": 1888581409,
      "isCurrent": true,
      "context": "Desarrollo activo de interfaz y prototipado"
    },
    {
      "pageTitle": "OsoPanda1/isabella-ai-genesis",
      "pageUrl": "https://github.com/OsoPanda1/isabella-ai-genesis",
      "tabId": 1888581520,
      "isCurrent": false,
      "context": "Repositorio canónico de código y esquemas"
    },
    {
      "pageTitle": "OsoPanda1/isabella-s-genesis-ai",
      "pageUrl": "https://github.com/OsoPanda1/isabella-s-genesis-ai",
      "tabId": 1888581517,
      "isCurrent": false,
      "context": "Repositorio espejo o fork de desarrollo"
    },
    {
      "pageTitle": "Isabella Villaseñor AI — Terminal Cognitivo C.R.O.W.N.",
      "pageUrl": "https://isabella-ai-genesis.vercel.app",
      "tabId": 1888581523,
      "isCurrent": false,
      "context": "Documentación pública y demo en producción"
    }
  ],
  "inferred_focus": "Desarrollo y gobernanza de Isabella AI Genesis con énfasis en contractualización de APIs y seguridad"
}
```

**Nota:** Estos metadatos son referencia contextual y no deben usarse como fuente de autorización ni decisión de política.

---

## 1. Alcance y Fuente Canónica

### 1.1. Declaración de Principio

> **El único origen de verdad ejecutable** para contratos de API son los **esquemas y validadores en tiempo de ejecución** que se despliegan junto al código (`src/lib/api-contracts.ts` o módulo equivalente). Todos los artefactos derivados (OpenAPI, SDKs, documentación) son **representaciones generadas** y no deben usarse como fuente de autorización, validación o decisión de política.

### 1.2. Artefactos Canónicos

| Tipo                        | Ubicación                            | Propósito                                               | Herramientas                       |
| --------------------------- | ------------------------------------ | ------------------------------------------------------- | ---------------------------------- |
| **Código de contratos**     | `src/lib/api-contracts.ts`           | Definición ejecutable de esquemas de entrada/salida     | Zod, io-ts, JSON Schema            |
| **Validadores runtime**     | Mismo módulo o `src/lib/validators/` | Validación en tiempo de ejecución de requests/responses | Zod, Joi, Yup                      |
| **Esquemas generados**      | `dist/openapi.yaml`, `sdk/`          | Documentación y SDKs para consumidores                  | openapi-generator, swagger-codegen |
| **Metadatos de generación** | `dist/manifest.json`                 | Trazabilidad de artefactos generados                    | Custom CI script                   |

**Estructura de metadatos generados:**

```json
{
  "schema_hash": "sha256:abc123...",
  "source_commit": "git:abc123def456...",
  "generation_timestamp": "2026-09-04T01:35:00Z",
  "generator_version": "isa-api-gen@2.0.0",
  "artifacts": ["openapi.yaml", "sdk-typescript.tgz", "sdk-python.tgz"]
}
```

### 1.3. Reglas Operativas

#### 1.3.1. Generación CI

- **OpenAPI, SDKs y ejemplos** se generan automáticamente desde los esquemas ejecutables en cada commit a `main` o `release/*`.
- La build **falla automáticamente** si hay discrepancia entre esquemas ejecutables y artefactos generados.
- El script de generación debe calcular y registrar `schema_hash` y `source_commit`.

#### 1.3.2. Control de Cambios

- Todo cambio en esquemas ejecutables requiere:
  - **PR con pruebas de contrato** (request/response shape, validación, errores).
  - **Revisión de seguridad** (Security Owner).
  - **Aprobación de autorización** (Policy Owner si afecta políticas).
  - **Changelog actualizado** con impacto en consumidores.

#### 1.3.3. Auditoría

- Cada artefacto generado incluye un **manifiesto** con:
  - `source_commit`: hash del commit de origen.
  - `schema_hash`: hash SHA-256 del esquema ejecutable.
  - `generation_timestamp`: fecha/hora UTC de generación.
  - `generator_version`: versión del generador CI.

### 1.4. Criterios de Aceptación

- ✅ OpenAPI y SDKs **deben fallar la build** si su contenido no coincide byte-a-byte (o semánticamente) con los esquemas ejecutables.
- ✅ Los artefactos generados **deben incluir metadatos**: `source_commit`, `schema_hash`, `generation_timestamp`.
- ✅ La documentación pública (`isabella-ai-genesis.vercel.app`) **debe reflejar** la versión más reciente desplegada en producción.

---

## 2. Pipeline de Petición: Orden, Responsabilidades y Telemetría

### 2.1. Flujo Inmutable (No Negociable)

Cada petición HTTP atraviesa, **en este orden exacto**, las siguientes 10 etapas:

```
1. Normalización
   ↓
2. Correlación
   ↓
3. Autenticación
   ↓
4. Resolución de Tenant
   ↓
5. Validación de Esquema de Entrada
   ↓
6. Evaluación de Políticas (PDP)
   ↓
7. Chequeo de Capacidades/Entitlements
   ↓
8. Operación de Dominio
   ↓
9. Validación de Salida
   ↓
10. Auditoría y Persistencia de Evidencia
```

**Inmutabilidad:** El orden no puede alterarse. Si una etapa falla, la petición se corta inmediatamente (fail-fast) y se devuelve un error estandarizado.

### 2.2. Responsabilidades por Capa

| Etapa                                | Componente            | Responsabilidad                                                                                                                                           | Métricas Clave                                                  |
| ------------------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **1. Normalización**                 | API Gateway / PEP     | Canonicalizar headers, body, fechas (ISO 8601), números (decimales como strings si aplica), encoding (UTF-8).                                             | `normalization_latency_ms`, `normalization_errors`              |
| **2. Correlación**                   | Correlation Service   | Asignar `request_id` (UUID v4), `trace_id` (propagar si viene en headers), `idempotency_key` (si aplica).                                                 | `correlation_latency_ms`                                        |
| **3. Autenticación**                 | Identity Service      | Verificar token (JWT, OAuth2, mTLS), validar expiración, revocación, issuer, audience. Extraer `subject_id`, `tenant_id` (si viene en token).             | `auth_latency_ms`, `auth_failures`, `token_validation_errors`   |
| **4. Resolución de Tenant**          | Tenant Service        | Validar `tenant_id` contra fuente de verdad (DB), verificar estado (activo/suspendido), resolver configuración específica (quotas, políticas).            | `tenant_resolution_latency_ms`, `tenant_not_found_errors`       |
| **5. Validación de Entrada**         | Schema Validator      | Validar payload contra esquema Zod/runtime schema. Rechazar si hay campos extra no permitidos o tipos incorrectos.                                        | `validation_latency_ms`, `validation_errors`                    |
| **6. Evaluación de Políticas (PDP)** | C.R.O.W.N./A.R.G.U.S. | Evaluar políticas de acceso con atributos: `subject_id`, `tenant_id`, `action`, `resource`, `context`. Emitir `decision_id`, `allow/deny`, `obligations`. | `pdp_decision_latency_ms`, `policy_cache_hit_rate`, `deny_rate` |
| **7. Chequeo de Capacidades**        | Entitlement Service   | Verificar que el sujeto tiene `capability_flags` necesarios para la acción (ej. `can_create_api_keys`, `can_access_audit_logs`).                          | `entitlement_check_latency_ms`, `capability_denials`            |
| **8. Operación de Dominio**          | Domain Service        | Ejecutar lógica de negocio (crear recurso, consultar datos, procesar pago). Aplicar obligaciones del PDP (enmascarado, redacción).                        | `domain_operation_latency_ms`, `domain_errors`                  |
| **9. Validación de Salida**          | Schema Validator      | Validar respuesta contra esquema de salida. Asegurar que no se filtran campos sensibles no autorizados.                                                   | `output_validation_latency_ms`, `output_validation_errors`      |
| **10. Auditoría**                    | Audit Service         | Registrar en almacén inmutable: `request_id`, `trace_id`, `decision_id`, `tenant_id`, `subject_id`, `action`, `outcome`, `timestamp`.                     | `audit_write_latency_ms`, `audit_write_errors`                  |

### 2.3. Telemetría por Etapa

**Métricas obligatorias** (deben exponerse en Prometheus/Datadog/New Relic):

| Métrica                   | Tipo      | Dimensiones                                | Descripción                                                          |
| ------------------------- | --------- | ------------------------------------------ | -------------------------------------------------------------------- |
| `request_latency_ms`      | Histogram | `endpoint`, `tenant_id`, `outcome`         | Latencia total de la petición (desde normalización hasta auditoría). |
| `stage_latency_ms`        | Histogram | `stage`, `endpoint`, `tenant_id`           | Latencia por etapa del pipeline (ej. `stage=auth`, `stage=pdp`).     |
| `policy_decision_time_ms` | Histogram | `policy_id`, `tenant_id`                   | Tiempo que tarda el PDP en emitir una decisión.                      |
| `deny_rate`               | Counter   | `endpoint`, `tenant_id`, `reason`          | Tasa de denegaciones por política o capacidades.                     |
| `cache_hit_rate`          | Gauge     | `cache_type` (policy, entitlement, tenant) | Porcentaje de hits en caché vs. consultas a DB.                      |
| `error_rate`              | Counter   | `error_code`, `endpoint`, `tenant_id`      | Tasa de errores por código (ej. `ISB_AUTH_INVALID_TOKEN`).           |

**Tracing distribuido:**

- Propagar `trace_id` y `request_id` en **todas** las llamadas internas (HTTP, gRPC, colas).
- Usar OpenTelemetry o equivalente para generar spans por etapa.
- Muestrear 100% de denegaciones y errores 5xx; muestrear 10% de peticiones exitosas (ajustable).

**Logs estructurados:**

```json
{
  "timestamp": "2026-09-04T01:35:00Z",
  "level": "info",
  "request_id": "req_abc123",
  "trace_id": "trace_xyz789",
  "decision_id": "dec_20260904_01",
  "tenant_id": "tenant_123",
  "subject_id": "user_456",
  "stage": "pdp",
  "outcome": "allow",
  "latency_ms": 45,
  "capabilities_checked": ["can_create_api_keys", "can_access_tenant_data"],
  "policy_version": "v2.1.0"
}
```

### 2.4. Ejemplo de Payload de Correlación

**Headers de entrada:**

```http
POST /api/v2/tenants HTTP/1.1
Host: isabella-ai-genesis.vercel.app
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-Request-Id: req_abc123
X-Trace-Id: trace_xyz789
Idempotency-Key: idem_20260904_001
```

**Payload normalizado:**

```json
{
  "meta": {
    "request_id": "req_abc123",
    "trace_id": "trace_xyz789",
    "received_at": "2026-09-04T01:35:00Z",
    "idempotency_key": "idem_20260904_001"
  },
  "data": {
    "name": "Nuevo Tenant",
    "slug": "nuevo-tenant",
    "region": "us-east-1"
  }
}
```

### 2.5. Notas de Implementación

- **Fail-fast:** Si una etapa falla (ej. autenticación inválida), la petición se corta inmediatamente y se devuelve un error con código estandarizado y metadata de correlación.
- **Idempotencia:** Operaciones mutativas (POST, PUT, DELETE) deben soportar `Idempotency-Key`. El sistema debe verificar si ya existe una petición con la misma clave y devolver la respuesta cached (si está dentro de la ventana de idempotencia, ej. 24h).
- **Seguridad de entrada:**
  - **Nunca confiar en:** `tenant_id`, `scopes`, `decisiones de política`, `precios`, `balances`, `risk_scores`, o cualquier dato suministrado por el cliente.
  - **Fuente de verdad:** Toda información de autorización o riesgo debe provenir de servicios internos verificados (C.R.O.W.N./A.R.G.U.S., sistema de economía, servicio de identidad).

---

## 3. Autorización, Modelo de Confianza y Políticas

### 3.1. Principios de Confianza

| Principio                    | Descripción                                                                                                             | Implicación                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **No confiar en el cliente** | `tenant_id`, `scopes`, `precios`, `balances`, `risk_scores` y cualquier dato provisto por el cliente son **untrusted**. | Validar siempre contra fuentes internas (DB, PDP, servicios verificados).                                                 |
| **Modelos como señales**     | ML y proveedores externos solo aportan **advice** (recomendaciones, scores). La decisión final la emite el PDP interno. | Un score de riesgo de un modelo externo no puede denegar acceso por sí solo; debe ser corroborado por políticas internas. |
| **Decision as data**         | Cada decisión de política debe producir: `decision_id`, `decision_version`, `allow/deny`, `obligations`.                | Toda decisión es rastreable, auditable y versionada.                                                                      |

### 3.2. Arquitectura Recomendada

```
┌─────────────┐
│   Cliente   │
└──────┬──────┘
       │ HTTP Request
       ↓
┌─────────────────┐
│  API Gateway    │ ← PEP (Policy Enforcement Point)
│  (Normalización,│
│   Correlación,  │
│   Autenticación)│
└──────┬──────────┘
       │ Claims verificados
       ↓
┌─────────────────┐
│  Identity Svc   │ ← Verifica identidad, atributos
└──────┬──────────┘
       │ subject_id, tenant_id
       ↓
┌─────────────────┐
│  Tenant Svc     │ ← Valida tenant, resuelve config
└──────┬──────────┘
       │ tenant_id verificado
       ↓
┌─────────────────┐
│  C.R.O.W.N.     │ ← PDP (Policy Decision Point)
│  / A.R.G.U.S.   │   Evalúa políticas, emite decision_id
└──────┬──────────┘
       │ decision_id, allow/deny, obligations
       ↓
┌─────────────────┐
│  Entitlement Svc│ ← Verifica capabilities del sujeto
└──────┬──────────┘
       │ capabilities verificadas
       ↓
┌─────────────────┐
│  Domain Svc     │ ← Ejecuta lógica de negocio
│                 │   (aplica obligations: enmascarado, etc.)
└──────┬──────────┘
       │ Resultado
       ↓
┌─────────────────┐
│  Audit Svc      │ ← Registra decisión, metadatos
└─────────────────┘
```

**PDP centralizado:** C.R.O.W.N./A.R.G.U.S. como única fuente de decisiones de política.

**PEP en cada borde:** API Gateway, funciones serverless, workers de edge deben consultar al PDP antes de ejecutar operaciones.

**Caching seguro:**

- Caché de decisiones con TTL corto (ej. 5 minutos) y revocación inmediata ante cambios de política.
- Incluir `decision_id` y `decision_version` en caché para invalidación selectiva.
- Nunca cachear decisiones con `allow` si hay riesgo alto (ej. operaciones financieras); consultar PDP en tiempo real.

### 3.3. Obligaciones y Enforcement

**Obligaciones** son acciones que el PEP debe aplicar antes/durante/después de la operación de dominio:

| Tipo de obligación        | Ejemplo                                                                  | Implementación                                                                  |
| ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Enmascarado de campos** | Redactar `email`, `phone` en respuestas para sujetos sin `can_view_pii`. | Middleware que filtra campos basado en `decision.obligations.redact_fields`.    |
| **Throttling**            | Limitar a 10 requests/minuto para sujetos con `risk_score > 80`.         | Rate limiter configurado dinámicamente desde `decision.obligations.rate_limit`. |
| **Logging adicional**     | Registrar payload completo para decisiones con `audit_level=verbose`.    | Audit Service escribe log estructurado con payload cifrado.                     |
| **Rechazo con motivo**    | Denegar acceso a recurso con `reason=insufficient_quota`.                | PEP devuelve error `CROWN_POLICY_DENY` con `details.reason`.                    |

**Enforcement:** El PEP **debe** aplicar todas las obligaciones antes de ejecutar la operación de dominio. Si una obligación no puede aplicarse (ej. fallo de enmascarado), la petición se deniega con `SYSTEM_ENFORCEMENT_FAILURE`.

### 3.4. Matriz de Atributos para Decisiones

| Atributo              | Fuente de verdad       | Usos                                                                       |
| --------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `subject_id`          | Identity Service       | Autorización (quién es el sujeto).                                         |
| `tenant_id`           | Tenant Service         | Aislamiento (a qué tenant pertenece).                                      |
| `capability_flags`    | Entitlement Service    | Chequeo de capacidades (qué puede hacer).                                  |
| `risk_score`          | Risk Service (interno) | Contexto de política (nivel de riesgo).                                    |
| `resource_attributes` | Domain Service         | Contexto adicional (ej. `resource.sensitivity`, `resource.owner_id`).      |
| `context`             | PEP (validado)         | Contexto de la petición (ej. `action=create`, `ip_address`, `user_agent`). |

### 3.5. Reglas Clave

- **Los modelos/proveedores no otorgan autorización:** Un modelo ML o proveedor externo puede aportar señales (score, recomendación) pero **no sustituye** la decisión de política.
- **Señales no confiables:** Cualquier dato originado en el cliente o en modelos externos se trata como **advisory** y debe ser corroborado por servicios internos antes de afectar autorización o facturación.
- **Políticas versionadas:** Cada política tiene `policy_version` (semver). Las decisiones incluyen `decision_version` para trazabilidad.

---

## 4. Metadatos de Respuesta, Privacidad y Formato Estándar

### 4.1. Campos Públicos Permitidos

| Campo                | Tipo              | Descripción                                               | Ejemplo                                |
| -------------------- | ----------------- | --------------------------------------------------------- | -------------------------------------- |
| `request_id`         | UUID              | Identificador único de la petición (correlacionable).     | `req_abc123`                           |
| `trace_id`           | UUID              | Identificador de traza distribuida (para debugging).      | `trace_xyz789`                         |
| `decision_id`        | String            | Identificador de la decisión de política emitida por PDP. | `dec_20260904_01`                      |
| `api_version`        | String            | Versión de la API (semver o fecha).                       | `v2.1`                                 |
| `deprecation_notice` | String (opcional) | Aviso de deprecación de campo/endpoint.                   | `fieldX deprecated; sunset=2027-01-01` |

### 4.2. Prohibiciones Estrictas

**Nunca exponer en respuestas públicas:**

- Tokens (JWT, API keys, refresh tokens).
- Claves (secretos, contraseñas, hashes de contraseñas).
- Stack traces (detalles de implementación, rutas de archivos).
- Prompts internos (instrucciones de IA, contextos de conversación).
- SQL o queries generadas.
- Material de política privada (reglas de C.R.O.W.N., condiciones de A.R.G.U.S.).
- Credenciales de proveedor (API keys de terceros, tokens OAuth).
- Balances sensibles (saldos de cuenta, límites de crédito no autorizados).
- Datos PII no autorizados (emails, teléfonos, direcciones sin consentimiento).

### 4.3. Estructura de Respuesta Recomendada

**Respuesta exitosa (2xx):**

```json
{
  "meta": {
    "request_id": "req_abc123",
    "trace_id": "trace_xyz789",
    "decision_id": "dec_20260904_01",
    "api_version": "v2.1"
  },
  "data": {
    "user": {
      "id": "u_1",
      "name": "Edwin",
      "email": "e***@example.com" // enmascarado por obligación
    }
  },
  "error": null
}
```

**Respuesta con error (4xx/5xx):**

```json
{
  "meta": {
    "request_id": "req_abc123",
    "trace_id": "trace_xyz789",
    "api_version": "v2.1"
  },
  "data": null,
  "error": {
    "code": "ISB_AUTH_INVALID_TOKEN",
    "message": "Autenticación fallida. Proporcione credenciales válidas.",
    "correlation_id": "req_abc123",
    "retryable": false,
    "details": {
      "reason": "token_expired",
      "expired_at": "2026-09-03T23:35:00Z"
    }
  }
}
```

### 4.4. Headers Recomendados

| Header               | Descripción                                                   | Ejemplo                                |
| -------------------- | ------------------------------------------------------------- | -------------------------------------- |
| `X-Request-Id`       | ID único de la petición (igual que `meta.request_id`).        | `req_abc123`                           |
| `X-Trace-Id`         | ID de traza distribuida (igual que `meta.trace_id`).          | `trace_xyz789`                         |
| `X-API-Version`      | Versión de la API usada.                                      | `v2.1`                                 |
| `X-Decision-Id`      | ID de la decisión de política (igual que `meta.decision_id`). | `dec_20260904_01`                      |
| `Deprecation-Notice` | Aviso de deprecación (si aplica).                             | `fieldX deprecated; sunset=2027-01-01` |
| `Retry-After`        | Segundos para reintentar (si `retryable=true`).               | `60`                                   |

### 4.5. Formato y Estructura

- **Consistencia:** `meta` siempre presente (incluso en errores). `error` siempre incluye `code`, `message`, `correlation_id`, `retryable`.
- **Tipado fuerte:** Todos los campos deben estar tipados en esquemas de salida (Zod, OpenAPI).
- **Versionado:** `api_version` debe reflejar la versión del esquema de salida usado.

---

## 5. Vocabulario de Errores, Códigos y Manejo Seguro

### 5.1. Prefijos Estandarizados

| Prefijo       | Responsabilidad                   | Ejemplos                                                                                   |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `ISB_AUTH_`   | Autenticación (Identity Service)  | `ISB_AUTH_INVALID_TOKEN`, `ISB_AUTH_TOKEN_EXPIRED`, `ISB_AUTH_TOKEN_REVOKED`               |
| `ISB_TENANT_` | Tenant (Tenant Service)           | `ISB_TENANT_NOT_FOUND`, `ISB_TENANT_SUSPENDED`, `ISB_TENANT_QUOTA_EXCEEDED`                |
| `CROWN_`      | Políticas (C.R.O.W.N./A.R.G.U.S.) | `CROWN_POLICY_DENY`, `CROWN_OBLIGATION_FAILURE`, `CROWN_POLICY_NOT_FOUND`                  |
| `MEMORY_`     | Memoria (Memory Service)          | `MEMORY_NOT_FOUND`, `MEMORY_CONSENT_DENIED`, `MEMORY_EXPIRED`                              |
| `TOOL_`       | Herramientas (Tool Service)       | `TOOL_NOT_FOUND`, `TOOL_EXECUTION_FAILED`, `TOOL_TIMEOUT`                                  |
| `ECONOMY_`    | Economía (BookPI, Ledger)         | `ECONOMY_INSUFFICIENT_BALANCE`, `ECONOMY_TRANSACTION_FAILED`, `ECONOMY_REFUND_NOT_ALLOWED` |
| `AUDIT_`      | Auditoría (Audit Service)         | `AUDIT_WRITE_FAILED`, `AUDIT_TAMPER_DETECTED`, `AUDIT_RETENTION_EXCEEDED`                  |
| `SYSTEM_`     | Sistema (infraestructura)         | `SYSTEM_INTERNAL_ERROR`, `SYSTEM_UNAVAILABLE`, `SYSTEM_RATE_LIMITED`                       |

### 5.2. Formato Público de Error

```json
{
  "error": {
    "code": "ISB_AUTH_INVALID_TOKEN",
    "message": "Autenticación fallida. Proporcione credenciales válidas.",
    "correlation_id": "req_abc123",
    "retryable": false,
    "details": {
      "reason": "token_expired",
      "expired_at": "2026-09-03T23:35:00Z"
    }
  }
}
```

**Reglas:**

- `code`: prefijo + identificador corto (snake_case, mayúsculas).
- `message`: mensaje seguro para cliente (no filtrar detalles internos).
- `correlation_id`: `request_id` o `trace_id` para trazabilidad.
- `retryable`: booleano que indica si el cliente puede reintentar (ej. `true` para `SYSTEM_RATE_LIMITED`, `false` para `ISB_AUTH_INVALID_TOKEN`).
- `details`: opcional, no sensible (puede incluir razones genéricas, timestamps).

### 5.3. Tabla de Ejemplos

| Código                         | Retryable | Mensaje Público                                                 | Escenario                                                   |
| ------------------------------ | --------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `ISB_AUTH_INVALID_TOKEN`       | false     | Autenticación fallida. Proporcione credenciales válidas.        | Token JWT inválido o mal formado.                           |
| `ISB_AUTH_TOKEN_EXPIRED`       | false     | Token expirado. Renueve sus credenciales.                       | Token JWT con `exp` en el pasado.                           |
| `ISB_TENANT_NOT_FOUND`         | false     | Tenant no encontrado. Contacte a soporte.                       | `tenant_id` no existe en DB.                                |
| `ISB_TENANT_SUSPENDED`         | false     | Tenant suspendido. Contacte a soporte.                          | Tenant marcado como `status=suspended`.                     |
| `CROWN_POLICY_DENY`            | false     | Acceso denegado por políticas.                                  | PDP evalúa política y devuelve `deny`.                      |
| `MEMORY_CONSENT_DENIED`        | false     | Acceso a memoria denegado por falta de consentimiento.          | Usuario no dio `consent=true` para el `purpose` solicitado. |
| `ECONOMY_INSUFFICIENT_BALANCE` | false     | Saldo insuficiente para completar la operación.                 | `balance < amount` en BookPI.                               |
| `SYSTEM_RATE_LIMITED`          | true      | Límite de peticiones excedido. Reintente después de X segundos. | Rate limiter activado por exceso de requests.               |
| `SYSTEM_INTERNAL_ERROR`        | true      | Error interno del servidor. Reintente más tarde.                | Error no esperado en dominio (5xx).                         |

### 5.4. Reglas de Mensajes

- **Mensajes públicos deben ser seguros:** No filtrar detalles internos (ej. no decir "SQL constraint violation", decir "Datos inválidos").
- **Logs internos (audit) contienen la traza completa:** Razones, datos sensibles (cifrados/ACL), stack traces.
- **Internacionalización:** Mensajes públicos deben estar localizables (i18n) para múltiples idiomas.

---

## 6. Versionado, Compatibilidad y Migraciones

### 6.1. Reglas de Compatibilidad

| Tipo de cambio                                                         | Compatibilidad | Acción requerida                                             |
| ---------------------------------------------------------------------- | -------------- | ------------------------------------------------------------ |
| **Campos aditivos** (añadir campo opcional)                            | ✅ Compatible  | No requiere nueva versión. Documentar en changelog.          |
| **Campos obligatorios nuevos**                                         | ❌ Breaking    | Nueva versión mayor (`v2.0`). Guía de migración obligatoria. |
| **Eliminación de campos**                                              | ❌ Breaking    | Nueva versión mayor. Deprecación previa con `sunset_date`.   |
| **Cambio de tipo** (ej. `string` → `number`)                           | ❌ Breaking    | Nueva versión mayor. Migración de datos requerida.           |
| **Cambio de semántica** (ej. campo `status` cambia valores permitidos) | ❌ Breaking    | Nueva versión mayor. Validación de migración obligatoria.    |

### 6.2. Prácticas CI/CD

- **Contract tests:** Validar request/response shape, autorización, tenant isolation, idempotencia en cada PR.
- **Build guardrails:** Fallar la build si OpenAPI/SDK no coincide con esquemas ejecutables (verificar `schema_hash`).
- **Deprecación:** Documentar con `sunset_date` y advertencias en headers (`Deprecation-Notice`).

**Ejemplo de header de deprecación:**

```http
Deprecation-Notice: fieldX deprecated; sunset=2027-01-01
```

### 6.3. Migraciones

**Guía de migración obligatoria para versiones mayores:**

1. **Análisis de impacto:** Identificar consumidores afectados (internos/externos).
2. **Documentación:** Publicar guía de migración con ejemplos de código antes/después.
3. **Período de gracia:** Mantener versión anterior durante N días/semanas (configurable).
4. **Monitoreo:** Rastrear uso de versión antigua vs. nueva (métricas por `api_version`).
5. **Sunset:** Desactivar versión antigua después de `sunset_date` con aviso previo.

---

## 7. Observabilidad, Telemetría y Monitoreo Avanzado

### 7.1. Métricas Clave

| Métrica                   | Tipo      | Dimensiones                           | SLO Objetivo          | Alerta                |
| ------------------------- | --------- | ------------------------------------- | --------------------- | --------------------- |
| `request_latency_ms`      | Histogram | `endpoint`, `tenant_id`, `outcome`    | p99 < 500ms           | p99 > 1000ms por 5min |
| `stage_latency_ms`        | Histogram | `stage`, `endpoint`, `tenant_id`      | p99 por etapa < 100ms | p99 auth > 200ms      |
| `policy_decision_time_ms` | Histogram | `policy_id`, `tenant_id`              | p99 < 50ms            | p99 > 100ms           |
| `deny_rate`               | Counter   | `endpoint`, `tenant_id`, `reason`     | < 5% de requests      | > 20% por 10min       |
| `error_rate`              | Counter   | `error_code`, `endpoint`, `tenant_id` | < 1% de requests      | > 5% por 5min         |
| `cache_hit_rate`          | Gauge     | `cache_type`                          | > 80%                 | < 50% por 10min       |

### 7.2. Tracing y Logs

**Tracing distribuido:**

- Propagar `trace_id` y `span_id` en todas las llamadas internas (HTTP, gRPC, colas).
- Usar OpenTelemetry o equivalente para generar spans por etapa del pipeline.
- Muestrear 100% de denegaciones y errores 5xx; muestrear 10% de peticiones exitosas (ajustable por configuración).

**Logs estructurados:**

```json
{
  "timestamp": "2026-09-04T01:35:00Z",
  "level": "info",
  "request_id": "req_abc123",
  "trace_id": "trace_xyz789",
  "decision_id": "dec_20260904_01",
  "tenant_id": "tenant_123",
  "subject_id": "user_456",
  "stage": "pdp",
  "outcome": "allow",
  "latency_ms": 45,
  "capabilities_checked": ["can_create_api_keys", "can_access_tenant_data"],
  "policy_version": "v2.1.0",
  "ip_address": "192.168.1.1", // cifrado en logs de auditoría
  "user_agent": "Mozilla/5.0..." // truncado a 256 chars
}
```

**Retención de logs:**

- Logs de aplicación: 30 días (configurable por regulación).
- Logs de auditoría: 7 años (o según regulación aplicable: GDPR, HIPAA, SOX).

### 7.3. Alertas y SLOs

**Alertas críticas (P0):**

- Aumento de denegaciones (`deny_rate > 20%` por 10min).
- Latencia PDP (`policy_decision_time_ms p99 > 100ms` por 5min).
- Errores 5xx (`error_rate > 5%` por 5min).
- Fallo de auditoría (`audit_write_errors > 0` por 1min).

**SLOs (Service Level Objectives):**

- **Disponibilidad:** 99.9% (≤ 43min de downtime/mes).
- **Latencia p99:** < 500ms para 95% de requests.
- **Precisión de políticas:** 100% de decisiones auditables (todo `decision_id` rastreable).

### 7.4. Auditoría Inmutable

**Registro en almacén inmutable:**

- `request_id`, `trace_id`, `decision_id`, `policy_version`, `tenant_id`, `subject_id`, `capabilities_checked`, `outcome`, `timestamp`.
- Hash chaining: cada entrada incluye `previous_log_hash` para detectar tampering.
- Acceso a logs de auditoría controlado por RBAC (solo Security Owner, Policy Owner, SRE con justificación).

**Ejemplo de entrada de auditoría:**

```json
{
  "id": "audit_abc123",
  "request_id": "req_abc123",
  "trace_id": "trace_xyz789",
  "decision_id": "dec_20260904_01",
  "policy_version": "v2.1.0",
  "tenant_id": "tenant_123",
  "subject_id": "user_456",
  "action": "create_api_key",
  "resource": "api_key",
  "outcome": "allow",
  "capabilities_checked": ["can_create_api_keys"],
  "timestamp": "2026-09-04T01:35:00Z",
  "previous_log_hash": "sha256:def456...",
  "verification_hash": "sha256:ghi789..."
}
```

---

## 8. Seguridad Técnica y Controles de Datos

### 8.1. Autenticación

- **Soportar:** OAuth2 (PKCE para clientes públicos), mTLS (para servicios internos), tokens de servicio (rotación automática cada 24h).
- **Validar tokens contra Identity Service:** Rechazar tokens expirados, revocados, o con `issuer`/`audience` incorrectos.
- **Rotación de claves:** Rotar claves de firma de JWT cada 90 días (o antes si hay compromiso).

### 8.2. Autorización

- **PDP centralizado:** C.R.O.W.N./A.R.G.U.S. con políticas versionadas (semver).
- **Entitlements y capabilities:** Almacenados en Entitlement Service, verificados en tiempo real (no cachear sin TTL corto).
- **Revisión trimestral:** Policy Owner revisa políticas y capabilities cada 3 meses.

### 8.3. Protección de Secretos

- **Vaults gestionados:** Usar HashiCorp Vault, AWS Secrets Manager o equivalente para claves y credenciales.
- **Rotación automática:** Rotar secretos cada 90 días (o antes si hay compromiso).
- **Acceso por roles:** Solo SRE y Security Owner pueden acceder a secretos en producción (con justificación auditada).

### 8.4. Cifrado y Protección de Datos

| Tipo            | Estándar                 | Implementación                                                                                             |
| --------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **En tránsito** | TLS 1.3 (mínimo 1.2)     | Ciphers modernos (AES-256-GCM, ChaCha20-Poly1305). HSTS habilitado.                                        |
| **En reposo**   | AES-256                  | Cifrado en DB (Supabase, Neon), almacenamiento de logs, backups. Claves gestionadas por KMS.               |
| **PII**         | Tokenización/enmascarado | Enmascarar emails, teléfonos en logs y respuestas. Tokenizar IDs sensibles (ej. `user_id` → `tok_abc123`). |
| **Secretos**    | Cifrado con KMS          | Claves de firma de JWT, API keys de terceros, credenciales de DB.                                          |

### 8.5. Hardening y Pruebas

- **SAST (Static Application Security Testing):** Escaneo en CI en cada PR (ej. SonarQube, Semgrep).
- **DAST (Dynamic Application Security Testing):** Escaneo en staging antes de deploy a producción (ej. OWASP ZAP, Burp Suite).
- **Pruebas de penetración:** Trimestrales por terceros (o internas si hay equipo de seguridad dedicado).
- **Revisión de dependencias:** Escaneo de vulnerabilidades en `package.json` (ej. `npm audit`, Dependabot).
- **SBOM (Software Bill of Materials):** Generar en cada release (ej. `syft`, `cyclonedx`).

---

## 9. Gobernanza, Roles y Procesos de Cambio

### 9.1. Roles y Responsabilidades

| Rol                                      | Responsabilidades                                                                                          | Contacto (ejemplo)         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Policy Owner (C.R.O.W.N./A.R.G.U.S.)** | Autoriza cambios en políticas, revisa decisiones de PDP, garantiza consistencia de políticas.              | `policy-owner@example.com` |
| **API Owner**                            | Cambios en esquemas ejecutables, versionado de APIs, documentación OpenAPI.                                | `api-owner@example.com`    |
| **Security Owner**                       | Revisiones de seguridad (SAST/DAST), aprobación de cambios que afectan seguridad, respuesta a incidentes.  | `security@example.com`     |
| **SRE/Platform**                         | Despliegue, observabilidad (métricas, logs, tracing), runbooks, respuesta a incidentes de infraestructura. | `sre@example.com`          |
| **Domain Owner**                         | Lógica de negocio, validación de salida, garantías de consistencia de datos.                               | `domain-owner@example.com` |

### 9.2. Proceso de Cambio

**Flujo para cambios en esquemas o políticas:**

1. **Propuesta de cambio (RFC):** Documento con impacto en contratos, consumidores afectados, migración requerida.
2. **PR con tests:** Incluir tests de contrato, integración, seguridad.
3. **Revisión de Policy Owner:** Aprobación si afecta políticas (C.R.O.W.N./A.R.G.U.S.).
4. **Revisión de Security Owner:** Aprobación si afecta seguridad (autenticación, autorización, cifrado).
5. **Staging verification:** Desplegar en staging, ejecutar tests de integración con C.R.O.W.N./A.R.G.U.S.
6. **Release:** Deploy a producción con changelog y guía de migración.
7. **Post-release:** Monitorear métricas (error_rate, deny_rate) por 24-48h.

### 9.3. Revisión y Auditoría

- **Revisión trimestral:** Policy Owner y Security Owner revisan políticas, artefactos generados, incidentes.
- **Registro de cambios:** Todo cambio debe estar documentado en changelog (fecha, autor, impacto).
- **Evidencia de pruebas:** Tests de contrato, seguridad, integración deben estar disponibles para auditoría (acceso controlado por RBAC).

---

## 10. Tests, Matrices y Checklist de PR

### 10.1. Matriz Mínima de Pruebas

| Tipo                  | Cobertura                                                                      | Herramientas             | Frecuencia                        |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------ | --------------------------------- |
| **Unit tests**        | Validación de esquemas (Zod), funciones de utilidad.                           | Jest, Vitest             | Cada commit                       |
| **Contract tests**    | Request/response shape, validación de entrada/salida.                          | Pact, custom tests       | Cada PR                           |
| **Auth tests**        | Tenant isolation, scope escalation, capability denial.                         | Supertest, custom mocks  | Cada PR                           |
| **Idempotency tests** | Mutaciones con `Idempotency-Key` (repetir request, verificar misma respuesta). | Custom tests             | Cada PR                           |
| **Integration tests** | C.R.O.W.N./A.R.G.U.S. en staging, flujos completos (auth → policy → domain).   | Playwright, custom tests | Cada PR a `main`                  |
| **Security tests**    | SAST, DAST, pruebas de inyección (SQL, XSS), rate limiting.                    | SonarQube, OWASP ZAP     | Cada PR (SAST), pre-deploy (DAST) |

### 10.2. Checklist de PR

```yaml
pr_checklist:
  - schemas_executable_updated: true # Esquemas en src/lib/api-contracts.ts actualizados
  - contract_tests_passed: true # Tests de forma de request/response verdes
  - policy_owner_approval: true # Aprobación de Policy Owner si afecta políticas
  - security_review: true # Revisión de Security Owner (SAST/DAST)
  - changelog_added: true # Changelog actualizado con impacto
  - telemetry_enabled: true # Métricas y logs añadidos para nuevos endpoints
  - migration_guide_added: true # Guía de migración si es breaking change
  - rollback_plan: true # Plan de rollback documentado
```

### 10.3. Contract Tests

**Deben cubrir:**

- **Request validation:** Campos obligatorios, tipos, formatos (email, UUID, fecha ISO).
- **Response shape:** Estructura `meta`, `data`, `error`.
- **Authorization:** Tenant isolation (tenant A no puede acceder a datos de tenant B), scope escalation (sujeto con `scope=read` no puede escribir), capability denial (sujeto sin `can_create_api_keys` no puede crear API keys).
- **Idempotency:** Repetir request con misma `Idempotency-Key`, verificar misma respuesta.
- **Migraciones:** Si hay nueva versión, tests de compatibilidad hacia atrás (si aplica).

---

## 11. Runbooks Operativos y Respuesta a Incidentes

### 11.1. Incidente: PDP (C.R.O.W.N./A.R.G.U.S.) No Responde

**Detección:**

- Alertas por aumento de latencia PDP (`policy_decision_time_ms p99 > 100ms` por 5min).
- Timeouts en llamadas al PDP (ej. `CROWN_UNAVAILABLE` errors).

**Mitigación inmediata:**

1. **Activar modo degradado:** PEP usa políticas de fallback conservadoras (deny por defecto para operaciones sensibles, allow para operaciones de solo lectura si hay caché válido).
2. **Rechazar operaciones sensibles:** Si no hay decisión de PDP, denegar operaciones mutativas (crear, actualizar, eliminar) con `CROWN_UNAVAILABLE` y `retryable=true`.
3. **Notificar:** Alertar a Policy Owner y SRE (Slack, PagerDuty).

**Escalada:**

- Policy Owner: Evaluar si hay políticas corruptas o cambios recientes que causaron el fallo.
- SRE: Verificar salud del servicio PDP (logs, métricas, restart si es necesario).

**Post-mortem:**

- Registrar `decision_id` faltantes, impacto por tenant, endpoints afectados.
- Plan de remediación: parche, rollback, o ajuste de políticas.

### 11.2. Incidente: Fuga de Datos en Logs

**Detección:**

- Alertas de seguridad (ej. logs con PII no enmascarada detectada por scanner).
- Reporte de usuario o auditoría interna.

**Acción inmediata:**

1. **Revocar accesos:** Invalidar credenciales de servicios/usuarios que pudieron acceder a logs sensibles.
2. **Detener ingestión:** Pausar pipeline de logs (ej. detener Fluentd, Logstash) para evitar más fuga.
3. **Rotar claves:** Rotar claves de cifrado de logs, credenciales de almacenamiento de logs.

**Notificación:**

- Equipo de seguridad (Security Owner).
- Cumplimiento/legal (si hay regulación aplicable: GDPR, HIPAA).

**Remediación:**

- **Purga de logs sensibles:** Eliminar logs con PII no autorizada (usar scripts de purga con auditoría).
- **Revisión de retención:** Ajustar políticas de retención de logs (ej. reducir de 90 días a 30 días para logs no críticos).
- **Enmascarado:** Implementar enmascarado automático de PII en logs (ej. regex para emails, teléfonos).

### 11.3. Checklist de Recuperación

```markdown
- [ ] Identificar alcance por `request_id` y `trace_id` (qué peticiones afectadas).
- [ ] Reproducir en staging con fixtures (recrear el escenario del incidente).
- [ ] Aplicar parche y desplegar con canary (10% → 50% → 100%).
- [ ] Ejecutar pruebas de contrato y autorización (verificar que el parche no rompió nada).
- [ ] Monitorear métricas por 24-48h (error_rate, deny_rate, latency).
- [ ] Documentar post-mortem (causa raíz, acciones correctivas, prevención).
```

### 11.4. Runbook: Pasos Accionables (Resumen)

1. **Detectar y contener:** Identificar el incidente, activar mitigación temporal (modo degradado, pausar ingestión de logs).
2. **Activar mitigación temporal:** Fallback policies, rechazar operaciones sensibles, rotar claves.
3. **Escalar a Policy Owner y SRE:** Notificar a responsables (Slack, PagerDuty, email).
4. **Recolectar evidencia:** Auditoría inmutable (logs, traces, `decision_id`), snapshots de métricas.
5. **Remediar y desplegar parche con canary:** Parche en staging, pruebas, deploy gradual.
6. **Ejecutar post-mortem y actualizar políticas/procedimientos:** Documentar causa raíz, acciones correctivas, prevención futura.

---

## 12. Ejemplos Prácticos y Plantillas

### 12.1. Ejemplo de Respuesta Exitosa

```json
{
  "meta": {
    "request_id": "req_abc123",
    "trace_id": "trace_xyz789",
    "decision_id": "dec_20260904_01",
    "api_version": "v2.1"
  },
  "data": {
    "user": {
      "id": "u_1",
      "name": "Edwin",
      "email": "e***@example.com" // enmascarado por obligación
    }
  },
  "error": null
}
```

### 12.2. Ejemplo de Error Público

```json
{
  "meta": {
    "request_id": "req_5678",
    "trace_id": "trace_def456",
    "api_version": "v2.1"
  },
  "data": null,
  "error": {
    "code": "ISB_AUTH_INVALID_TOKEN",
    "message": "Autenticación fallida. Proporcione credenciales válidas.",
    "correlation_id": "req_5678",
    "retryable": false,
    "details": {
      "reason": "token_expired",
      "expired_at": "2026-09-03T23:35:00Z"
    }
  }
}
```

### 12.3. OpenAPI Annotations Recomendadas

```yaml
openapi: 3.0.3
info:
  title: Isabella AI Genesis API
  version: 2.1.0
  description: API contractual de Isabella AI Genesis con gobernanza ISA-API.

paths:
  /api/v2/tenants:
    post:
      summary: Crear nuevo tenant
      operationId: createTenant
      tags:
        - Tenants
      security:
        - bearerAuth: []
      parameters:
        - in: header
          name: X-Request-Id
          required: true
          schema:
            type: string
            format: uuid
          description: ID único de la petición (correlación).
        - in: header
          name: X-Trace-Id
          required: false
          schema:
            type: string
            format: uuid
          description: ID de traza distribuida (propagar si existe).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateTenantRequest"
      responses:
        "201":
          description: Tenant creado exitosamente.
          headers:
            X-Request-Id:
              schema:
                type: string
              description: ID de la petición (igual que request).
            X-API-Version:
              schema:
                type: string
              description: Versión de la API usada.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CreateTenantResponse"
        "400":
          description: Error de validación.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
        "401":
          description: Autenticación fallida.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
        "403":
          description: Acceso denegado por políticas.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    Meta:
      type: object
      properties:
        request_id:
          type: string
          format: uuid
          description: ID único de la petición.
        trace_id:
          type: string
          format: uuid
          description: ID de traza distribuida.
        decision_id:
          type: string
          description: ID de la decisión de política.
        api_version:
          type: string
          description: Versión de la API (semver).
    Error:
      type: object
      properties:
        code:
          type: string
          description: Código de error estandarizado (ej. ISB_AUTH_INVALID_TOKEN).
        message:
          type: string
          description: Mensaje seguro para cliente.
        correlation_id:
          type: string
          description: ID de correlación (request_id o trace_id).
        retryable:
          type: boolean
          description: Si el cliente puede reintentar la petición.
        details:
          type: object
          description: Detalles opcionales no sensibles.
    CreateTenantRequest:
      type: object
      required:
        - name
        - slug
      properties:
        name:
          type: string
          description: Nombre del tenant.
        slug:
          type: string
          description: Slug único del tenant.
        region:
          type: string
          enum: [us-east-1, us-west-2, eu-west-1]
          description: Región de despliegue.
    CreateTenantResponse:
      type: object
      properties:
        meta:
          $ref: "#/components/schemas/Meta"
        data:
          type: object
          properties:
            tenant:
              type: object
              properties:
                id:
                  type: string
                  format: uuid
                name:
                  type: string
                slug:
                  type: string
                region:
                  type: string
                created_at:
                  type: string
                  format: date-time
```

### 12.4. Ejemplo de Flujo de Autorización (Resumido)

1. **Request llega:** Normalizar headers, body, asignar `request_id`, `trace_id`.
2. **Autenticar sujeto:** Verificar JWT contra Identity Service, extraer `subject_id`, `tenant_id`.
3. **Resolver tenant:** Validar `tenant_id` contra Tenant Service (verificar estado activo).
4. **Validar payload:** Verificar contra esquema Zod (ej. `CreateTenantRequest`).
5. **Consultar C.R.O.W.N./A.R.G.U.S.:** Enviar `subject_id`, `tenant_id`, `action=create`, `resource=tenant`, `context={ip, user_agent}`.
6. **C.R.O.W.N. devuelve:** `decision_id=dec_20260904_01`, `allow=true`, `obligations={redact_fields: ["email"]}`.
7. **PEP aplica obligaciones:** Enmascarar campos sensibles en respuesta.
8. **Ejecutar operación de dominio:** Crear tenant en DB.
9. **Validar salida:** Verificar que respuesta coincide con esquema `CreateTenantResponse`.
10. **Registrar auditoría:** Escribir en Audit Service con `decision_id`, `outcome=allow`.
11. **Responder:** Devolver JSON con `meta`, `data`.

---

## 13. Apéndice: Matrices de Control y Cumplimiento

### 13.1. Controles Mínimos por Nivel

| Control                  | Desarrollo                  | Staging                   | Producción                                |
| ------------------------ | --------------------------- | ------------------------- | ----------------------------------------- |
| **SAST**                 | Requerido en cada PR        | Requerido en cada deploy  | Periódico (semanal)                       |
| **DAST**                 | Opcional                    | Requerido antes de deploy | Periódico (mensual)                       |
| **Contract tests**       | Requerido en cada PR        | Requerido en cada deploy  | Requerido en cada deploy                  |
| **PDP integration**      | Mock (simular C.R.O.W.N.)   | Staging (C.R.O.W.N. real) | Producción (C.R.O.W.N. real)              |
| **Auditoría**            | Logs locales (no inmutable) | Logs en DB (inmutable)    | Logs en almacén inmutable (hash chaining) |
| **Cifrado en reposo**    | Opcional (dev DB)           | Requerido                 | Requerido (KMS gestionado)                |
| **Rotación de secretos** | Manual (cada 6 meses)       | Automática (cada 90 días) | Automática (cada 90 días)                 |

### 13.2. Retención y Acceso a Auditoría

- **Retención mínima:** Configurable por regulación (ej. 7 años para SOX, 2 años para GDPR).
- **Acceso a auditoría:** Mediante roles con justificación (ej. Security Owner investiga incidente, SRE debuggea problema).
- **Registro de accesos:** Todo acceso a logs de auditoría se registra (quién, cuándo, por qué).

---

## 14. Glosario de Términos

| Término              | Definición                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **PDP**              | Policy Decision Point (C.R.O.W.N./A.R.G.U.S.). Servicio que evalúa políticas y emite decisiones de autorización.     |
| **PEP**              | Policy Enforcement Point (API Gateway / borde). Punto que consulta al PDP y aplica obligaciones.                     |
| **Decision_id**      | Identificador único de la decisión de política emitida por PDP. Rastreable en auditoría.                             |
| **Tenant**           | Entidad aislada de clientes/organizaciones. Cada tenant tiene sus propios datos, políticas, quotas.                  |
| **Idempotency-Key**  | Clave única (UUID) enviada por el cliente para garantizar idempotencia en mutaciones (evitar duplicados).            |
| **Audit Service**    | Almacén inmutable de decisiones y metadatos. Usa hash chaining para detectar tampering.                              |
| **Capability_flags** | Permisos granulares del sujeto (ej. `can_create_api_keys`, `can_access_audit_logs`).                                 |
| **Obligations**      | Acciones que el PEP debe aplicar (enmascarado, throttling, logging adicional) antes/durante/después de la operación. |
| **Schema_hash**      | Hash SHA-256 del esquema ejecutable. Usado para verificar consistencia de artefactos generados.                      |

---

## 15. Plantillas y Artefactos Listos para Integrar

### 15.1. Checklist de PR (YAML Ejemplo)

```yaml
# .github/workflows/pr-checklist.yaml
pr_checklist:
  schemas_executable_updated: true # Esquemas en src/lib/api-contracts.ts actualizados y versionados
  contract_tests_passed: true # Tests de forma de request/response verdes
  policy_owner_approval: true # Aprobación de Policy Owner si afecta políticas (C.R.O.W.N.)
  security_review: true # Revisión de Security Owner (SAST/DAST, rotación de secretos)
  changelog_added: true # Changelog actualizado con impacto (breaking changes, deprecaciones)
  telemetry_enabled: true # Métricas y logs añadidos para nuevos endpoints (latencia, errores)
  migration_guide_added: true # Guía de migración si es breaking change (nueva versión mayor)
  rollback_plan: true # Plan de rollback documentado (cómo revertir si hay problema)
  idempotency_tests_passed: true # Tests de idempotencia para mutaciones (POST, PUT, DELETE)
  tenant_isolation_tests_passed: true # Tests de aislamiento por tenant (tenant A no accede a datos de tenant B)
```

### 15.2. Runbook de Incidentes (Plantilla Markdown)

```markdown
# Runbook: [Nombre del Incidente]

## Título

[Incidente breve: ej. "PDP no responde", "Fuga de datos en logs"]

## Detección

- **Cómo se detectó:** [Alertas de latencia, reporte de usuario, scanner de seguridad]
- **Cuándo:** [Fecha/hora UTC]
- **Impacto inicial:** [Endpoints afectados, tenants afectados, error_rate]

## Impacto

- **Tenants afectados:** [Lista de tenant_ids o "todos"]
- **Endpoints afectados:** [Lista de endpoints: /api/v2/tenants, /api/v2/api-keys]
- **Duración:** [Desde detección hasta resolución]
- **Severidad:** [P0, P1, P2]

## Mitigación Inmediata

1. [Paso 1: ej. "Activar modo degradado con políticas de fallback"]
2. [Paso 2: ej. "Rechazar operaciones mutativas sensibles"]
3. [Paso 3: ej. "Rotar claves de cifrado de logs"]

## Escalada

- **Policy Owner:** [Nombre, email, Slack]
- **Security Owner:** [Nombre, email, Slack]
- **SRE:** [Nombre, email, Slack]
- **Comunicación a clientes:** [Plantilla de mensaje, canal: email, status page]

## Remediación

1. [Paso 1: ej. "Reproducir en staging con fixtures"]
2. [Paso 2: ej. "Aplicar parche en rama hotfix"]
3. [Paso 3: ej. "Desplegar con canary: 10% → 50% → 100%"]
4. [Paso 4: ej. "Ejecutar pruebas de contrato y autorización"]

## Post-Mortem

- **Causa raíz:** [Descripción detallada]
- **Acciones correctivas:** [Lista de acciones: parche, ajuste de políticas, capacitación]
- **Prevención futura:** [Mejoras: más tests, monitoreo adicional, documentación]
- **Responsables:** [Quién hace cada acción, fecha límite]
- **Fecha de cierre:** [Cuando todas las acciones estén completas]
```

### 15.3. OpenAPI Response Schema (Snippet YAML)

```yaml
# openapi/responses.yaml
components:
  schemas:
    Meta:
      type: object
      required:
        - request_id
        - api_version
      properties:
        request_id:
          type: string
          format: uuid
          description: ID único de la petición (correlación).
        trace_id:
          type: string
          format: uuid
          description: ID de traza distribuida (propagar si existe).
        decision_id:
          type: string
          description: ID de la decisión de política emitida por PDP.
        api_version:
          type: string
          description: Versión de la API usada (semver).
    Error:
      type: object
      required:
        - code
        - message
        - correlation_id
        - retryable
      properties:
        code:
          type: string
          description: Código de error estandarizado (ej. ISB_AUTH_INVALID_TOKEN).
        message:
          type: string
          description: Mensaje seguro para cliente (no filtrar detalles internos).
        correlation_id:
          type: string
          description: ID de correlación (request_id o trace_id).
        retryable:
          type: boolean
          description: Si el cliente puede reintentar la petición.
        details:
          type: object
          description: Detalles opcionales no sensibles (razón genérica, timestamps).
          additionalProperties: true
```

---

## 16. Recomendaciones Finales y Próximos Pasos

### 16.1. Implementación Inmediata

1. **Asegurar que `src/lib/api-contracts.ts` y los validadores runtime sean la única fuente de verdad.**
   - Eliminar cualquier validación hardcodeada en rutas.
   - Centralizar todos los esquemas en un módulo único.

2. **Integrar C.R.O.W.N./A.R.G.U.S. como PDP y exponer `decision_id` en `meta`.**
   - Cada respuesta debe incluir `decision_id` para trazabilidad.
   - Auditoría debe registrar `decision_id` para cada petición.

3. **Añadir contract tests en CI que fallen la build si OpenAPI/SDK no coincide con esquemas ejecutables.**
   - Script de generación CI que calcule `schema_hash` y compare con artefactos generados.
   - Fallar build si hay discrepancia.

4. **Implementar telemetría por etapa y tracing distribuido con `trace_id`.**
   - Métricas de latencia por etapa del pipeline.
   - Propagar `trace_id` en todas las llamadas internas.

5. **Publicar runbooks y checklist de PR en el repo.**
   - `.github/RUNBOOKS.md` con plantillas de incidentes.
   - `.github/PULL_REQUEST_TEMPLATE.md` con checklist YAML.

### 16.2. Próximos Artefactos que Puedo Generar

- ✅ **Checklist de PR en YAML (completo y parametrizable):** Con condiciones dinámicas (ej. si hay breaking change, requerir `migration_guide_added`).
- ✅ **Runbook de incidentes en Markdown con playbooks detallados:** Para cada tipo de incidente (PDP down, fuga de datos, rate limiting, etc.).
- ✅ **Plantillas OpenAPI con anotaciones `meta` y ejemplos de error:** Para copiar/pegar en nuevos endpoints.
- ✅ **Script de generación CI que valide `schema_hash` y falle la build si hay discrepancias:** En Node.js, Python o Bash.
- ✅ **Dashboard de monitoreo (Grafana/Datadog) con métricas clave:** Latencia por etapa, deny_rate, error_rate, cache_hit_rate.
- ✅ **Políticas de ejemplo para C.R.O.W.N./A.R.G.U.S.:** En JSON o lenguaje de políticas (Rego, Cedar).

---

## 17. Registro de Cambios (Changelog Inicial)

| Versión  | Fecha      | Cambios                                                                                                                                                                                                                                                       |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.0** | 2026-09-01 | Especificación inicial: pipeline inmutable, PDP centralizado, metadatos `meta`, vocabulario de errores, runbooks y checklist de PR.                                                                                                                           |
| **v1.1** | 2026-09-02 | Añadida telemetría por etapa, matrices de pruebas y plantillas OpenAPI.                                                                                                                                                                                       |
| **v1.2** | 2026-09-03 | Incorporación de controles de seguridad, cifrado y gobernanza de roles.                                                                                                                                                                                       |
| **v2.0** | 2026-09-04 | **Especificación ampliada:** gobernanza detallada, matrices de control por entorno, runbooks operativos completos, plantillas integrables (YAML, OpenAPI), controles de seguridad avanzados (SAST/DAST, rotación de secretos), telemetría con SLOs y alertas. |

---

## 18. Contactos y Gobernanza Operativa

| Rol                                      | Contacto (ejemplo)         | Responsabilidades                                                                                          |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Policy Owner (C.R.O.W.N./A.R.G.U.S.)** | `policy-owner@example.com` | Autoriza cambios en políticas, revisa decisiones de PDP, garantiza consistencia de políticas.              |
| **API Owner**                            | `api-owner@example.com`    | Cambios en esquemas ejecutables, versionado de APIs, documentación OpenAPI.                                |
| **Security Owner**                       | `security@example.com`     | Revisiones de seguridad (SAST/DAST), aprobación de cambios que afectan seguridad, respuesta a incidentes.  |
| **SRE/Platform**                         | `sre@example.com`          | Despliegue, observabilidad (métricas, logs, tracing), runbooks, respuesta a incidentes de infraestructura. |
| **Domain Owner**                         | `domain-owner@example.com` | Lógica de negocio, validación de salida, garantías de consistencia de datos.                               |

---

## 19. Licencia y Uso

Este documento es un **artefacto interno de gobernanza técnica**. Adáptalo a las políticas legales y de cumplimiento de tu organización antes de publicarlo externamente.

**Licencia sugerida:** CC BY-NC-SA 4.0 (atribución, no comercial, compartir igual).

---

**Fin del documento.**
