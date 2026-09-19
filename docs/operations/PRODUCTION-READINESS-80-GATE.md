# Isabella AI Genesis — Production Readiness 80 Gate

**Version:** 4.3.3  
**Estado:** activo  
**Propósito:** definir una frontera verificable para elevar la preparación operacional sin convertir implementación estática en una certificación ficticia.

## Regla principal

Un control solo puede marcarse `PASS` cuando existe evidencia reproducible. La existencia de código, una migración, una pantalla o una variable declarada no constituye evidencia de operación.

Estados permitidos:

- `PASS`: ejecutado y verificado.
- `PARTIAL`: implementado pero falta una prueba completa.
- `UNKNOWN`: no existe evidencia suficiente.
- `FAIL`: existe evidencia de incumplimiento.
- `NOT_APPLICABLE`: justificado documentalmente.

## Gate 80

Para declarar **80% de preparación operacional** deben cumplirse todos los P0 y alcanzar al menos 80 puntos sobre 100 en la matriz siguiente.

| Dominio | Peso | Evidencia mínima |
|---|---:|---|
| Build reproducible | 10 | `pnpm install --frozen-lockfile`, typecheck, lint y build exitosos |
| Runtime/deployment | 15 | deployment READY + health/ready HTTP 200 |
| Auth/authorization | 10 | sesión productiva + API key/scopes/expiry/revoke verificados |
| CROWN/AEGIS | 10 | corpus allow/flag/deny y ausencia de bypass productivo |
| PostgreSQL/multi-tenant | 15 | migraciones + read/write + aislamiento tenant A/B |
| BookPI/economía | 10 | append/idempotencia/refund/reconciliation en sandbox del proveedor |
| Observabilidad/auditoría | 10 | trace/correlation IDs y cadena de auditoría verificable |
| DR/rollback | 5 | backup/restore y rollback reproducibles |
| Transparencia IA | 5 | `/api/ai/transparency` accesible y sin secretos |
| UX/cliente | 5 | smoke browser y estados desconocidos sin datos sintéticos |

## No negociables P0

1. No producción si Vercel/deployment está en `ERROR`.
2. No producción con instalación `--no-frozen-lockfile` en el gate.
3. No producción con `ALLOW_GUEST_CHAT=true`.
4. No producción con persistencia JSON durable.
5. No declarar telemetría simulada como telemetría real.
6. No presentar balances, roles o estados de cuenta sintéticos como reales.
7. No afirmar certificación legal o conformidad regulatoria sin evaluación formal independiente.
8. No afirmar proveedor/modelo por inferencia del cliente; debe proceder del runtime.

## Evidencia de despliegue

El deployment debe conservar como mínimo:

- commit SHA;
- build ID/deployment ID;
- versión Node y pnpm;
- checksum del artefacto;
- resultado de typecheck/lint/tests;
- resultado de migraciones;
- health/ready/deep;
- smoke autenticado de Isabella;
- prueba de memoria durable;
- prueba de aislamiento tenant;
- prueba de BookPI;
- resultado AEGIS/CROWN;
- correlación de auditoría;
- resultado de rollback/restore.

## Estado actual

El repositorio contiene una parte sustancial de los controles de seguridad, gobernanza, persistencia y cognición, pero este documento no convierte esos controles en evidencia operacional. Mientras Vercel no produzca un deployment saludable y no se ejecute la batería end-to-end, el estado global debe permanecer como `PARTIAL`/`UNKNOWN` según el control correspondiente.

## Regla anti-regresión

Cualquier commit que reintroduzca:

- `pnpm install --no-frozen-lockfile` en el gate;
- guest chat productivo;
- JSON durable productivo;
- valores financieros/roles sintéticos en el cliente;
- una ruta duplicada del gateway canónico;
- secretos o placeholders de secretos en UI;

debe bloquear el release.
