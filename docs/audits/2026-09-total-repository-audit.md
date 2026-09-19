# Auditoría integral del repositorio — 2026-09

## Alcance

Inventario estático de 588 archivos versionados, 338 módulos de código y 50 documentos. Se revisaron rutas, dependencias, memoria, aprendizaje, ML nativo, registros de modelos, seguridad, persistencia, Mux, documentación y pruebas.

## Hallazgos principales

1. Existían varias capas de registro de modelos: `intelligence/model-registry`, `intelligence/durable-model-registry`, `isabella/models/registry` y ML nativo. Se preservan por responsabilidad distinta, pero la nueva fachada `native-ml/canonical-engine.ts` evita que los consumidores importen implementaciones dispersas.
2. El ML nativo ya existía como clasificador de riesgo y regresión logística determinista; se expone ahora mediante una fachada canónica, sin presentarlo como LLM ni como autoridad autónoma.
3. La documentación estaba distribuida por arquitectura, operaciones, políticas y gobernanza sin índice RFC/ARC. Se añade una estructura normativa y un contrato de dependencias.
4. Se detectaron 206 coincidencias de mocks/TODO/placeholder en código y documentación. Deben triagearse por archivo y no eliminarse masivamente sin evidencia: algunos pertenecen a pruebas, migraciones o documentación de límites.
5. Se identificó una tensión de configuración de build/Vercel y runtime Nitro; queda registrada como riesgo operativo para revisión de deployment.

## Correcciones de esta fase

- Bóveda gobernada para AIs open source/open science con allowlist de licencias, residencia, procedencia, hash, confianza, revocación y kill switch lógico.
- Fachada única para ML nativo de Isabella.
- RFC de Openness basado en el documento OPN-01.
- ARCs técnico-operativo y jurídico internacional.

## Riesgos pendientes

- Migración gradual de imports legacy hacia las fachadas canónicas.
- Persistencia durable de la bóveda en Neon con migración y RLS/aislamiento por tenant.
- Benchmark académico reproducible y revisión de sesgos por territorio, idioma y clase de tarea.
- Matriz completa de dependencias generada desde lockfile y SBOM.

## Criterio de cierre

No se considera cerrada la auditoría total hasta que cada hallazgo tenga propietario, evidencia, test, decisión de riesgo y fecha de revisión.
