# RFC-0002 — Conectores gobernados por usuario

**Estado:** Implementado en fase 1  
**Dominios:** conectividad externa, identidad, trazabilidad y gobernanza

## Objetivo

Isabella puede iniciar autorizaciones y consultar GitHub, Slack y Linear mediante Vercel Connect sin almacenar tokens ni pedir credenciales al usuario. Cada operación usa el sujeto autenticado estable `userId` de `PrincipalContext`, scopes mínimos por proveedor y una política fail-closed.

## Contrato

- `GET /api/connect/{github|slack|linear}` inicia autorización.
- `POST /api/connect/{github|slack|linear}` consulta el estado mínimo del vínculo y el perfil del proveedor.
- `POST /api/connect/{provider}/webhook` recibe eventos verificados reenviados por Vercel Connect.
- Las credenciales permanecen en Vercel Connect; no entran en logs, respuestas ni persistencia de Isabella.
- Invitados, identidades ambiguas y scopes no declarados se rechazan.

## Gobernanza

CROWN conserva el control del endpoint mediante `withSovereignAuth`. Los conectores se registran individualmente, se pueden revocar por sujeto y no comparten caché ni identidad. Las acciones de escritura no se habilitan por defecto: requieren una política y un contrato adicional con aprobación humana.

## Riesgos residuales

La primera fase valida conectividad y lectura. La deduplicación de eventos, persistencia de cursores y acciones de escritura deben añadirse como una fase separada con idempotencia por `x-vercel-connect-event-id`, retención mínima y pruebas de aislamiento multiusuario.
