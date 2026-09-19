# ARC-0001: Gobernanza técnica y operativa

## Propósito

Establecer el control interno para que código, modelos, dependencias y conectividades externas sean reproducibles, auditables y reversibles.

## Reglas

- Una función canónica por responsabilidad; las fachadas legacy solo reexportan y declaran su deprecación.
- Ninguna dependencia externa se usa sin versión fijada, licencia verificada, propietario, finalidad, datos tratados y plan de salida.
- Ningún modelo se promueve a producción sin evaluación, hash, revisión de sesgo, autorización y rollback.
- Ningún secreto aparece en código, documentación, pruebas o logs.
- Todo endpoint debe validar entrada, limitar recursos, registrar `traceId` y devolver el contrato de error estable.

## Clasificación de cambios

- **P0:** seguridad, datos, autoridad o despliegue; requiere aprobación y rollback.
- **P1:** disponibilidad, rendimiento o contrato público; requiere pruebas de integración.
- **P2:** documentación, ergonomía o refactor; requiere typecheck y tests afectados.

## Matriz mínima de dependencias

Cada entrada debe documentar: paquete/proveedor, versión, licencia, superficie, datos, permisos, residencia, health check, costo, fallback y fecha de revisión.

## Gate

`pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm security:scan` debe pasar antes de liberar.
