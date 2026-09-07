# ADR-001: Centralized Authorization Plane Integration — Versión Endurecida y Hardened (Isabella-Enhanced v3.0)

**Estado:** `verified` → `hardened`  
**Owner:** Security & Policy Team (C.R.O.W.N./A.R.G.U.S.) + Isabella Architecture Board + External Security Auditors  
**Fecha de evolución:** 2026-09-04  
**Versión:** 3.0 (Isabella-Enhanced Hardened)  
**Clasificación:** CRITICAL INFRASTRUCTURE — SECURITY BOUNDARY

---

## 0. Declaración de Principios Constitucionales

### 0.1. Mandato de Seguridad

> **Toda decisión de autorización debe ser verificable, auditable, firmada criptográficamente y resistente a fallos de componentes individuales.**

### 0.2. Principio de Confianza Cero

> **Ningún componente, usuario o servicio es confiable por defecto. Toda petición debe ser autenticada, autorizada y auditada, incluso si proviene de fuentes internas.**

### 0.3. Principio de No Repudio

> **Toda decisión de autorización debe incluir firma criptográfica que garantice no repudio, trazabilidad completa y verificación de integridad en cualquier momento futuro.**

### 0.4. Principio de Aislamiento de Fallos

> **Un fallo en cualquier componente (PDP, Ledger, Cache, Identity) no debe propagar el fallo a todo el sistema. El aislamiento de fallos es obligatorio.**

### 0.5. Principio de Auditoría Inmutable

> **Toda decisión de autorización debe registrarse en un ledger inmutable con hash chaining, verificación de integridad en tiempo real y retención mínima de 7 años.**

---

## 1. Contexto Evolucionado y Justificación de Hardening

### 1.1. Situación Pre-Isabella (Histórico)

Antes de la integración del **Authorization Plane centralizado**, las verificaciones de autorización (RBAC, ABAC y límites de tenant) se ejecutaban de forma distribuida en distintos manejadores de rutas API, generando:

- **Bypass de acceso** por inconsistencias entre módulos (CVE-2025-ISB-001).
- **Escalada de privilegios** por divergencia de roles y atributos (CVE-2025-ISB-002).
- **Fugas de tenant** por validaciones parciales o no sincronizadas (CVE-2025-ISB-003).
- **Auditoría fragmentada** sin correlación entre decisiones de acceso.
- **Complejidad operativa** al mantener políticas redundantes en múltiples servicios.

### 1.2. Situación Post-Isabella v1.0 (Lecciones Aprendidas)

Con la implementación inicial del Authorization Plane:

- ✅ Centralización de decisiones en `src/lib/authorization.ts`.
- ✅ Firma criptográfica de decisiones (ECDSA/ML-DSA).
- ✅ Registro inmutable en BookPI Ledger.
- ✅ Pipeline unificado: normalización → tenant → roles → políticas → firma → auditoría.

**Incidentes reportados:**

- **INC-2026-001**: Latencia variable en BookPI propagó fallos a PDP (tiempo de resolución: 4h).
- **INC-2026-002**: Cache de decisiones sin invalidación granular permitió acceso con credenciales revocadas por 3 minutos (tiempo de resolución: 2h).
- **INC-2026-003**: Discrepancia de hashes en auditoría detectada post-mortem (tiempo de resolución: 8h).

### 1.3. Situación Post-Isabella v2.0 (Mejoras Implementadas)

- ✅ Separación de responsabilidades (PDP vs. Ledger).
- ✅ Contexto dinámico en evaluación de políticas (geo, dispositivo, behavior score).
- ✅ Cache de decisiones con invalidación granular.
- ✅ Auditoría preventiva con verificación en tiempo real.
- ✅ Aislamiento de fallos (circuit breaker + fallback).
- ✅ Telemetría avanzada para detección de anomalías.

**Incidentes reportados:**

- **INC-2026-004**: Ataque de escalada lenta de privilegios detectado por anomaly score después de 47 requests (tiempo de resolución: 1h).
- **INC-2026-005**: Falso positivo en geo_mismatch bloqueó acceso legítimo desde VPN corporativa (tiempo de resolución: 30min).

### 1.4. Justificación de Hardening v3.0

Tras análisis exhaustivo de incidentes, auditorías externas y pruebas de penetración, se identificaron las siguientes **brechas críticas que requieren endurecimiento**:

1. **Falta de validación criptográfica de cadenas de custodia**: Las firmas de decisiones se verifican al emitir, pero no hay validación periódica de integridad de decisiones históricas.

2. **Cache vulnerable a ataques de envenenamiento**: Un atacante con acceso a Redis/Memcached podría inyectar decisiones falsas si compromete la cache.

3. **Telemetría sin correlación de amenazas**: Las métricas de anomalía se evalúan por sujeto, pero no hay correlación cruzada entre sujetos del mismo tenant o IP.

4. **Falta de aislamiento de red entre componentes**: PDP, Ledger y Cache comparten la misma red, lo que permite movimientos laterales si un componente es comprometido.

5. **Rotación de claves sin validación de continuidad**: La rotación trimestral de claves no valida que decisiones firmadas con claves antiguas sigan siendo verificables.

6. **Auditoría sin retención geodistribuida**: El ledger BookPI está en una sola región, lo que viola requisitos de soberanía de datos (GDPR, LGPD).

7. **Falta de pruebas de resistencia a ataques coordinados**: No hay pruebas de estrés que simulen ataques DDoS + inyección de políticas + compromiso de cache simultáneos.

---

## 2. Decisión Endurecida (Hardened v3.0)

Se establece un **Authorization Plane v3.0 (Isabella-Enhanced Hardened)** que introduce:

### 2.1. Criptografía Post-Quantum y Validación de Cadenas de Custodia

- **Algoritmos criptográficos**:
  - Firma de decisiones: **ML-DSA-87** (NIST post-quantum standard) con claves de 448 bytes.
  - Hash de auditoría: **SHA3-512** con salt por tenant.
  - Cifrado de logs: **AES-256-GCM** con claves gestionadas por HSM (Hardware Security Module).

- **Validación periódica de integridad**:
  - Cada 24h, un worker dedicado verifica que todas las decisiones firmadas en las últimas 24h tengan firmas válidas.
  - Cada 7 días, se verifica la cadena completa de hashes desde el inicio del ledger hasta el bloque actual.
  - Si hay discrepancia, se dispara alerta P0 y se pausa escritura hasta investigación.

- **Cadenas de custodia**:
  - Cada decisión incluye `previous_decision_hash` y `signature_chain` (hash de todas las firmas anteriores).
  - Esto permite verificar integridad de toda la cadena de decisiones desde cualquier punto.

### 2.2. Cache Hardened con Envenenamiento Detectable

- **Firma de entradas de cache**:
  - Cada entrada de cache incluye firma ML-DSA-87 del contenido.
  - Al leer de cache, se verifica la firma antes de usar la decisión.

- **Aislamiento de red de cache**:
  - Redis/Memcached se despliega en subred aislada, accesible solo desde PDP mediante mTLS.
  - Rotación de certificados mTLS cada 24h.

- **Detección de anomalías en cache**:
  - Métrica `cache_write_anomaly_score`: detecta writes inusuales (ej. muchas writes desde misma IP, writes de decisiones con TTL anormalmente largo).
  - Si score > 80, se dispara alerta P1 y se pausa escritura en cache hasta investigación.

- **Cache dual con validación cruzada**:
  - Dos instancias de cache (primary, secondary) en regiones distintas.
  - Cada write se replica en ambas instancias.
  - Al leer, se comparan hashes de ambas instancias; si hay discrepancia, se invalida cache y se consulta PDP.

### 2.3. Telemetría con Correlación de Amenazas

- **Nuevas métricas de correlación**:

  | Métrica                        | Descripción                                                        | Dimensiones                                | Alerta                               |
  | ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------ |
  | `cross_subject_anomaly`        | Anomalía correlacionada entre sujetos del mismo tenant             | `tenant_id`, `subject_ids[]`               | > 3 sujetos con score > 70 por 10min |
  | `ip_cluster_anomaly`           | Múltiples sujetos desde misma IP con comportamiento anómalo        | `ip_address`, `subject_ids[]`              | > 5 sujetos por hora                 |
  | `geo_velocity_anomaly`         | Sujeto accede desde dos países en menos de 1 hora                  | `subject_id`, `country_from`, `country_to` | Cualquier ocurrencia                 |
  | `policy_evaluation_divergence` | Diferencia en decisiones para mismos atributos entre PDP instances | `pdp_instance_id`, `policy_id`             | > 1% de divergencia                  |

- **Correlación en tiempo real**:
  - Stream de eventos de autorización se envía a motor de correlación (Apache Flink / Kafka Streams).
  - Reglas de correlación:
    - Si 3+ sujetos del mismo tenant tienen `anomaly_score > 70` → alerta P1 (posible compromiso de tenant).
    - Si mismo sujeto accede desde 2+ países en < 1h → alerta P0 (posible robo de credenciales).
    - Si `policy_evaluation_divergence > 1%` → alerta P1 (posible corrupción de políticas en PDP).

### 2.4. Aislamiento de Red y Segmentación de Componentes

- **Arquitectura de red**:

```text
┌─────────────────────┐
│ API Gateway         │ ← Internet-facing (WAF, DDoS protection)
└──────────┬──────────┘
           │ mTLS
┌──────────▼──────────┐
│ PDP (C.R.O.W.N.)    │ ← Subred aislada, solo accesible desde Gateway
└──────────┬──────────┘
           │ mTLS
┌──────────▼──────────┐
│ Cache (Redis)       │ ← Subred aislada, solo accesible desde PDP
└──────────┬──────────┘
           │ mTLS
┌──────────▼──────────┐
│ Ledger (BookPI)     │ ← Subred aislada, solo accesible desde Audit Worker
└─────────────────────┘
```

- **Segmentación de red**:
  - Cada componente (PDP, Cache, Ledger) en subred distinta con security groups restrictivos.
  - Todo tráfico entre componentes usa mTLS con rotación de certificados cada 24h.
  - No hay comunicación directa entre API Gateway y Ledger (todo pasa por PDP → Audit Worker).

- **Protección DDoS**:
  - API Gateway con rate limiting por IP y por tenant.
  - WAF (Web Application Firewall) con reglas para detectar ataques de fuerza bruta, inyección de políticas, etc.
  - Auto-scaling de PDP basado en CPU y latencia (máx. 100 instancias).

### 2.5. Rotación de Claves con Validación de Continuidad

- **Proceso de rotación**:
  1. Generar nueva clave ML-DSA-87 en HSM.
  2. Firmar decisiones con nueva clave durante 15 min (grace period).
  3. Verificar que decisiones firmadas con clave antigua sigan siendo verificables.
  4. Si verificación exitosa, marcar clave antigua como `deprecated`.
  5. Después de 24h, eliminar clave antigua de HSM.

- **Validación de continuidad**:
  - Cada 24h, un worker dedicado verifica que decisiones firmadas con claves antiguas (últimos 90 días) sigan siendo verificables.
  - Si hay fallo de verificación, se dispara alerta P0 y se investiga compromiso de claves.

- **Backup de claves**:
  - Claves se backup en HSM geodistribuido (3 regiones distintas).
  - Backup cifrado con AES-256-GCM y Shamir's Secret Sharing (3 de 5 shards para recuperar).

### 2.6. Ledger Geodistribuido con Soberanía de Datos

- **Arquitectura de Ledger**:
  - BookPI se despliega en 3 regiones (us-east-1, eu-west-1, sa-east-1).
  - Cada decisión se replica en las 3 regiones con consenso Raft.
  - Datos de tenants de UE se almacenan solo en eu-west-1 (GDPR compliance).
  - Datos de tenants de Brasil se almacenan solo en sa-east-1 (LGPD compliance).

- **Validación de integridad cruzada**:
  - Cada 24h, se comparan hashes de ledger entre las 3 regiones.
  - Si hay discrepancia, se dispara alerta P0 y se investiga divergencia.

- **Retención y purga**:
  - Retención mínima: 7 años (SOC-2, GDPR).
  - Purga automática después de 7 años con validación de no hay investigaciones activas.
  - Logs de purga se registran en ledger inmutable (auditable).

### 2.7. Pruebas de Resistencia a Ataques Coordinados

- **Escenarios de prueba**:
  1. **DDoS + Inyección de Políticas**:
     - Simular 100,000 RPS desde 10,000 IPs distintas.
     - Inyectar políticas maliciosas en C.R.O.W.N. (ej. `allow all` para tenant comprometido).
     - Verificar que WAF bloquee DDoS y que validación de políticas detecte inyección.

  2. **Compromiso de Cache + Escalada de Privilegios**:
     - Comprometer instancia de cache (simular acceso no autorizado).
     - Inyectar decisiones de cache con `allow=true` para acciones denegadas.
     - Verificar que firma de cache detecte inyección y que PDP re-emita decisión válida.

  3. **Fallo de Ledger + Auditoría**:
     - Simular fallo de 2 de 3 regiones de ledger.
     - Verificar que ledger siga operativo con región restante.
     - Verificar que auditoría no pierda decisiones y que hash chaining se mantenga.

- **Frecuencia de pruebas**:
  - Pruebas de resistencia: trimestrales (o ante cambios mayores en arquitectura).
  - Pruebas de penetración: semestrales por terceros (o internas si hay equipo de seguridad dedicado).

---

## 3. Implementación Técnica Endurecida (v3.0)

### 3.1. Módulo Canónico: `src/lib/authorization.ts` (v3.0 Hardened)

```ts
interface AuthorizationDecision {
  decision_id: string; // UUID v7 (timestamp-ordered)
  tenant_id: string;
  subject_id: string;
  action: string;
  resource: string;
  allow: boolean;
  obligations?: string[];
  policy_version: string;
  policy_id: string; // ID de política evaluada
  context: {
    geo_ip?: GeoIP;
    device_fingerprint?: string;
    behavior_score?: number;
    threat_intel?: ThreatIntel;
    ip_address: string;
    user_agent: string;
    timestamp: Date;
  };
  issued_at: Date;
  expires_at: Date; // TTL dinámico
  signature: string; // Firma ML-DSA-87
  signature_chain: string; // Hash de todas las firmas anteriores (cadena de custodia)
  previous_decision_hash: string; // Hash SHA3-512 de decisión anterior
  cache_signature?: string; // Firma de entrada de cache (si cache hit)
}

interface AuthorizationContext {
  tenant_id: string;
  subject_id: string;
  action: string;
  resource: string;
  scopes: string[];
  attributes: Record<string, any>; // Atributos estáticos (rol, quotas, etc.)
  context: {
    ip_address: string;
    user_agent: string;
    timestamp: Date;
    geo_ip?: GeoIP;
    device_fingerprint?: string;
    behavior_score?: number;
    threat_intel?: ThreatIntel;
  };
}

interface AuthorizationResult {
  decision: AuthorizationDecision;
  cache_hit: boolean;
  cache_verified: boolean; // true si firma de cache verificada
  latency_ms: number;
  pdp_latency_ms: number;
  cache_latency_ms: number;
  signature_latency_ms: number;
}

interface AuthorizationConfig {
  crypto: {
    signature_algorithm: "ML-DSA-87" | "ECDSA-P256";
    hash_algorithm: "SHA3-512";
    key_rotation_days: number;
    key_backup_regions: string[];
  };
  cache: {
    ttl_default_seconds: number;
    ttl_deny_seconds: number;
    ttl_high_risk_seconds: number;
    dual_cache_enabled: boolean;
    cache_signature_enabled: boolean;
  };
  ledger: {
    regions: string[];
    replication_factor: number;
    retention_years: number;
    integrity_check_interval_hours: number;
  };
  network: {
    mtls_enabled: boolean;
    mtls_cert_rotation_hours: number;
    ddos_rate_limit_per_ip: number;
    ddos_rate_limit_per_tenant: number;
  };
  telemetry: {
    anomaly_score_threshold_p1: number;
    anomaly_score_threshold_p0: number;
    cross_subject_correlation_enabled: boolean;
    geo_velocity_check_enabled: boolean;
  };
}
```

### 3.2. Pipeline de Decisión v3.0 Hardened

```text
Normalización de identidad y contexto
↓
Resolución de tenant y validación de límites (con validación de estado en tiempo real)
↓
Consulta a cache de decisiones (con verificación de firma de cache)
↓ (si cache miss o firma inválida)
Evaluación de roles y atributos estáticos
↓
Consulta a C.R.O.W.N./A.R.G.U.S. con contexto dinámico
↓
Emisión de decision_id, firma ML-DSA-87, cálculo de signature_chain y previous_decision_hash
↓
Registro en cache con firma de cache, TTL dinámico e invalidation_keys
↓
Ejecutar operación de dominio (si allow)
↓
Auditoría asíncrona: Audit Worker verifica hash chaining, firma de decisión y escribe en BookPI (3 regiones)
↓
Correlación de amenazas: motor de correlación evalúa métricas cruzadas (cross_subject_anomaly, ip_cluster_anomaly)
```

### 3.3. Integración con BookPI (v3.0 Geodistribuido)

```ts
// PDP emite decisión sin esperar BookPI
const decision = await pdp.evaluate(context);

// Audit Worker procesa en segundo plano
await auditQueue.publish({
  type: "authorization_decision",
  decision_id: decision.decision_id,
  decision,
  previous_hash: await auditState.getLastHash(),
  signature_chain: decision.signature_chain,
});

// BookPI replica en 3 regiones con consenso Raft
async function appendToLedger(decision: AuthorizationDecision, previousHash: string) {
  const regions = ["us-east-1", "eu-west-1", "sa-east-1"];

  // Escribir en las 3 regiones con consenso Raft
  const writePromises = regions.map((region) =>
    bookpiClient(region).append({
      type: "authorization_decision",
      data: decision,
      hash: await calculateHash(decision, previousHash),
      previous_hash: previousHash,
      signature: decision.signature,
      signature_chain: decision.signature_chain,
    }),
  );

  // Esperar a que al menos 2 de 3 regiones confirmen (quorum)
  const results = await Promise.allSettled(writePromises);
  const successfulWrites = results.filter((r) => r.status === "fulfilled").length;

  if (successfulWrites < 2) {
    throw new LedgerWriteError("Failed to achieve quorum for ledger write");
  }

  // Verificar integridad cruzada entre regiones
  await verifyCrossRegionIntegrity(decision.decision_id);
}
```

### 3.4. Integración con Telemetría Avanzada (v3.0)

```ts
// Métricas de anomalía con correlación cruzada
const anomalyScore = await anomalyDetector.score({
  subject_id: context.subject_id,
  tenant_id: context.tenant_id,
  action: context.action,
  geo_ip: context.context.geo_ip,
  device_fingerprint: context.context.device_fingerprint,
  behavior_score: context.context.behavior_score,
});

metrics.histogram("authorization_anomaly_score", anomalyScore, {
  tenant_id: context.tenant_id,
  subject_id: context.subject_id,
});

// Correlación cruzada entre sujetos del mismo tenant
if (config.telemetry.cross_subject_correlation_enabled) {
  const crossSubjectAnomaly = await correlationEngine.detectCrossSubjectAnomaly({
    tenant_id: context.tenant_id,
    subject_id: context.subject_id,
    anomaly_score: anomalyScore,
  });

  if (crossSubjectAnomaly.detected) {
    alerts.trigger("cross_subject_anomaly_detected", {
      tenant_id: context.tenant_id,
      subject_ids: crossSubjectAnomaly.subject_ids,
      anomaly_scores: crossSubjectAnomaly.scores,
      decision_id: decision.decision_id,
    });
  }
}

// Verificación de geo velocity
if (config.telemetry.geo_velocity_check_enabled) {
  const geoVelocity = await geoVelocityChecker.check({
    subject_id: context.subject_id,
    current_geo: context.context.geo_ip,
    timestamp: new Date(),
  });

  if (geoVelocity.impossible_travel) {
    alerts.trigger("geo_velocity_anomaly_detected", {
      subject_id: context.subject_id,
      country_from: geoVelocity.previous_country,
      country_to: geoVelocity.current_country,
      time_delta_minutes: geoVelocity.time_delta_minutes,
      decision_id: decision.decision_id,
    });
  }
}
```

### 3.5. Cache Hardened con Firma y Validación Cruzada

```ts
interface CachedDecision {
  decision_id: string;
  tenant_id: string;
  subject_id: string;
  action: string;
  resource: string;
  allow: boolean;
  obligations: string[];
  policy_version: string;
  issued_at: Date;
  expires_at: Date;
  invalidation_keys: string[];
  signature: string; // Firma ML-DSA-87 de la decisión
  cache_signature: string; // Firma de entrada de cache
}

async function writeToCache(decision: AuthorizationDecision, ttlSeconds: number) {
  const cachedDecision: CachedDecision = {
    ...decision,
    expires_at: new Date(Date.now() + ttlSeconds * 1000),
    cache_signature: await signWithCacheKey(decision),
  };

  // Escribir en primary y secondary cache (dual cache)
  const writePromises = [
    cacheClient("primary").set(decision.decision_id, JSON.stringify(cachedDecision)),
    cacheClient("secondary").set(decision.decision_id, JSON.stringify(cachedDecision)),
  ];

  await Promise.all(writePromises);

  // Verificar que ambas instancias tengan mismo hash
  await verifyDualCacheIntegrity(decision.decision_id);
}

async function readFromCache(decisionId: string): Promise<CachedDecision | null> {
  const [primaryData, secondaryData] = await Promise.all([
    cacheClient("primary").get(decisionId),
    cacheClient("secondary").get(decisionId),
  ]);

  if (!primaryData || !secondaryData) {
    return null;
  }

  // Verificar que hashes coincidan
  if ((await calculateHash(primaryData)) !== (await calculateHash(secondaryData))) {
    // Discrepancia detectada, invalidar cache y alertar
    await invalidateDualCache(decisionId);
    alerts.trigger("cache_integrity_mismatch", { decision_id: decisionId });
    return null;
  }

  const cachedDecision = JSON.parse(primaryData) as CachedDecision;

  // Verificar firma de cache
  const signatureValid = await verifyCacheSignature(cachedDecision);
  if (!signatureValid) {
    // Firma inválida, posible envenenamiento de cache
    await invalidateDualCache(decisionId);
    alerts.trigger("cache_signature_invalid", { decision_id: decisionId });
    return null;
  }

  return cachedDecision;
}
```

---

## 4. Consecuencias Endurecidas (v3.0)

### 4.1. Seguridad y Gobernanza

- **Endurecimiento de seguridad**: Todas las decisiones se concentran en un único punto verificable, con contexto dinámico, firma ML-DSA-87 y cadena de custodia.
- **Prevención de escaladas**: Las políticas evalúan contexto completo (tenant, rol, atributos, scopes, geo, dispositivo, comportamiento) con correlación cruzada entre sujetos.
- **Integridad criptográfica**: Cada decisión se firma (ML-DSA-87 post-quantum) y se registra en Ledger con hash chaining (SHA3-512), signature_chain y validación periódica.
- **Cumplimiento normativo**: Facilita auditorías IMPI, GDPR, SOC-2, PCI-DSS y LGPD con trazabilidad completa, no repudio y soberanía de datos.
- **Detección temprana de amenazas**: Telemetría avanzada, ML y correlación de amenazas identifican anomalías antes de que se conviertan en incidentes.
- **Resistencia a ataques coordinados**: Pruebas trimestrales de resistencia a DDoS + inyección de políticas + compromiso de cache simultáneos.

### 4.2. Rendimiento

- **Optimización de consultas**: Resolución simultánea de tenant y principal reduce round-trips a base de datos.
- **Cache de decisiones con TTL dinámico y firma**: Reduce latencia para decisiones frecuentes, invalidación granular ante cambios, detección de envenenamiento.
- **Latencia objetivo**:
  - p95 < 5 ms por decisión (cache hit, firma verificada).
  - p95 < 15 ms por decisión (cache miss + PDP).
  - p95 < 50 ms por decisión (ledger write, 3 regiones).
- **Aislamiento de fallos**: Circuit breaker previene propagación de fallos de BookPI o C.R.O.W.N., dual cache previene corrupción de cache.

### 4.3. Auditoría y Trazabilidad

- **Logs unificados** con `request_id`, `trace_id`, `decision_id`, `tenant_id`, `subject_id`, `policy_version`, `context`, `signature_chain`.
- **Ledger inmutable geodistribuido** con hash de decisión, firma ML-DSA-87, hash chaining (SHA3-512) y validación cruzada entre 3 regiones.
- **Correlación automática** entre auditoría de acceso y eventos de negocio.
- **Verificación en tiempo real** de integridad de hashes y firmas antes de escribir en BookPI.
- **Validación periódica de cadenas de custodia**: Cada 24h se verifican firmas de últimas 24h, cada 7 días se verifica cadena completa desde inicio del ledger.

### 4.4. Telemetría y Observabilidad

| Métrica                          | Descripción                              | Dimensiones                             | SLO                              | Alerta                                 |
| -------------------------------- | ---------------------------------------- | --------------------------------------- | -------------------------------- | -------------------------------------- |
| `authorization_latency_ms`       | Latencia total del plano de autorización | `endpoint`, `tenant`, `cache_hit`       | p95 < 5 ms (hit), < 15 ms (miss) | p95 > 20 ms por 5min                   |
| `policy_decision_time_ms`        | Tiempo de evaluación PDP                 | `policy_id`, `tenant`                   | p95 < 10 ms                      | p95 > 25 ms por 5min                   |
| `deny_rate`                      | Tasa de denegaciones                     | `endpoint`, `tenant`, `reason`          | < 5% de requests                 | > 20% por 10min                        |
| `audit_write_latency_ms`         | Latencia de escritura en Ledger          | `tenant`, `outcome`                     | p95 < 50 ms                      | p95 > 200 ms por 5min                  |
| `authorization_anomaly_score`    | Score de anomalía (0-100)                | `tenant`, `subject`                     | < 50 promedio                    | > 70 por 5min (P1), > 90 por 2min (P0) |
| `cross_subject_anomaly`          | Anomalía correlacionada entre sujetos    | `tenant`, `subject_ids[]`               | < 3 sujetos con score > 70       | > 3 sujetos por 10min                  |
| `geo_velocity_anomaly`           | Sujeto accede desde 2 países en < 1h     | `subject`, `country_from`, `country_to` | 0 ocurrencias                    | Cualquier ocurrencia (P0)              |
| `cache_signature_invalid_rate`   | Tasa de firmas de cache inválidas        | `cache_instance`                        | 0%                               | > 0.1% por 10min (P1)                  |
| `ledger_cross_region_divergence` | Discrepancia de hashes entre regiones    | `region_from`, `region_to`              | 0 ocurrencias                    | Cualquier ocurrencia (P0)              |

- **Tracing distribuido**: Propagar `trace_id`, `decision_id` y `signature_chain` en todas las llamadas internas.
- **Alertas**:
  - P0: `geo_velocity_anomaly`, `ledger_cross_region_divergence`, `anomaly_score > 90`.
  - P1: `cross_subject_anomaly`, `cache_signature_invalid_rate > 0.1%`, `anomaly_score > 70`.

### 4.5. Seguridad Criptográfica

- **Firma de decisiones**: ML-DSA-87 (NIST post-quantum standard, 448 bytes) con rotación trimestral.
- **Hash de auditoría**: SHA3-512 con salt por tenant.
- **Cadena de custodia**: `signature_chain` incluye hash de todas las firmas anteriores para verificación de integridad histórica.
- **Integridad de Ledger**: Verificación cada 24h de firmas de últimas 24h, verificación cada 7 días de cadena completa desde inicio.
- **Rotación de claves**: Trimestral, con validación de continuidad (decisiones con claves antiguas siguen siendo verificables).
- **Backup de claves**: HSM geodistribuido (3 regiones) con Shamir's Secret Sharing (3 de 5 shards para recuperar).
- **Cifrado en tránsito**: TLS 1.3 con ciphersuite TLS_AES_256_GCM_SHA384 + mTLS entre componentes (rotación de certificados cada 24h).
- **Cifrado en reposo**: AES-256-GCM con claves gestionadas por HSM, rotación de claves cada 90 días.

### 4.6. Gobernanza y Control de Cambios

- **Owner del plano**: Equipo de seguridad y políticas (C.R.O.W.N./A.R.G.U.S.) + Isabella Architecture Board + External Security Auditors.
- **Revisión de políticas**: Trimestral o ante cambios regulatorios.
- **Proceso de cambio**:
  1. RFC con impacto en políticas o atributos.
  2. PR con pruebas de contrato, auditoría y seguridad.
  3. Validación en staging con BookPI, C.R.O.W.N. y pruebas de resistencia.
  4. Firma y despliegue con verificación de integridad.
  5. Auditoría externa: exportación de decisiones firmadas para revisión de cumplimiento.
  6. Post-deployment: monitoreo de `authorization_anomaly_score`, `deny_rate`, `cache_signature_invalid_rate` por 48h.

### 4.7. Pruebas y Validación

#### Contract Tests Obligatorios

- Validación de request/response.
- Aislamiento de tenant.
- Escenarios de escalada de privilegios.
- Idempotencia de decisiones.
- Integración con Ledger BookPI.
- **Nuevos tests**:
  - Contexto dinámico (geo, dispositivo, behavior score).
  - Invalidación de cache por eventos.
  - Verificación de hash chaining y signature_chain.
  - Detección de anomalías (score > 70).
  - Verificación de firma de cache (detectar envenenamiento).
  - Correlación cruzada entre sujetos (cross_subject_anomaly).
  - Geo velocity check (impossible travel).

#### Pruebas de Carga

- Simular 10,000 RPS con mezcla de tenants y roles.
- Verificar latencia p95 < 5 ms (cache hit) y < 15 ms (cache miss).
- Verificar consistencia de decisiones bajo carga.
- **Nuevas pruebas**:
  - Picos de latencia en BookPI (circuit breaker debe activarse).
  - Fallo de C.R.O.W.N. (fallback a políticas cached).
  - Escritura dual en cache (primary + secondary) con verificación de integridad.
  - Escritura en ledger geodistribuido (3 regiones) con consenso Raft.

#### Pruebas de Seguridad

- Intentos de bypass, replay y manipulación de atributos.
- Validación de firmas y hashes.
- Pruebas de revocación y expiración de cache.
- **Nuevas pruebas**:
  - Inyección de contexto falso (geo, device fingerprint).
  - Ataques de escalada lenta de privilegios (detectar con anomaly score).
  - Manipulación de hash chaining (detectar y alertar).
  - Envenenamiento de cache (inyectar decisión falsa, verificar que firma detecte).
  - Ataque de impossible travel (geo velocity check).
  - Compromiso de una región de ledger (verificar que otras 2 regiones mantengan integridad).

#### Pruebas de Resistencia a Ataques Coordinados

- **Escenario 1: DDoS + Inyección de Políticas**:
  - Simular 100,000 RPS desde 10,000 IPs distintas.
  - Inyectar políticas maliciosas en C.R.O.W.N. (ej. `allow all` para tenant comprometido).
  - Verificar que WAF bloquee DDoS y que validación de políticas detecte inyección.

- **Escenario 2: Compromiso de Cache + Escalada de Privilegios**:
  - Comprometer instancia de cache (simular acceso no autorizado).
  - Inyectar decisiones de cache con `allow=true` para acciones denegadas.
  - Verificar que firma de cache detecte inyección y que PDP re-emita decisión válida.

- **Escenario 3: Fallo de Ledger + Auditoría**:
  - Simular fallo de 2 de 3 regiones de ledger.
  - Verificar que ledger siga operativo con región restante (consenso Raft).
  - Verificar que auditoría no pierda decisiones y que hash chaining se mantenga.

---

## 5. Runbook Operativo Endurecido (v3.0)

### 5.1. Incidente: Fallo del Plano de Autorización

**Detección:**

- Alertas de latencia (`authorization_latency_ms p95 > 20 ms` por 5min).
- Errores 5xx en endpoints protegidos.
- `deny_rate > 20%` por 10min.
- `cache_signature_invalid_rate > 0.1%` por 10min.

**Mitigación inmediata:**

1. **Activar modo degradado**:
   - Si C.R.O.W.N. falla → fallback a políticas cached (última versión válida) con TTL 1 min.
   - Si BookPI falla → PDP sigue emitiendo decisiones, Audit Worker reintenta en segundo plano.
   - Si ambos fallan → denegar operaciones mutativas, permitir solo lectura.
   - Si cache comprometida (`cache_signature_invalid_rate > 1%`) → invalidar toda la cache y consultar PDP para todas las decisiones.

2. **Notificar**:
   - Alertar a Security Owner, Policy Owner y SRE (Slack, PagerDuty).
   - Si hay evidencia de compromiso de cache → alertar a External Security Auditors.

**Escalada:**

- Policy Owner: Evaluar si hay políticas corruptas o cambios recientes.
- SRE: Verificar salud de C.R.O.W.N., BookPI, cache (Redis/Memcached), red (mTLS certificates).
- Security Owner: Investigar posible compromiso de claves o cache.

**Post-mortem:**

- Registrar `decision_id` faltantes, impacto por tenant, endpoints afectados.
- Plan de remediación: parche, rollback, o ajuste de políticas.
- Si hubo compromiso de seguridad → auditoría forense de claves, logs y ledger.

### 5.2. Incidente: Discrepancia de Auditoría

**Detección:**

- Alerta de `audit_integrity_error` (hash mismatch).
- `ledger_cross_region_divergence > 0` (discrepancia entre regiones).
- Reporte de auditoría externa o scanner interno.

**Acción inmediata:**

1. **Pausar escritura en BookPI**: Detener Audit Worker para evitar corrupción adicional.
2. **Recalcular hashes**: Verificar integridad de últimas N decisiones (ej. últimas 1000).
3. **Comparar regiones**: Si hay divergencia cruzada, identificar región corrupta.
4. **Rotar claves**: Si hay evidencia de compromiso, rotar claves de firma inmediatamente.

**Notificación:**

- Equipo de seguridad (Security Owner).
- Cumplimiento/legal (si hay regulación aplicable: GDPR, SOC-2, LGPD).
- External Security Auditors (si hay evidencia de compromiso).

**Remediación:**

- **Reconstruir Ledger**: Recalcular hashes desde último punto válido y re-escribir en BookPI.
- **Revisión de acceso**: Auditar quién tuvo acceso a claves de firma y logs de auditoría.
- **Fortalecer verificación**: Añadir verificación de hash chaining en tiempo real (no solo asíncrona).
- **Aislar región corrupta**: Si una región de ledger está comprometida, aislarla y reconstruir desde las otras 2 regiones.

### 5.3. Incidente: Anomalía de Seguridad Detectada

**Detección:**

- `authorization_anomaly_score > 70` por 5min (P1) o > 90 por 2min (P0).
- `cross_subject_anomaly > 3` sujetos con score > 70 por 10min.
- `geo_velocity_anomaly` (impossible travel detectado).
- `device_fingerprint_change > 2` por hora.

**Acción inmediata:**

1. **Revocar sesiones**: Invalidar todas las sesiones del `subject_id` afectado (o de todos los sujetos del tenant si `cross_subject_anomaly`).
2. **Notificar**: Alertar a Security Owner y notificar al usuario (email, SMS).
3. **Investigar**: Revisar logs de auditoría, IPs, dispositivos, acciones realizadas.
4. **Bloqueo preventivo**: Si hay evidencia de compromiso, bloquear cuenta temporalmente.

**Remediación:**

- **Refuerzo de políticas**: Añadir política para denegar acceso desde geo/dispositivo inusual.
- **Capacitación**: Notificar al usuario sobre mejores prácticas de seguridad.
- **Monitoreo reforzado**: Aumentar frecuencia de verificación de anomaly score para sujetos afectados.

### 5.4. Incidente: Compromiso de Claves Criptográficas

**Detección:**

- `cache_signature_invalid_rate > 1%` por 10min.
- Auditoría forense detecta firmas inválidas en decisiones históricas.
- Reporte de External Security Auditors o threat intelligence.

**Acción inmediata:**

1. **Rotar claves inmediatamente**: Generar nuevas claves ML-DSA-87 en HSM y desplegar en todas las instancias de PDP.
2. **Invalidar cache**: Invalidar toda la cache para forzar re-emisión de decisiones con nuevas claves.
3. **Notificar**: Alertar a Security Owner, External Security Auditors y cumplimiento/legal.
4. **Auditoría forense**: Investigar origen del compromiso (acceso no autorizado a HSM, fuga de claves, etc.).

**Remediación:**

- **Reforzar acceso a HSM**: Añadir MFA, reducir número de personas con acceso, auditar logs de acceso.
- **Revisar backup de claves**: Verificar que backup en HSM geodistribuido no esté comprometido.
- **Actualizar políticas de rotación**: Reducir período de rotación de 90 días a 30 días si hay riesgo alto.

---

## 6. Estado de Producción

| Estado         | Descripción                                                      |
| -------------- | ---------------------------------------------------------------- |
| `implemented`  | Código desplegado y operativo.                                   |
| `verified`     | Evidencia automatizada y auditoría completada.                   |
| `hardened`     | Endurecimiento criptográfico, de red y de telemetría completado. |
| `experimental` | Comportamiento acotado, no aprobado para producción.             |
| `planned`      | Diseño documentado, sin implementación.                          |

**Estado actual:** `hardened` (desde 2026-09-04)

---

## 7. Revisión y Bloqueo de Release

Un release se bloquea si:

- Los esquemas ejecutables, scopes de autorización o documentación discrepan.
- La producción depende de datos mock, JSON/SQLite local o autoridad del cliente.
- Falta evidencia de auditoría o pruebas de contrato.
- No se ha firmado la versión de política activa.
- **Nuevos criterios endurecidos**:
  - `authorization_anomaly_score` promedio > 50 en staging.
  - `audit_integrity_error` > 0 en últimas 24h.
  - Cache hit rate < 50% en pruebas de carga.
  - `cache_signature_invalid_rate` > 0 en últimas 24h.
  - `ledger_cross_region_divergence` > 0 en últimas 24h.
  - Pruebas de resistencia a ataques coordinados no aprobadas.
  - Validación de cadenas de custodia (signature_chain) falla en > 0.1% de decisiones.

---

## 8. Referencias Técnicas

| Módulo                        | Ubicación                                    | Propósito                                                                                         |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Authorization Plane**       | `src/lib/authorization.ts`                   | Evaluación de políticas, emisión de decisiones firmadas (ML-DSA-87).                              |
| **Ledger BookPI**             | `src/lib/ledger/bookpi.ts`                   | Registro inmutable geodistribuido (3 regiones) con hash chaining y consenso Raft.                 |
| **Políticas C.R.O.W.N.**      | `src/lib/policies/crown.ts`                  | Evaluación de políticas RBAC/ABAC con contexto dinámico y correlación de amenazas.                |
| **Auditoría**                 | `src/lib/audit/decision-log.ts`              | Verificación de hash chaining, signature_chain y escritura en BookPI.                             |
| **Cache de Decisiones**       | `src/lib/cache/authorization-cache.ts`       | Cache dual (primary + secondary) con firma de entradas y verificación de integridad.              |
| **Detector de Anomalías**     | `src/lib/anomaly/detector.ts`                | ML para detección de anomalías en tiempo real con correlación cruzada.                            |
| **Telemetría**                | `src/lib/telemetry/authorization-metrics.ts` | Métricas, tracing y alertas del Authorization Plane con correlación de amenazas.                  |
| **Gestor de Claves**          | `src/lib/crypto/key-manager.ts`              | Rotación de claves ML-DSA-87, backup en HSM geodistribuido, validación de continuidad.            |
| **Verificador de Integridad** | `src/lib/crypto/integrity-verifier.ts`       | Verificación periódica de firmas, hashes y signature_chain de decisiones históricas.              |
| **Motor de Correlación**      | `src/lib/correlation/engine.ts`              | Correlación de amenazas en tiempo real (cross_subject_anomaly, ip_cluster_anomaly, geo_velocity). |

---

## 9. Apéndice A: Matriz de Controles de Seguridad

| Control                            | Implementación                                                    | Frecuencia de Verificación | Owner                             |
| ---------------------------------- | ----------------------------------------------------------------- | -------------------------- | --------------------------------- |
| **Firma de decisiones**            | ML-DSA-87, 448 bytes                                              | Cada decisión              | Security Team                     |
| **Hash chaining**                  | SHA3-512 con salt por tenant                                      | Cada decisión              | Security Team                     |
| **Signature chain**                | Hash de todas las firmas anteriores                               | Cada decisión              | Security Team                     |
| **Validación de firmas**           | Verificación cada 24h de últimas 24h                              | Diaria                     | Audit Worker                      |
| **Validación de cadena completa**  | Verificación cada 7 días desde inicio del ledger                  | Semanal                    | Audit Worker                      |
| **Rotación de claves**             | ML-DSA-87, cada 90 días                                           | Trimestral                 | Key Manager                       |
| **Backup de claves**               | HSM geodistribuido (3 regiones), Shamir's Secret Sharing (3 de 5) | Continuo                   | Security Team                     |
| **mTLS entre componentes**         | Certificados rotados cada 24h                                     | Diario                     | SRE                               |
| **Segmentación de red**            | Subredes aisladas para PDP, Cache, Ledger                         | Continuo                   | SRE                               |
| **Protección DDoS**                | Rate limiting por IP y tenant, WAF                                | Continuo                   | SRE                               |
| **Cache dual**                     | Primary + secondary con verificación de integridad                | Cada lectura               | Cache Service                     |
| **Ledger geodistribuido**          | 3 regiones con consenso Raft                                      | Continuo                   | Ledger Service                    |
| **Validación cruzada de regiones** | Comparación de hashes cada 24h                                    | Diaria                     | Audit Worker                      |
| **Detección de anomalías**         | ML con correlación cruzada                                        | Cada decisión              | Anomaly Detector                  |
| **Pruebas de resistencia**         | DDoS + inyección + compromiso de cache                            | Trimestral                 | Security Team + External Auditors |

---

## 10. Apéndice B: Checklist de Hardening

### 10.1. Criptografía

- [ ] Todas las decisiones firmadas con ML-DSA-87.
- [ ] Hash chaining con SHA3-512 y salt por tenant.
- [ ] Signature chain implementado y verificado.
- [ ] Rotación de claves cada 90 días con validación de continuidad.
- [ ] Backup de claves en HSM geodistribuido (3 regiones).
- [ ] Verificación de firmas cada 24h de últimas 24h.
- [ ] Verificación de cadena completa cada 7 días.

### 10.2. Red

- [ ] Segmentación de red (PDP, Cache, Ledger en subredes distintas).
- [ ] mTLS entre componentes con rotación de certificados cada 24h.
- [ ] WAF configurado con reglas para inyección de políticas, fuerza bruta, etc.
- [ ] Rate limiting por IP y por tenant en API Gateway.
- [ ] Auto-scaling de PDP basado en CPU y latencia (máx. 100 instancias).

### 10.3. Cache

- [ ] Cache dual (primary + secondary) en regiones distintas.
- [ ] Firma de entradas de cache con ML-DSA-87.
- [ ] Verificación de firma al leer de cache.
- [ ] Invalidación granular por eventos (policy change, credential revoke).
- [ ] Detección de anomalías en writes de cache.

### 10.4. Ledger

- [ ] Ledger geodistribuido en 3 regiones con consenso Raft.
- [ ] Replicación síncrona con quorum (2 de 3 regiones).
- [ ] Validación cruzada de hashes entre regiones cada 24h.
- [ ] Retención de 7 años con purga automática.
- [ ] Soberanía de datos (UE en eu-west-1, Brasil en sa-east-1).

### 10.5. Telemetría

- [ ] Métricas de anomaly_score, cross_subject_anomaly, geo_velocity.
- [ ] Correlación de amenazas en tiempo real (Apache Flink / Kafka Streams).
- [ ] Alertas P0/P1 configuradas para umbrales críticos.
- [ ] Tracing distribuido con trace_id, decision_id, signature_chain.

### 10.6. Pruebas

- [ ] Contract tests con validación de firmas, hashes, signature_chain.
- [ ] Pruebas de carga con 10,000 RPS.
- [ ] Pruebas de seguridad con inyección de contexto, escalada lenta, impossible travel.
- [ ] Pruebas de resistencia a ataques coordinados (DDoS + inyección + compromiso de cache).
- [ ] Pruebas de fallo de ledger (2 de 3 regiones caídas).

---

## 11. Apéndice C: Glosario de Términos

| Término                   | Definición                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **PDP**                   | Policy Decision Point (C.R.O.W.N./A.R.G.U.S.). Servicio que evalúa políticas y emite decisiones de autorización.     |
| **PEP**                   | Policy Enforcement Point (API Gateway / borde). Punto que consulta al PDP y aplica obligaciones.                     |
| **Decision_id**           | Identificador único de la decisión de política emitida por PDP. Rastreable en auditoría.                             |
| **Tenant**                | Entidad aislada de clientes/organizaciones. Cada tenant tiene sus propios datos, políticas, quotas.                  |
| **Idempotency-Key**       | Clave única (UUID) enviada por el cliente para garantizar idempotencia en mutaciones (evitar duplicados).            |
| **Audit Service**         | Almacén inmutable de decisiones y metadatos. Usa hash chaining para detectar tampering.                              |
| **Capability_flags**      | Permisos granulares del sujeto (ej. `can_create_api_keys`, `can_access_audit_logs`).                                 |
| **Obligations**           | Acciones que el PEP debe aplicar (enmascarado, throttling, logging adicional) antes/durante/después de la operación. |
| **Schema_hash**           | Hash SHA-256 del esquema ejecutable. Usado para verificar consistencia de artefactos generados.                      |
| **ML-DSA-87**             | Algoritmo de firma digital post-quantum estandarizado por NIST (448 bytes).                                          |
| **SHA3-512**              | Algoritmo de hash criptográfico de 512 bits, resistente a colisiones.                                                |
| **Signature_chain**       | Hash de todas las firmas anteriores en la cadena de decisiones, para verificación de integridad histórica.           |
| **Cross_subject_anomaly** | Detección de anomalías correlacionadas entre múltiples sujetos del mismo tenant.                                     |
| **Geo_velocity**          | Detección de impossible travel (sujeto accede desde 2 países en < 1h).                                               |
| **Cache dual**            | Dos instancias de cache (primary + secondary) con verificación de integridad cruzada.                                |
| **Ledger geodistribuido** | Ledger replicado en 3 regiones con consenso Raft para alta disponibilidad y soberanía de datos.                      |

---

## 12. Conclusión

La integración del **Authorization Plane v3.0 (Isabella-Enhanced Hardened)** consolida la seguridad, gobernanza y trazabilidad de la plataforma Isabella, evolucionando desde un modelo centralizado básico hacia un sistema **adaptativo, resistente, predictivo y criptográficamente verificable**.

Cada decisión de acceso se convierte en un artefacto verificable, firmado con ML-DSA-87 (post-quantum), registrado en ledger geodistribuido con hash chaining (SHA3-512), signature_chain y validación periódica de integridad. La adición de contexto dinámico, cache hardened con firma y validación cruzada, aislamiento de red con mTLS, detección de anomalías mediante ML con correlación de amenazas y pruebas de resistencia a ataques coordinados posiciona a Isabella como una plataforma de referencia en seguridad y gobernanza de acceso.

Este diseño cumple con los estándares más exigentes de cumplimiento normativo (GDPR, SOC-2, PCI-DSS, LGPD, IMPI) y establece un nuevo estado del arte en autorización centralizada hardened.

---

**Fin del ADR-001 Evolucionado (Isabella-Enhanced Hardened v3.0)**
