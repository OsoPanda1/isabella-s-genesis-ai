# Isabella Villaseñor AI

Interfaz cognitiva territorial para explorar contexto, gobernanza, memoria, herramientas y evidencia con decisión humana explícita.

> Estado de implementación: **72% funcional integrado**. El núcleo visual, navegación, intro cinematográfica, catálogo de skills, observabilidad y capas de gobernanza están operativos. La conexión de datos de producción queda preparada, pero el proyecto Supabase conectado actualmente expone **0 tablas**; por seguridad no se inventan registros ni se presentan datos simulados como reales.

## Qué existe hoy

- Intro cinematográfica accesible, con respaldo visual local, reproducción opcional desde Mux y telemetría de FPS/progreso.
- Workspace unificado para Isabella, con navegación por módulos y carga estable en Vite.
- Catálogo y ejecución de skills cognitivas con límites, autorización y trazabilidad.
- Capas de gobernanza, auditoría, seguridad, contratos API, economía y motores de ejecución.
- Cliente Supabase validado por configuración: si faltan credenciales, informa estado no configurado en vez de crear datos falsos.
- UI responsive basada en React, Tailwind y componentes Radix/shadcn.

## Principios de producción

1. **Sin mockdata operativo.** Los módulos deben consumir APIs, Supabase o servicios conectados. Los estados vacíos se muestran como estados vacíos.
2. **Seguridad por defecto.** Validación de entrada, autorización explícita, procedencia de datos, mínimo privilegio y no exposición de claves secretas en cliente.
3. **Humano en el circuito.** Isabella no ejecuta acciones externas sensibles sin aprobación verificable.
4. **Observabilidad.** Las decisiones importantes deben producir eventos, evidencias y errores estructurados sin filtrar secretos.
5. **Supabase con RLS.** Cuando existan tablas, cada tabla expuesta deberá tener RLS y políticas alineadas con el modelo de acceso real.

## Arquitectura

```text
src/
├── components/isabella/   Experiencia visual y módulos del workspace
├── lib/                   Dominios, contratos, seguridad, skills y persistencia
├── routes/                Rutas de la aplicación y APIs
├── server-routes/api/     Integraciones server-side y endpoints protegidos
└── components/ui/         Primitivas accesibles de interfaz
```

La aplicación es un proyecto Vite + React + TypeScript con TanStack Router/Query. Supabase se usa como fuente de persistencia real cuando el esquema y las políticas están disponibles. No se utiliza `localStorage` como base de datos.

## Desarrollo

```bash
bun install
bun run dev
```

Validación de producción:

```bash
bun run build
bun run lint
```

## Variables de entorno

Configura las variables gestionadas por el proyecto para Supabase. Nunca las hardcodees ni subas claves secretas:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` cuando se use el flujo de autenticación del preview
- Variables opcionales de servicios multimedia o IA, únicamente cuando el módulo correspondiente esté habilitado

## Datos reales y despliegue

El estado actual de Supabase fue verificado antes de esta versión y no contiene tablas. Para activar persistencia productiva, primero define el esquema, relaciones y RLS mediante el flujo de Supabase; después conecta las consultas específicas de cada módulo. Hasta entonces, Isabella conserva un comportamiento seguro: muestra configuración/estado vacío y no reemplaza la ausencia de datos por fixtures.

El despliegue recomendado es Vercel conectado al repositorio. Ejecuta el build de producción, revisa variables de entorno, prueba autenticación y verifica las políticas RLS antes de habilitar acciones mutables.

## Progreso real

**72%** representa el estado integrado del producto, no una promesa de completitud:

- 90% experiencia base y navegación
- 85% interfaz cinematográfica y responsive
- 78% dominio de gobernanza/seguridad
- 65% observabilidad y contratos
- 40% persistencia productiva, porque el esquema Supabase aún está vacío
- 35% operación final de despliegue y datos vivos

El porcentaje subirá cuando existan tablas reales, migraciones revisadas, RLS verificado, pruebas de extremo a extremo y despliegue validado con datos no simulados.

## Licencia y autoría

Proyecto Isabella Villaseñor AI de OsoPanda1. Los documentos de arquitectura y las decisiones de seguridad forman parte del contexto del producto; el código fuente es la autoridad ejecutable.
