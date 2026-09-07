# ADR-003: LATAM-AEGIS-X Defensive Integration

## Context

Aegis-X is designed to perform threat mitigation and model alignment checks. To keep roles decoupled, it must act as a threat reporting and alignment scoring service, rather than acting as a redundant identity authority.

## Decision

We integrate **LATAM-AEGIS-X** strictly as a defensive and policy advisory layer:

- Aegis-X evaluates input payloads for prompt injection, adversarial exploits, and rule violations.
- It returns risk metrics, threat scores, and recommendations.
- The centralized **Authorization and Policy Enforcement Planes** (e.g., CROWN and Authorization) then execute the final access decision (proceed, block, or prompt human-in-the-loop validation) based on Aegis-X recommendations.

## Consequences

- Clean separation of concerns between threat detection (Aegis-X) and policy enforcement (CROWN).
- High performance and predictability of internal middleware checks.
