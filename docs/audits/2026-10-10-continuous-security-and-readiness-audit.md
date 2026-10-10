# Auditoría técnica continua — Isabella GenesisAI

- **Repositorio auditado:** https://github.com/OsoPanda1/isabella-s-genesis-ai
- **Rama de correcciones:** `audit/startup-gate-and-readiness-2026-10`
- **Commit base inspeccionado:** `519b7b4a66002b02fce2ec049e9c4e3f508b5788` (21 de septiembre de 2026)
- **Fecha del informe:** 10 de octubre de 2026
- **Alcance real:** inspección estática de archivos accesibles por GitHub y cambios correctivos enviados a una rama. No se afirma que el build, los tests, el despliegue o las conexiones de producción hayan sido ejecutados por esta auditoría.

## Resumen ejecutivo

Se encontraron y corrigieron en la rama dos defectos de seguridad:

1. **Gate de arranque fail-open.** Si la carga de configuración fallaba, el validador devolvía el modo `development` aunque el proceso fuera de producción. Además, el servidor solo registraba el error y seguía arrancando. En producción/staging, la rama corregida conserva el modo real detectado y aborta el arranque ante configuración inválida.
2. **Tenant compartido por defecto.** Tanto el adaptador de identidad Supabase como el guard de tenant podían asignar `system` a una identidad autenticada sin tenant canónico. Eso puede convertir metadatos ausentes en un contexto compartido. La rama corregida deja el tenant ausente sin resolver y deniega el acceso; se añadió una prueba de regresión.

También se detectó un **bloqueo de reproducibilidad y de preflight**: `scripts/production-preflight.mjs` exige `pnpm-lock.yaml`, `.nvmrc`, `vercel.json` y scripts de package.json como `start`, `typecheck`, `test`, `db:migrate`, `db:verify`, `production:preflight` y `production:gate`. En la rama inspeccionada no existen los archivos `pnpm-lock.yaml`, `bun.lock`, `.nvmrc` ni `vercel.json`; el package.json solo declara `dev`, `build`, `build:dev`, `preview`, `lint` y `format`. Por tanto, el preflight actual no puede pasar tal como está. El README propone Bun, mientras que el preflight exige pnpm: el contrato de herramientas debe unificarse antes de declarar un build reproducible.

## Hallazgos y estado

| ID | Severidad | Hallazgo | Estado en esta rama |
|---|---|---|---|
| GEN-SEC-001 | Crítica | Un error de configuración podía convertirse en modo development y el proceso podía seguir arrancando en producción. | Corregido en código; pruebas añadidas, ejecución pendiente. |
| GEN-SEC-002 | Crítica | La ausencia de tenant canónico podía enviar identidades autenticadas al tenant compartido `system`. | Corregido en código; prueba de regresión añadida, ejecución pendiente. |
| GEN-OPS-001 | Alta | El preflight exige archivos y scripts ausentes; package manager y lockfile no están alineados con README. | Pendiente de resolver. |
| GEN-OPS-002 | Alta | El repositorio carece de un contrato único verificable para instalación, typecheck, tests, start y migraciones desde package.json. | Pendiente de resolver. |
| GEN-DATA-001 | Alta | El README afirma que Supabase expone cero tablas, mientras que el repositorio también contiene un amplio conjunto de migraciones PostgreSQL/Supabase. No es necesariamente una contradicción: la base conectada puede estar vacía; hace falta verificar la instancia real y registrar el resultado. | Pendiente de verificación con acceso de solo lectura a la base. |
| GEN-METRIC-001 | Media | El README declara 72% global y porcentajes por módulo sin publicar rúbrica ponderada, evidencia por criterio ni resultado de release asociado. | No verificable; no usar como métrica objetiva hasta instrumentarlo. |
| GEN-SEC-003 | Alta | El aislamiento multitenant depende de que todos los handlers pasen por la guardia canónica y de que las políticas RLS de PostgreSQL coincidan con ella. La existencia de una guardia no prueba cobertura de todas las rutas. | Requiere inventario exhaustivo de handlers y tests de integración. |
| GEN-SEC-004 | Alta | La redacción de secretos tiene un catálogo manual que puede divergir de las variables nuevas de `env-schema.ts`. | Requiere prueba automática que compare ambos catálogos y corpus de falsos positivos/negativos. |
| GEN-OPS-003 | Alta | La ausencia de lockfile impide garantizar instalaciones idénticas entre local, CI y despliegue. | Pendiente de elegir un package manager y generar su lockfile con la herramienta real. |

## Cambios realizados

### 1. Gate de arranque

- `src/lib/env-validator.ts`: permite inyectar el cargador de configuración para probar fallos y, si este falla, deriva el modo desde `ISABELLA_RUNTIME_MODE` y `NODE_ENV` en vez de etiquetar automáticamente el proceso como development.
- `src/server.ts`: si la configuración no es válida en production/staging, registra diagnósticos acotados y aborta el arranque.
- `test/security/config-hardening.test.ts`: pruebas para asegurar que los modos production y staging se preservan cuando falla la carga de configuración.

### 2. Frontera multitenant

- `src/lib/supabase-auth.ts`: ya no asigna `system` a usuarios sin tenant en `app_metadata`; mantiene el tenant vacío para que no se trate como identidad tenant-valid.
- `src/lib/tenant-guard.ts`: una identidad autenticada sin tenant canónico se rechaza con `boundaryOk = false`.
- `test/security/tenant-isolation.test.ts`: prueba negativa para una identidad sin tenant que intenta solicitar el tenant `system`.

## Evidencia y validación pendiente

No se afirma que las pruebas hayan pasado. El conector de GitHub permite modificar archivos y consultar metadatos, pero no ejecuta el entorno de desarrollo local. La rama debe pasar, como mínimo:

1. Instalación limpia con el package manager seleccionado y lockfile congelado.
2. TypeScript/typecheck.
3. ESLint.
4. Suite completa de Vitest, incluida `test/security/config-hardening.test.ts` y `test/security/tenant-isolation.test.ts`.
5. Build de producción.
6. Preflight actualizado y ejecución con variables de entorno ficticias en CI.
7. Pruebas de integración de autenticación, tenant, RLS y acceso a datos.
8. Verificación de que la configuración inválida impide arrancar staging/production, sin impedir builds de CI legítimos.
9. Verificación de health/readiness y despliegue canary con un artefacto identificado por SHA.

## Prioridad de la siguiente iteración

1. Unificar package manager, lockfile, runtime Node y scripts de package.json; después reescribir el preflight para que verifique el contrato elegido en vez de una arquitectura anterior.
2. Enumerar todas las rutas API y demostrar con tests que cada ruta protegida autentica, autoriza y valida tenant antes de tocar persistencia.
3. Ejecutar pruebas RLS contra una base desechable creada desde todas las migraciones; probar explícitamente acceso cruzado entre tenants.
4. Añadir una prueba de consistencia entre `ENV_VAR_CATALOG` y `BUILTIN_KEYS` del redactor.
5. Convertir el porcentaje de avance en una rúbrica medible: cada criterio debe tener peso, estado, enlace a evidencia, SHA y fecha.
6. No declarar producción, certificación legal, seguridad cuántica ni cumplimiento normativo hasta disponer de resultados comprobables.

## Regla de auditoría

Un archivo presente no prueba que una función esté conectada; una función conectada no prueba que esté autorizada; una prueba escrita no prueba que se haya ejecutado; y una ejecución exitosa en una rama no prueba que el despliegue use ese mismo commit. Cada afirmación de estado debe conservar su evidencia verificable.
