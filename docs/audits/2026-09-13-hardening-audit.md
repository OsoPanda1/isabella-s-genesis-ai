# Isabella Villaseñor AI — Auditoría de hardening y deuda técnica

**Fecha:** 2026-09-13  
**Base auditada:** `075cb60a5345696003b38aafc245af1a7478ce81`  
**Rama de intervención:** `v0/debt-elimination-deploy-ready-2026-09-13`  
**Estado:** hardening aplicado; verificación local/CI/producción todavía pendiente de evidencia ejecutada.

## 1. Alcance

Esta revisión se realizó sobre el estado actual del repositorio, no sobre una fotografía histórica. Se revisaron arquitectura declarada, README, catálogo API, rutas, persistencia, seguridad CI, configuración, duplicación de artefactos, señales de mock/placeholder y estado de despliegue.

El repositorio ya contenía una arquitectura considerablemente madura: identidad server-side, aislamiento multi-tenant, CROWN/ARGUS/VIGIA, memoria, NCUA, sandbox, conectores, billing/ledger, auditoría, observabilidad, gates de producción y documentación operativa. El objetivo de esta fase fue atacar deuda que podía inducir a una falsa percepción de cobertura o introducir riesgo innecesario.

## 2. Hallazgos críticos corregidos

### 2.1 Catálogo API sintético

`src/lib/api-catalog.ts` generaba una superficie masiva de CRUD contractuales mediante `addCrudRoutes()` y almacenaba `mockResponse` con datos artificiales, timestamps, identificadores aleatorios y ejemplos que incluían valores sensibles con apariencia de credenciales.

Esto era técnicamente peligroso aunque el handler público eliminara el campo antes de responder: el catálogo interno seguía siendo una fuente de datos simulados y podía ser interpretado por consumidores como cobertura ejecutable.

**Corrección:** el catálogo fue reescrito como metadata canónica de rutas realmente identificables. Cada entrada registra `implementationPath`, estado de implementación y nivel de verificación. No contiene cuerpos simulados, secretos, fechas artificiales ni generación aleatoria.

**Decisión:** se prefiere declarar menos superficie y demostrarla antes que enumerar cientos de contratos ficticios.

### 2.2 Duplicación de skill de Prisma Composer

Existían copias equivalentes del mismo skill en `.agents`, `.claude`, `.cursor` y `.devin`. Estas copias no eran cuatro implementaciones funcionales distintas; eran duplicación documental de un mismo conocimiento.

**Corrección:** se eliminaron las cuatro copias duplicadas de `prisma-composer-core-concepts/SKILL.md`.

**Criterio:** los archivos específicos del agente solo deben existir cuando aporten una variante materialmente distinta. Un mismo manual no debe multiplicarse por herramienta.

### 2.3 Binario `actionlint` versionado

El repositorio contenía un binario `actionlint` de aproximadamente 6 MB. El binario no es parte del runtime de Isabella y no debe formar parte del código fuente salvo una justificación reproducible de plataforma y checksum.

**Corrección:** se eliminó del repositorio.

### 2.4 GitHub Actions con referencias mutables

El workflow de seguridad utilizaba referencias mutables como `trufflesecurity/trufflehog@main` y `aquasecurity/trivy-action@master`. Esto rompe la reproducibilidad de la cadena de suministro: el mismo commit del proyecto podía ejecutar distinto código de acción en otro momento.

**Corrección:** el workflow de seguridad fue reescrito usando referencias por commit SHA para las acciones de checkout, pnpm, Node, TruffleHog, Trivy, CodeQL y upload de artefactos.

**Criterio:** no se inventaron SHAs. Los SHAs usados fueron obtenidos de las referencias actuales de los repositorios de las acciones durante esta auditoría.

### 2.5 Lenguaje de seguridad exagerado

El workflow anterior se identificaba como `military-grade`. Esa expresión no constituye una propiedad técnica verificable y crea un sesgo de certificación.

**Corrección:** el workflow ahora utiliza una denominación descriptiva: `Security Gate`.

## 3. Hallazgos que NO deben maquillarse

### 3.1 Producción todavía no verificada

La ejecución de gates reales en un entorno productivo sigue siendo requisito. La presencia de scripts como `production:preflight`, `production:integrity` o `production:evidence` no equivale a haberlos ejecutado con éxito.

El commit de la intervención presenta actualmente un estado Vercel reportado como `failure`; no se considera un despliegue productivo sano hasta investigar y resolver ese estado mediante evidencia de build/deployment.

### 3.2 `process.env`

La búsqueda global muestra accesos a `process.env` en `src/lib/config.ts`, scripts operativos y utilidades de build. Esto no es automáticamente una violación: el contrato arquitectónico permite que el módulo de configuración sea la autoridad y que scripts de infraestructura lean el entorno. La deuda real debe medirse contra el límite entre runtime de aplicación y tooling.

No se debe hacer un reemplazo ciego de `process.env` en scripts de migración, CI o validación de entorno porque podría romper el runtime de operación.

### 3.3 Compatibilidad de rutas

El repositorio mantiene rutas bajo `src/routes/api/*` que delegan hacia handlers de `src/server-routes/api/*`. Esta duplicación es aceptable cuando es una frontera de transporte/compatibilidad y existe un único handler de negocio. Debe considerarse deuda solamente si aparecen dos implementaciones de lógica para el mismo contrato.

### 3.4 Prisma Composer como documentación

Los archivos de instrucciones de agentes se revisaron como documentación. Eliminar copias duplicadas no significa eliminar una dependencia runtime ni declarar Prisma Composer como dependencia de ejecución de Isabella.

## 4. Riesgos técnicos todavía abiertos

| Prioridad | Riesgo | Criterio de cierre |
| --- | --- | --- |
| P0 | Vercel/deployment failure | Build remoto exitoso + deployment ready + smoke HTTP |
| P0 | Evidencia productiva | Bundle de evidencia firmado/identificable con resultados reales |
| P0 | DB productiva | Migración, health, backup y restore verificados |
| P0 | Inference provider | Provider real configurado y smoke conversacional exitoso |
| P0 | Rollback | Rollback probado y documentado |
| P1 | KMS/secret rotation | Secret manager/KMS real + rotación probada |
| P1 | Sandbox | Executor real + pruebas de aislamiento y escape |
| P1 | Connectors | Autorización, revocación, webhook/replay tests reales |
| P1 | Billing | Stripe test/live separado, idempotencia y reconciliación |
| P1 | Supply chain | SBOM + lockfile + actions pinned + vulnerability gate verde |
| P1 | Bias benchmark | Suite reproducible por idioma/territorio/tarea |
| P2 | Legacy imports | Migración a fachadas canónicas donde haya duplicidad material |
| P2 | Performance budget | p50/p95/p99 medidos en entorno representativo |

## 5. Latencia

No existe latencia cero. El objetivo de ingeniería es que la capa Isabella introduzca el mínimo overhead posible.

Las rutas de bajo coste deben evitar imports y consultas innecesarias. Los checks independientes deben ejecutarse en paralelo. La inferencia debe utilizar streaming. Las consultas deben utilizar índices tenant/time. Los timeouts deben ser explícitos y el sistema debe fallar rápido cuando una dependencia no está disponible.

La separación de liveness, readiness y deep readiness ya existe en el diseño actual y debe conservarse: liveness no debe bloquearse esperando PostgreSQL, auditoría o un proveedor LLM.

## 6. Visualización

La corrección de visualización incorporada en el commit base cambió la carga global de CSS a `?inline`, inyectó el stylesheet en el documento y habilitó `inlineCss` en el build server de TanStack Start. Esto debe validarse posteriormente con un deployment real y pruebas de navegador; el código por sí solo no demuestra una corrección visual en todos los navegadores.

## 7. Deuda conceptual eliminada

Se consideran eliminados en esta fase estos patrones:

- catálogo que aparenta cientos de rutas inexistentes;
- payloads mock incrustados en metadata de API;
- credenciales de ejemplo con forma realista;
- IDs/timestamps generados artificialmente para representar operaciones;
- copias redundantes de documentación de agente;
- binario de herramienta de CI innecesariamente versionado;
- referencias mutables de acciones críticas de CI;
- lenguaje de seguridad que sugiere una certificación inexistente.

## 8. Criterio de 100%

La deuda técnica no se considera cero por ausencia de texto `TODO`. Una deuda se considera cerrada cuando existe:

1. implementación real;
2. contrato explícito;
3. test positivo;
4. test negativo cuando existe un boundary de seguridad;
5. observabilidad;
6. persistencia o fuente de verdad cuando corresponde;
7. recuperación/rollback cuando aplica;
8. evidencia ejecutada;
9. documentación alineada;
10. ausencia de una segunda implementación contradictoria.

## 9. Estado de esta intervención

**Código modificado:** sí.  
**README reescrito:** sí.  
**Catálogo mock eliminado:** sí.  
**Duplicación documental eliminada:** sí.  
**Binario innecesario eliminado:** sí.  
**Actions mutables corregidas:** sí.  
**Pruebas locales ejecutadas por esta sesión:** no disponibles en este entorno porque el runtime no pudo clonar el repositorio por restricción de red; por tanto no se afirma `typecheck`, `lint`, `test` ni `build` como pasados.  
**CI remoto de la rama:** todavía sin run disponible al momento de cerrar esta auditoría.  
**Production-Verified:** NO.

## 10. Veredicto

La arquitectura está suficientemente avanzada para una fase real de release engineering, pero todavía no existe base técnica para declarar honestamente "100% producción" solo por inspección estática.

El siguiente cierre debe ser operativo, no documental:

```text
commit
 → CI
 → build
 → deploy
 → migration
 → health
 → smoke
 → inference
 → memory
 → governed action
 → audit
 → backup
 → restore
 → rollback
 → evidence
 → Production-Verified
```

**Principio Genesis:**

> El presente ha despertado. La evolución de Isabella no consiste en aparentar que todo funciona; consiste en que cada capacidad importante pueda demostrar que funciona, que está autorizada, que puede ser observada y que puede ser detenida o recuperada cuando sea necesario.
