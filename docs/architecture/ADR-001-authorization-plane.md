# ADR-001: Plano Centralizado de Autorización

> **Nombre:** Centralized Authorization Plane Integration  
> **Estado:** Propuesto para implementación progresiva; no declarar `hardened` hasta reunir evidencia verificable  
> **Versión del documento:** 4.0.0  
> **Clasificación:** Infraestructura crítica — límite de seguridad  
> **Propietarios:** Security & Policy, Architecture Board, SRE/Platform, Domain Owners  
> **Ubicación:** `docs/architecture/ADR-001-authorization-plane.md`  
> **Última revisión:** 2026-09-18

## Decisión

Isabella AI Genesis DEBE concentrar las decisiones de autorización en un **Policy Decision Point (PDP)** explícito, con puntos de aplicación (**PEP**) en cada borde de ejecución. Las rutas, workers y adaptadores de dominio NO DEBEN implementar reglas de autorización independientes ni tomar decisiones a partir de atributos controlados por el cliente.

El plano se implementará de forma incremental: primero autorización consistente, aislamiento de tenant, auditoría correlacionable y controles de fallo seguro; después integridad criptográfica, caché verificable, correlación de amenazas y, únicamente si el modelo de riesgo y la capacidad operativa lo justifican, replicación geodistribuida y criptografía post-cuántica.

## Estado y evidencia

Los términos `implemented`, `verified` y `hardened` son estados de evidencia, no etiquetas de marketing. El ADR empieza en estado **propuesto** hasta que cada control cuente con código desplegado, pruebas automatizadas, configuración revisada y evidencia de operación.

| Estado | Definición | Evidencia mínima |
|---|---|---|
| `planned` | Diseño aceptado, sin código operativo | ADR aprobado y backlog priorizado |
| `experimental` | Implementación acotada fuera de producción | Threat model, entorno aislado y rollback |
| `implemented` | Código desplegado y configurado | PR, despliegue y pruebas básicas exitosas |
| `verified` | Control corroborado de forma independiente | Pruebas automatizadas, revisión de seguridad y evidencia de operación |
| `hardened` | Control resistente ante amenazas definidas | Threat model, pruebas de abuso, runbook, monitoreo y ejercicio de recuperación |

No se deben registrar CVE, incidentes, auditorías externas o cumplimiento regulatorio como hechos sin tickets, informes o referencias verificables. Los identificadores históricos contenidos en borradores anteriores se consideran **hipótesis de riesgo** hasta ser validados por Security.

## Contexto

La autorización distribuida entre manejadores API produce divergencia de RBAC/ABAC, controles de tenant inconsistentes, dificultad de revocación y auditoría fragmentada. Centralizar la decisión permite aplicar una política uniforme, registrar la evidencia asociada y establecer un modo de fallo coherente.

El diseño reconoce cuatro fallos a evitar: decisión no autorizada por datos del cliente, acceso entre tenants, reutilización de una decisión revocada en caché y pérdida o alteración de evidencia de auditoría. La mitigación prioritaria es la consistencia de autorización; los mecanismos criptográficos avanzados no reemplazan validación de identidad, aislamiento de datos ni pruebas negativas.

## Principios

- **Confianza cero:** toda llamada, incluida una llamada interna, DEBE autenticarse, autorizarse y producir telemetría correlacionable.
- **Deny by default:** si faltan identidad verificable, tenant, política aplicable, obligación exigible o dependencia crítica para una acción sensible, el PEP DEBE denegar.
- **Autoridad interna:** `tenant_id`, scopes, precios, roles, claims enriquecidos, geolocalización y scores proporcionados por cliente son señales no confiables hasta su validación por una fuente interna.
- **Decisión como dato:** cada decisión DEBE ser inmutable, versionada, correlacionable y apta para auditoría.
- **Separación de deberes:** PDP decide; PEP aplica; dominio ejecuta; auditoría registra; key management protege claves. Ningún componente DEBE asumir por sí solo todos esos roles.
- **Minimización:** logs, decisiones y señales de riesgo DEBEN contener solamente los atributos necesarios y respetar clasificación, retención y residencia aprobadas.
- **Degradación segura:** la caída de caché, ledger o motor de correlación NO DEBE transformarse en permiso implícito.

## Alcance

Este ADR cubre decisiones de autorización para APIs HTTP, workers, jobs, herramientas internas y operaciones de datos sensibles. Cubre autenticación de servicio a servicio, resolución de tenant, evaluación de políticas, obligaciones, caché, auditoría, telemetría, gestión de claves y respuesta a incidentes.

Quedan fuera de alcance el diseño de autenticación de usuarios, la política legal de privacidad, la definición comercial de planes y cuotas, y el protocolo LSP/JSON-RPC. El fragmento de *LSP JSON-RPC 2.0 framer* recibido con el material fuente pertenece a otra responsabilidad (`agent.lsp.protocol`) y NO DEBE incorporarse al plano de autorización, salvo que un servidor LSP se integre posteriormente como recurso protegido mediante PEP/PDP.

## Arquitectura objetivo

```text
Cliente / Servicio / Worker
          |
          v
API Gateway / PEP ── WAF, rate limit, normalización, correlación
          |
          | mTLS / identidad de workload
          v
Identity + Tenant Resolver
          |
          v
PDP (C.R.O.W.N. / A.R.G.U.S.) ── Policy store versionado
          | \
          |  \__ Cache de decisiones verificada (opcional)
          v
PEP aplica obligaciones
          |
          v
Servicio de dominio / repositorio con RLS o filtro de tenant
          |
          +--> Cola de auditoría duradera --> Audit Worker --> Ledger / almacén de evidencia
          |
          +--> Eventos de seguridad --> Correlación y detección de anomalías
```

La comunicación entre gateway, PDP, caché, auditoría y ledger DEBE usar identidad de workload, autorización de servicio a servicio, TLS moderno y reglas de red de mínimo privilegio. El gateway NO DEBE escribir directamente al ledger; el dominio NO DEBE reemplazar al PDP; el ledger NO DEBE encontrarse en el camino síncrono de la decisión ordinaria.

## Flujo de decisión

1. El PEP normaliza la solicitud, impone tamaño máximo, asigna o propaga `request_id` y `trace_id`.
2. El proveedor de identidad valida emisor, audiencia, expiración, revocación y prueba de posesión cuando aplique.
3. El tenant resolver obtiene el tenant desde claims verificados o contexto interno; el PEP nunca acepta el tenant del cuerpo como autoridad.
4. El PEP valida el esquema de entrada y deriva `action`, `resource` y atributos permitidos.
5. El PEP consulta una caché solamente si la clave de decisión es completa, no está revocada y la entrada pasa verificación de integridad.
6. Ante cache miss, el PDP evalúa política versionada con atributos confiables, emite `allow` o `deny`, obligaciones y TTL.
7. El PEP valida que puede ejecutar todas las obligaciones. Si no puede, deniega con un error seguro.
8. El servicio de dominio ejecuta exclusivamente si la decisión permite la acción; además aplica su filtro de tenant o RLS como defensa en profundidad.
9. El PEP emite la respuesta usando un esquema de salida y registra un evento de auditoría durable.
10. Auditoría y correlación se ejecutan asíncronamente, salvo operaciones clasificadas como críticas que requieran confirmación de evidencia antes de completar.

## Modelo de datos

Los campos de decisión deben tener tipado estricto, no usar `any`, y excluir PII, tokens, prompts, secretos y payloads completos salvo que una obligación y la clasificación de datos lo permitan.

```ts
export interface AuthorizationDecision {
  decisionId: string;                 // UUIDv7 u otro ID ordenable aprobado
  tenantId: string;
  subjectId: string;
  action: string;
  resource: string;
  resourceId?: string;
  allow: boolean;
  obligations: AuthorizationObligation[];
  policyId: string;
  policyVersion: string;
  issuedAt: string;                   // ISO 8601 UTC
  expiresAt: string;                  // ISO 8601 UTC
  requestId: string;
  traceId: string;
  keyId?: string;                     // identificador, nunca material de clave
  signature?: string;                 // si el perfil criptográfico lo exige
  previousDecisionHash?: string;      // evidencia de cadena, no requisito de hot path
}

export interface AuthorizationContext {
  tenantId: string;
  subjectId: string;
  action: string;
  resource: string;
  resourceAttributes: Record<string, string | number | boolean | string[]>;
  verifiedClaims: Record<string, string | number | boolean | string[]>;
  request: {
    ipAddress?: string;
    userAgent?: string;
    timestamp: string;
    deviceId?: string;
    geoCountry?: string;
  };
}

export type AuthorizationObligation =
  | { type: "redact"; fields: string[] }
  | { type: "rate_limit"; key: string; limit: number; windowSeconds: number }
  | { type: "require_mfa" }
  | { type: "audit"; level: "standard" | "elevated" }
  | { type: "step_up_auth"; reason: string };
```

## Política y obligaciones

El PDP es la única autoridad de decisión. Las políticas DEBEN versionarse, ser revisables, tener pruebas unitarias y de regresión, y declarar explícitamente qué atributos consumen y qué obligaciones producen.

Las obligaciones son parte de la decisión y el PEP DEBE hacer enforcement antes de ejecutar el dominio. Si una obligación de redacción, MFA, cuota, auditoría reforzada o step-up authentication no puede ejecutarse, el resultado DEBE ser `deny` con código seguro `CROWN_OBLIGATION_FAILURE`.

## Aislamiento de tenant

Toda clave de caché, consulta de repositorio, evento de auditoría y métrica de alto cardinalidad DEBE estar ligada al tenant correcto. El tenant se deriva de identidad verificada y se vuelve a validar en la capa de datos mediante Row Level Security, filtros obligatorios o partición física/lógica según el riesgo.

Las pruebas negativas DEBEN demostrar que un principal de tenant A no puede leer, modificar, inferir existencia ni correlacionar recursos de tenant B. Una decisión `allow` no elimina la obligación del repositorio de imponer el aislamiento de datos.

## Caché de decisiones

La caché es una optimización, no una autoridad. Las entradas DEBEN incluir `tenantId`, `subjectId`, acción, recurso o clase de recurso, versión de política, versión de identidad/revocación, timestamp, vencimiento, claves de invalidación e integridad autenticada.

- Las decisiones de alto riesgo, mutaciones sensibles, pagos, cambios de identidad, gestión de políticas y acciones administrativas DEBERÍAN evaluarse en tiempo real o usar TTL muy corto.
- Las decisiones `deny` DEBEN tener TTL independiente y corto para evitar bloquear un acceso legítimo tras un cambio válido.
- Eventos de revocación, cambio de rol, cambio de tenant, cambio de política y rotación de credenciales DEBAN invalidar las claves afectadas.
- Ante firma inválida, formato corrupto, divergencia o indisponibilidad de caché, el PEP DEBE tratarla como cache miss y consultar al PDP; nunca permitir por ese motivo.
- La cache dual y la comparación cruzada entre regiones son opcionales. Sólo se habilitan tras demostrar que su costo de latencia, consistencia y operación es menor que el riesgo que reducen.

El mecanismo recomendado para autenticidad de caché es MAC o firma con una clave gestionada, rotada y separada de la clave de firma de decisiones. Firmar cada hit con un algoritmo post-cuántico puede ser costoso; debe justificarse mediante amenaza, benchmark y SLO.

## Criptografía y custodia

La firma de decisiones y el ledger de evidencia son controles adicionales, no sustitutos de autorización correcta. La selección criptográfica DEBE basarse en una evaluación de amenazas, soporte de bibliotecas, compatibilidad, costos de firma/verificación y estrategia de migración.

| Control | Base obligatoria | Endurecimiento condicionado |
|---|---|---|
| Hash de evidencia | SHA-256 o SHA-3 aprobado por Security | SHA3-512 con dominio y metadata canónica |
| Integridad en tránsito | TLS 1.2 mínimo; TLS 1.3 preferido | mTLS con identidad de workload y rotación automatizada |
| Cifrado en reposo | KMS/HSM y cifrado autenticado | AES-256-GCM con envelope encryption y separación por tenant |
| Firma de decisiones | `keyId`, formato canónico y verificación | ML-DSA-87 o esquema híbrido únicamente tras validación de interoperabilidad |
| Rotación de claves | Rotación programada, revocación y retención de claves públicas | Validación de continuidad e HSM geodistribuido |

No se fija en este ADR el tamaño de una clave ni se afirma que ML-DSA-87 tenga "claves de 448 bytes"; dichos parámetros dependen del estándar, la representación y la biblioteca concreta. Security DEBE mantener un perfil criptográfico separado, versionado y verificable.

Una cadena de custodia DEBE usar serialización canónica, dominio de hash, secuencias monotónicas por partición, `previousHash`, `keyId`, timestamps y anclajes periódicos. Evítese un campo que contenga el "hash de todas las firmas anteriores": crece sin límite y dificulta verificación. Un Merkle tree por lote o una cadena hash por partición proporciona pruebas verificables con costo controlado.

## Gestión de claves

Las claves privadas DEBEN permanecer en un KMS/HSM o servicio equivalente. La aplicación sólo recibe permisos de firma/verificación conforme al principio de mínimo privilegio; nunca el material de clave en variables de entorno, logs, bundles web o repositorios.

La rotación requiere: generación de nueva clave, publicación de `keyId`, periodo de coexistencia, pruebas de firma y verificación, preservación de claves públicas históricas, validación de artefactos previos, revocación documentada y evidencia de recuperación. No se debe eliminar una clave antigua tras 24 horas si todavía es necesaria para verificar registros retenidos; se retira el uso de firma, no la capacidad de verificación.

## Red y resiliencia

El gateway es el único componente expuesto a Internet y DEBE aplicar WAF, rate limiting por identidad/IP/tenant, límites de payload, protección DDoS del proveedor y autenticación antes de operaciones costosas. PDP, cache, audit worker y ledger DEBEN residir en segmentos con políticas explícitas de ingreso y salida.

| Dependencia | Comportamiento normal | Fallo permitido |
|---|---|---|
| Identity/Tenant | Resolver claims y estado actual | Denegar la solicitud protegida |
| PDP | Evaluar política actual | Denegar mutaciones; lectura sólo con decisión cacheada aún válida y política aprobada de degradación |
| Caché | Reducir latencia | Cache miss; consultar PDP |
| Ledger/Audit | Preservar evidencia asíncrona | Encolar durablemente y alertar; bloquear sólo acciones clasificadas como críticas |
| Correlación | Detectar campañas y anomalías | Mantener autorización base; aumentar auditoría y alertar |

Circuit breakers, timeouts, budgets de reintento con backoff y colas durables DEBEN configurarse y probarse. Las políticas de fallback no pueden ser "allow all"; deben estar versionadas, acotadas por acción y tiempo, y ser auditables.

## Ledger y residencia

La auditoría necesita inmutabilidad práctica, control de acceso, retención definida y capacidad de verificación. BookPI, una base append-only, WORM storage u otro backend pueden cumplir esta función si satisfacen los requisitos técnicos y regulatorios aprobados.

La réplica en tres regiones, Raft y quorum 2/3 son decisiones de arquitectura condicionadas: NO deben implementarse ni declararse como cumplimiento de GDPR/LGPD sin un análisis de residencia, transferencias internacionales, base legal, RPO/RTO y modelo de amenaza. La residencia debe configurarse por tenant y clasificarse explícitamente; replicar datos de un tenant en una región no autorizada puede contradecir el objetivo de soberanía.

La purga se ejecuta sólo tras vencer la retención aprobada, confirmar retenciones legales o investigaciones activas y generar un registro de destrucción auditable. La retención de siete años no es universal; Legal y Security deben publicar la matriz por tipo de dato, jurisdicción y finalidad.

## Telemetría y detección

El plano DEBE emitir métricas, logs estructurados y trazas sin exponer secretos ni PII innecesaria. `request_id`, `trace_id`, `decision_id`, `policy_id`, `policy_version`, resultado, modo de caché, motivo de denegación normalizado y latencia son los campos mínimos.

| Métrica | Dimensiones permitidas | Objetivo inicial | Alerta |
|---|---|---|---|
| `authorization_latency_ms` | endpoint, outcome, cache_hit | SLO definido tras baseline | Burn rate o degradación sostenida |
| `policy_decision_time_ms` | policy_id, outcome | Baseline + presupuesto | Umbral por servicio y ventana |
| `deny_rate` | endpoint, reason | Baseline por endpoint | Desviación estadística y umbral absoluto |
| `audit_enqueue_failures_total` | backend, criticality | 0 para eventos críticos | Cualquier evento crítico no encolado |
| `cache_integrity_failures_total` | cache_instance | 0 | Cualquier incidencia sostenida |
| `cross_subject_anomaly` | tenant pseudonimizado | Baseline | Regla aprobada por Security |
| `geo_velocity_anomaly` | sin país exacto en métrica pública | Señal, no decisión autónoma | Riesgo alto + corroboración |

No se fijan SLO universales como p95 menor a 5 ms o 15 ms sin un benchmark del despliegue real. SRE DEFINIR SLI, objetivo, presupuesto de error, cardinalidad de etiquetas y estrategia de muestreo antes de bloquear releases por estos valores.

Un motor de correlación puede analizar anomalías entre sujetos, IPs, dispositivos o velocidades geográficas. Sus scores son señales de riesgo: no deben denegar permanentemente por sí solos. Para decisiones de alto impacto se requiere corroboración, política explícita, revisión humana cuando aplique y mecanismos para VPN corporativas, roaming, NAT y errores de geolocalización.

## Objetivos operativos

Los objetivos iniciales se validarán con carga representativa y se revisarán trimestralmente:

- Disponibilidad y latencia de autorización se miden por ruta, criticidad y resultado de cache.
- 100% de decisiones críticas debe tener evento de auditoría durable o una denegación explícita si ese requisito no puede cumplirse.
- 100% de cambios de política y revocación debe producir invalidación verificable.
- Cero accesos cross-tenant demostrables en pruebas negativas y ejercicios de seguridad.
- Cero secretos, tokens, prompts internos o stack traces en respuestas públicas, logs comunes o métricas.

## Cambios de política

Todo cambio de política, atributo confiable, obligación, caché, algoritmo criptográfico o residencia de auditoría DEBE seguir este flujo:

1. RFC con amenaza mitigada, impacto de tenants, compatibilidad, privacidad, SLO, rollback y criterios de éxito.
2. PR con esquemas ejecutables, pruebas unitarias, contract tests, negativas de tenant, pruebas de revocación y evidencia de revisión.
3. Validación en staging con configuraciones equivalentes a producción y datos sintéticos.
4. Despliegue canary con observabilidad, kill switch y rollback probado.
5. Revisión posterior durante una ventana definida por criticidad; actualizar runbooks y registro de riesgos.

Las políticas se firman o protegen contra cambios no autorizados, se versionan y se publican con un manifiesto que relacione commit, hash de política, aprobadores y fecha efectiva.

## Pruebas obligatorias

| Área | Casos mínimos |
|---|---|
| Contrato | Validación de entrada/salida, errores seguros, idempotencia donde aplique |
| Autorización | Allow/deny, obligaciones, scopes, escalada, recursos inexistentes y tenant isolation |
| Revocación | Cambio de rol, sesión expirada, token revocado, invalidación de política y caché |
| Integridad | Decisión canónica, firma/MAC, hash chain o Merkle proof, rotación y verificación histórica |
| Resiliencia | Caída de PDP, caché, identidad, cola, ledger y red; validar fail-safe |
| Seguridad | Bypass, replay, manipulación de atributos, poisoning cache, inyección de política y acceso lateral |
| Privacidad | Redacción, minimización, retención y ausencia de secretos en logs |
| Carga | Perfil representativo; picos, saturación y recuperación, no sólo RPS sintéticos |
| Ejercicios coordinados | DDoS simulado, cambio malicioso de política, corrupción de caché y pérdida parcial de auditoría en entorno aislado |

Las pruebas de 10,000 o 100,000 RPS son objetivos de capacidad, no requisitos universales. Deben definirse a partir de tráfico esperado, presupuesto y límites de proveedores; nunca deben ejecutarse contra sistemas de terceros o producción sin autorización formal.

## Runbooks

### PDP o identidad indisponibles

1. Confirmar alcance con `trace_id`, región, endpoint, tenant y dependencia afectada.
2. Abrir circuit breaker y detener reintentos no acotados.
3. Denegar mutaciones; aplicar únicamente fallback de lectura previamente aprobado, cacheado, no vencido y no revocado.
4. Notificar a SRE, Security y Policy Owner según severidad.
5. Restaurar, validar políticas activas, comprobar invalidaciones y revisar decisiones emitidas durante degradación.

### Integridad de caché o ledger

1. Aislar la instancia sospechosa y preservar evidencia.
2. Invalidar entradas afectadas; para caché, degradar a evaluación PDP.
3. Pausar escrituras de evidencia sólo si continuar podría ampliar corrupción; mantener una cola durable con control de capacidad.
4. Verificar lote, partición, key ID y pruebas de integridad; comparar con réplicas autorizadas.
5. Rotar o revocar credenciales si se confirma compromiso, reconstruir desde último punto verificable y documentar cadena de custodia.

### Anomalía de seguridad

1. Corroborar señal con identidad, actividad, dispositivo y contexto; una geo-anomalía aislada no prueba compromiso.
2. Aplicar step-up authentication, reducción temporal de privilegios o revocación según política y criticidad.
3. Conservar evidencia, notificar por canal seguro y abrir investigación.
4. Evaluar impacto por tenant sin divulgar datos de otros sujetos.
5. Cerrar con causa raíz, acciones correctivas, dueños y fecha de verificación.

### Compromiso de claves

1. Activar procedimiento de incidente criptográfico, restringir operaciones de firma y conservar logs del KMS/HSM.
2. Generar y publicar nuevo `keyId`, revocar permisos comprometidos e invalidar cachés autenticadas por la clave afectada.
3. Verificar el rango temporal de decisiones afectadas y emitir pruebas o re-firmas cuando el perfil lo permita.
4. Evaluar notificación legal y a clientes con Security/Legal; no prometer no repudio o cumplimiento sin conclusión forense.

## Criterios de release

Un release queda bloqueado si ocurre cualquiera de los siguientes:

- Esquemas ejecutables, políticas activas, scopes o documentación publicada presentan drift.
- Una ruta protegida confía en tenant, rol, precio, scope o resultado de política suministrado por cliente.
- Faltan pruebas negativas de tenant, revocación o obligaciones para cambios relevantes.
- No existe rollback probado para el cambio de política, caché, clave o backend de auditoría.
- Una dependencia crítica no tiene timeout, comportamiento de fallo explícito o alerta accionable.
- Se detecta una falla de integridad no investigada en caché, decisiones, auditoría o ledger.
- Existen datos mock o autoridades de cliente en producción fuera de una excepción aprobada y con fecha de vencimiento.
- Los SLO, umbrales o pruebas de carga requeridos por el cambio no tienen evidencia de aprobación.

## Plan de implementación

### Fase 0 — Fundamentos

- Inventario de endpoints, acciones, recursos, datos, tenants, actores y dependencias.
- Threat model y clasificación de datos aprobados.
- Definición de propietarios, guardias, RPO/RTO y política de degradación.

### Fase 1 — Autoridad consistente

- PDP/PEP con evaluación centralizada, validación runtime y deny by default.
- Resolución de identidad y tenant verificadas; defensa en profundidad en capa de datos.
- Decisión versionada con `request_id`, `trace_id` y evento de auditoría durable.
- Pruebas de tenant isolation, escalada, revocación, fallos y contratos.

### Fase 2 — Operación segura

- Caché con invalidación por evento, TTL por riesgo e integridad autenticada.
- WAF, rate limiting, identidad de workload, segmentación y observabilidad.
- Cola de auditoría, almacenamiento append-only y runbooks ejercitados.
- Canary, rollback y SLO basados en baseline real.

### Fase 3 — Endurecimiento avanzado

- Correlación de amenazas, step-up authentication y detección de campañas.
- Rotación de claves, verificación histórica, anclajes de integridad y KMS/HSM.
- Replicación regional y residencia por tenant cuando exista justificación legal y operativa.
- Evaluación de criptografía post-cuántica o híbrida con pruebas de compatibilidad, costo y recuperación.

## Roles

| Rol | Responsabilidad |
|---|---|
| Policy Owner | Define, revisa y aprueba políticas, obligaciones y fallback |
| Security Owner | Threat model, criptografía, investigación y aceptación de riesgos |
| API/Domain Owner | Acciones, recursos, aislamiento de datos y contratos de dominio |
| SRE/Platform | Red, identidad de workloads, disponibilidad, observabilidad y continuidad |
| Privacy/Legal | Retención, residencia, transferencia y requisitos de notificación |
| Audit Owner | Evidencia, verificaciones periódicas y accesos a auditoría |

## Riesgos y compensaciones

Centralizar autorización reduce divergencia pero crea una dependencia crítica, por lo que requiere alta disponibilidad, decisiones de degradación explícitas y observabilidad. Firmar cada decisión, doble caché y replicación multirregión aumentan costo, latencia y complejidad; se activan según amenaza y evidencia, no por defecto.

La geolocalización, fingerprints y ML pueden reducir fraude, pero presentan falsos positivos y riesgos de privacidad. Se deben tratar como señales, minimizarse, explicarse cuando sea requerido y no usarse como autoridad única para denegaciones permanentes.

## Checklist de aprobación

- [ ] Threat model y clasificación de datos aprobados
- [ ] PDP/PEP y fuentes de atributos confiables implementados
- [ ] Aislamiento cross-tenant probado en API y capa de datos
- [ ] Políticas versionadas, revisadas y con rollback
- [ ] Cache con TTL, invalidación y comportamiento seguro ante corrupción
- [ ] Auditoría durable, correlacionable y con acceso restringido
- [ ] KMS/HSM, rotación y recuperación validados si se usan firmas
- [ ] Segmentación de red, identidad de workload y mTLS verificados
- [ ] Métricas, alertas, SLO y runbooks probados
- [ ] Pruebas de resiliencia, seguridad y carga ejecutadas en entorno autorizado
- [ ] Revisión de privacidad, retención y residencia completada
- [ ] Riesgos aceptados documentados con dueño y fecha de revisión

## Glosario

| Término | Definición |
|---|---|
| PDP | Policy Decision Point: evalúa políticas y emite decisiones |
| PEP | Policy Enforcement Point: solicita decisión y ejecuta obligaciones |
| Tenant | Límite de aislamiento de una organización o cliente |
| Obligación | Acción obligatoria asociada a una decisión, como redacción o MFA |
| Decision ID | Identificador correlacionable de una decisión de autorización |
| Cache poisoning | Inserción o alteración de entradas para obtener una decisión no válida |
| Key ID | Identificador de una clave de firma o verificación, sin material secreto |
| Ledger | Almacén append-only de evidencia con integridad verificable |
| RPO/RTO | Objetivo de punto de recuperación / objetivo de tiempo de recuperación |
| Step-up authentication | Verificación adicional exigida antes de una acción sensible |

---

**Decisión de arquitectura:** adoptar un plano centralizado de autorización con controles progresivos, evidencia verificable y fallos seguros. La designación `hardened` queda condicionada a la lista de aprobación anterior y a una revisión independiente de seguridad.