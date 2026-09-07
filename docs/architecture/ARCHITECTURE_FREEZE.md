# ARCHITECTURE_FREEZE.md — Congelamiento Arquitectónico y Gobernanza de Sistemas

## Isabella Villaseñor AI v4.2.0

**Ecosistema:** TAMV ONLINE NETWORK / RDM Digital Hub / Nodo Cero (Real del Monte, Hidalgo, México)  
**Clasificación:** Directiva Operativa de Estabilidad Arquitectónica (ADR Zero-Trust)

---

## 1. Propósito y Mandato

Este documento declara un **Congelamiento Arquitectónico Estricto (Architecture Freeze)** sobre el plano de seguridad, autenticación, autorización e integridad del ecosistema cognitivo de Isabella Villaseñor AI.

Durante el programa de endurecimiento de nivel de producción (Hardening Program), queda terminantemente prohibida la introducción de nuevos subsistemas, librerías redundantes o capas de autorización paralelas que no estén explícitamente detalladas en esta directiva.

---

## 2. Mapa Canónico de Componentes Existentes y Autoridades

El plano de Isabella opera bajo la regla de **Una Responsabilidad, Un Punto de Autoridad Único (One Responsibility -> One Authoritative Implementation)**. Queda vetada la duplicación de cualquiera de las siguientes responsabilidades:

| Componente                     | Archivo de Autoridad           | Responsabilidad Canónica                                                        |
| :----------------------------- | :----------------------------- | :------------------------------------------------------------------------------ |
| **Identity & Authentication**  | `src/lib/principal-context.ts` | Resolución única de credenciales (OIDC, JWT, API Keys) a contexto de Principal. |
| **API Key Logic**              | `src/lib/api-key-service.ts`   | Ciclo de vida completo, hashing de secretos de alta entropía y persistencia.    |
| **Authorization Plane**        | `src/lib/authorization.ts`     | Punto de decisión centralizado (RBAC, ABAC, Scopes y Tenant-Isolation).         |
| **Defensive Firewall**         | `src/lib/latam-aegis-x.ts`     | Mitigación activa, inspección de payload y análisis de amenazas (Aegis-X).      |
| **Constitutional Enforcement** | `src/lib/crown.ts`             | Arbitraje de prompts, asignación de pesos y control de conformidad.             |
| **Sandbox Execution**          | `src/lib/sovereign-sandbox.ts` | Aislamiento físico de ejecución y broker de herramientas (ORION).               |
| **Cryptographic Ledger**       | `src/lib/sovereign-engine.ts`  | Sincronización inmutable, encadenamiento SHA-256 de bloques (BookPI).           |
| **State & Environment**        | `src/lib/config.ts`            | Punto de lectura unificado y tipado de variables globales mediante `config()`.  |

---

## 3. Directivas de Prevención de Duplicidad

1. **Prohibición de Acceso Directo a `process.env`**: Fuera de `src/lib/config.ts` y del validador de esquema centralizado en `src/lib/env-schema.ts`, ningún módulo funcional debe leer directamente variables del sistema operativo.
2. **Prohibición de Mocks de Producción**: Queda estrictamente vetado el uso de datos mock en módulos de backend. Si un servicio (ej. PQC, Quantum) requiere simulación, se declarará explícitamente como `status: "simulated"` o `Unavailable` en el contrato, reportando con total honestidad el estado real del hardware.
3. **No UI-Bypass**: Los componentes visuales jamás deben evaluar privilegios de forma autónoma para saltar el Trust Plane. La UI se limita a renderizar el estado devuelto y verificado por el servidor.
4. **Flujo de Seguridad Transversal Unificado**:
   ```text
   Request ──> Identity Auth (OIDC/APIKey) ──> PrincipalContext ──> Authorization ──> Aegis ──> CROWN ──> Execution ──> Audit Ledger
   ```

---

## 4. Proceso de Cambio (Excepción de Arquitectura)

Cualquier desviación de este mapa de componentes requerirá:

1. La redacción de una **Arquitectura Decision Record (ADR)** justificando la necesidad estructural.
2. La validación del sentinel **ARGUS** evaluando el riesgo sistémico de la introducción del nuevo módulo.
3. Aprobación y firma del operador con rol `SovereignOwner`.
