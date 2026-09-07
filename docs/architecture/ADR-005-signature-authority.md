# ADR-005: Autoridad de firma BookPI y enforcement del algoritmo

- **Estado:** Aceptado · **Fecha:** 2026-09-05
- **Contexto:** Se ejecutaba `createSign("SHA256")` aunque la configuración
  decía `ECDSA-P384`; el enum de `BOOKPI_SIGNATURE_ALGORITHM` no incluía la
  firma realmente usada (RSA-SHA256) y permitía "simulaciones".
- **Decisión:** Un único módulo `src/lib/crypto/bookpi-signer.ts` centraliza:
  - `getSigningAlgorithm()` → algoritmo resuelto de `config()`.
  - `isSimulatedAlgorithm()` → `ML-DSA-87` es SOLO simulación.
  - `signBlockHash(hash)` → firma real con la clave de `BOOKPI_SIGNING_KEY`;
    lanza si no hay clave (§6.6). En producción, algorio simulado = fail-closed.
  - `verifyBlockSignature(hash, sig)` → verificación con la clave pública.
  El runtime SIEMPRE ejecuta el algoritmo declarado (no a ciegas).
- **Algoritmos minimizados:**
  - `RSA-SHA256` (clave RSA-2048 de `BOOKPI_SIGNING_KEY`) — dev + tests.
  - `ECDSA-P384` — default declarado para producción.
  - `ML-DSA-87` — NO asignable como autoridad (simulación únicamente).

## Referencias
- `src/lib/crypto/bookpi-signer.ts`; `.env.local` (RSA-SHA256), `.env.example`.