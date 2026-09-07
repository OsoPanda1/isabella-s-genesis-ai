# ADR-002: Sovereign API Key Security Architecture

## Context

Third-party clients and microservices need machine-to-machine integrations to invoke Isabella's capabilities (e.g., geographic mapping, voice rendering, and ledger validation) without interactive OIDC authorization sessions.

## Decision

We implement a native, production-grade **API Key Management and Verification System**:

- API Keys follow the format `isa_live_<random-secret>`.
- The full raw secret is shown **only once** to the creator and never persisted in plaintext.
- The server stores only a secure, highly-entropic **HMAC-SHA-256 key hash** alongside a public key prefix for lookup.
- API keys are strongly bound to a Tenant ID, Owner ID, Role, and granular **Credential Scopes** which serve as a logical ceiling for capabilities.

## Consequences

- Prevents database credential enumeration.
- Avoids plaintext leakage in logs and telemetry systems.
- Ensures strict isolation between different tenant API key environments.
