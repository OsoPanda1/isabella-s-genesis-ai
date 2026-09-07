# ADR-003: Payload canónico y hash determinista

- **Estado:** Aceptado · **Fecha:** 2026-09-05
- **Contexto:** El hash del bloque incluía campos no canónicos
  (`signatureAlgorithm` con valor "SHA-256" mientras la firma era "RSA-SHA256"),
  rompiendo `verifyIntegrity` tras cada append.
- **Decisión:** Un único serializador `canonicalBookPiPayload` en
  `src/lib/bookpi/canonical-payload.ts` con orden fijo:
  `index|timestamp|tenantId|userId|operation|category|costDecimal|tokensConsumed|previousHash|status|nonce`.
  **Excluye** `blockHash`, `pqcSignature` y `signatureAlgorithm` (autoreferencias
  circular + porciones de autoridad).
- **Propiedades:** la representación en append (base sin `blockHash`) y en
  verify (bloque completo) es idéntica; el resultado es dependiente del estado
  exacto (cost/prevHash/status/nonce) — cualquier alteración cambia el hash.

## Referencias
- Tests: `test/bookpi/bookpi-integrity.test.ts` (canonical, tamper 002-005).