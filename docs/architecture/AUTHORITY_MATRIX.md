# AUTHORITY_MATRIX.md — Matriz de Autoridad y Confianza Canónica

## Isabella Villaseñor AI v4.2.0

| Dimensión de Decisión            | Módulo de Autoridad Principal | Archivos Fuertemente Gobernados                               |
| :------------------------------- | :---------------------------- | :------------------------------------------------------------ |
| **Identidad del Actor**          | `PrincipalContext`            | `src/lib/principal-context.ts`, `src/lib/credential-types.ts` |
| **Autenticación (Verification)** | `CredentialVerifier` / `OIDC` | `src/lib/jwt-verifier.ts`, `src/lib/api-key-authenticator.ts` |
| **Aislamiento Multitenant**      | `Tenant Guard`                | `src/lib/tenant-guard.ts`, `src/lib/tenant-context.ts`        |
| **Matrices de Permisos**         | `Authorization Plane`         | `src/lib/authorization.ts`, `src/lib/permission-matrix.ts`    |
| **Control de Acceso (RBAC)**     | `RBAC Engine`                 | `src/lib/rbac.ts`                                             |
| **Políticas de Atributo (ABAC)** | `ABAC Engine`                 | `src/lib/abac.ts`                                             |
| **Gobernanza de Modelos**        | `CROWN Core`                  | `src/lib/crown.ts`                                            |
| **Defensa Perimetral & Threat**  | `LATAM Aegis-X Firewall`      | `src/lib/latam-aegis-x.ts`                                    |
| **Aislamiento de Cómputo**       | `Sandbox Broker`              | `src/lib/sovereign-sandbox.ts`                                |
| **Registro de Eventos Críticos** | `Sovereign Ledger (BookPI)`   | `src/lib/sovereign-engine.ts`                                 |
| **Acceso a Secretos y Llaves**   | `Secrets Provider`            | `src/lib/secrets.ts`                                          |
| **Lectura de Configuración**     | `Config Service`              | `src/lib/config.ts`, `src/lib/env-schema.ts`                  |

---

## Reglas de Coexistencia de Confianza

1. **Jerarquía Descendente**: Una identidad resuelta (`PrincipalContext`) no otorga privilegios de forma implícita. Debe pasar por las matrices de control de acceso (`RBAC` y `ABAC`) para comprobar que el actor posee el rol adecuado para el recurso.
2. **Ceiling (Límite Máximo) de Scopes**: Las credenciales de API Key poseen un subconjunto de scopes autorizados. El alcance final del actor siempre es la **intersección** (nunca la unión) de las capacidades del rol y los scopes de la credencial:
   $$\text{Capacidad Efectiva} = \text{Capacidades del Rol} \cap \text{Scopes de la Credencial}$$
3. **No-Escalación**: Ninguna credencial de API Key o cuenta de servicio puede otorgar privilegios que superen los del rol asignado a su propietario original.
4. **Validación en Frío y Caliente**: Las transacciones financieras y retiros en el modulo `MONETIZATION` requieren obligatoriamente de auditoría en caliente por el ledger BookPI. Si la firma inmutable de BookPI no coincide o está rota, se revoca dinámicamente la transacción y se bloquea el retiro.
