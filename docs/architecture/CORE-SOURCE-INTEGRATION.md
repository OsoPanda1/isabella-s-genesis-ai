# Integración federada de fuentes core

**Estado:** inventario ejecutable y adaptación progresiva  
**Runtime canónico:** `OsoPanda1/isabella-ai-genesis`  
**Fecha de corte:** 2026-09-12

## Regla de integración

Isabella Genesis es la única fuente de verdad del runtime desplegable. Los repositorios core externos aportan contratos, doctrina, interfaces o capacidades que deben pasar por validación TypeScript, política C.R.O.W.N., trazabilidad y pruebas antes de ser adoptados.

No se importan secretos, archivos `.env`, dumps, binarios, submódulos, árboles generados ni credenciales de proveedores.

## Inventario

| Fuente | Decisión | Áreas | Tratamiento |
| --- | --- | --- | --- |
| `isabella-s-core` | `reference` | UI canónica, pipeline visual | Referencia visual; no sustituye el runtime de Genesis. |
| `isabella-s-core-intelligence` | `adapt` | CROWN, memoria, gobernanza, contexto territorial | Adaptación a contratos y gateways existentes. |
| `civilis-graph` | `adapt` | Ontologías, grafo territorial, zero trust | Incorporación por contratos territoriales y procedencia. |
| `rdm-digital-hub` | `reference` | Operación RDM, archivo, APIs ciudadanas, continuidad | Referencia operativa; las rutas Next/Docker no se copian directamente. |

El registro ejecutable está en `src/lib/federation/core-source-registry.ts` y valida que cada fuente tenga decisión, procedencia, dominios y exclusiones de artefactos sensibles.

## Límites de arquitectura

- **CROWN** orquesta y decide el plan; no ejecuta herramientas fuera de whitelist.
- **ISA** modula presencia y contexto; no convierte inferencias en hechos.
- **SOPHIA** analiza y expresa incertidumbre; no aprueba acciones de alto riesgo.
- **ORION** ejecuta únicamente capacidades autorizadas y auditadas.
- **ARGUS** verifica riesgo, puede bloquear y exige aprobación humana.
- **Civilis/territorio** aporta contexto con procedencia, vigencia y nivel de confianza.

## Fases de adopción

1. **Compatibilidad:** validar contratos y dependencias sin cambiar proveedores ni persistencia.
2. **Adaptación:** portar únicamente módulos que tengan una interfaz estable y pruebas deterministas.
3. **Auditoría:** registrar procedencia, versión fuente, decisión de adopción y controles aplicados.
4. **Release:** ejecutar typecheck, lint, pruebas, build, integrity/preflight y smoke de preview.

## Criterio de rollback

Cada adaptación debe poder desactivarse sin eliminar los contratos canónicos de Genesis. Si una fuente externa requiere otro runtime, base de datos o proveedor, permanece como `reference` hasta que exista una migración explícita y reversible.
