# Isabella AI Genesis — Matriz de reglamentos y gobernanza

**Nota:** matriz de control técnico. No sustituye dictamen jurídico.

| Dominio | Control | Evidencia requerida | Estado inicial |
|---|---|---|---|
| Privacidad | finalidad/minimización/retención | policy + tests + registros | En implementación |
| Seguridad | autenticación, autorización, secretos | tests + configuración + evidencia | En implementación |
| IA | transparencia y supervisión humana | policy + UI + audit evidence | Diseñado |
| Alto impacto | revisión humana | policy + enforcement test | Diseñado |
| Finanzas | ledger/idempotencia/reconciliación | integration + restore + audit | Condicionado |
| Supply chain | SCA/SBOM/licenses | CI artifacts | Parcial |
| Accesibilidad | interfaz usable y accesible | automated + manual audit | Pendiente |
| Continuidad | backup/restore/RPO/RTO | drill evidence | Pendiente |

## Jerarquía

1. legislación y obligaciones contractuales aplicables;
2. políticas de seguridad y privacidad;
3. CROWN/AEGIS y reglas de autoridad;
4. configuración de despliegue;
5. comportamiento de producto;
6. preferencias de usuario.

Una preferencia de usuario nunca puede anular una restricción legal, de seguridad, privacidad o autoridad.

## Estado

Los estados `Planned`, `Designed`, `Partial`, `Implemented`, `Tested`, `Verified` y `Production-Verified` deben utilizarse con precisión. Una afirmación jurídica solo puede marcarse como cumplida cuando exista la base legal, control operacional y evidencia adecuados.
