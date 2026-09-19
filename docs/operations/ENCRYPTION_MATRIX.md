# Matriz de encriptación (isabella-ai-genesis)

> Qué se cifra, con qué, dónde viven las claves y cómo se rota.
> Claves: NUNCA en código/logs/UI; solo `ENCRYPTION_MASTER_KEY`,
> `AUTH_JWT_SECRET` y secretos de proveedor vía entorno validado.

| Dato | Mecanismo | Clave | Rotación |
|---|---|---|---|
| Tokens de sesión/API (JWT) | HS256 firmado | `AUTH_JWT_SECRET` (≥16) | Re-emitir + revocar sesiones (`is_active=false`) |
| API keys almacenadas | PBKDF2-SHA512 100k + HMAC-SHA512 con master + salt única (`v7`, timing-safe) | `API_KEY_HASH_SECRET` | `rotate-api-key` (grace period) |
| Cadena BookPI/auditoría | SHA-256/SHA3 + ECDSA-P384 o RSA-SHA256 | `BOOKPI_SIGNING_KEY` / `AEGIS_AUDIT_SECRET` | Nueva clave + re-verificación de cadena |
| Sellos de auditoría | HMAC-SHA3-512 (`audit-seal-v1`) | `AEGIS_AUDIT_SECRET` (≥32) | Re-sellar desde eventos (cadena intacta) |
| Campos sensibles aplicativos | AES-256-GCM (`EnvKMSProvider`, subclave HKDF-SHA3-512 por secreto) | `ENCRYPTION_MASTER_KEY` (≥32) | Re-cifrar con formato `v1:iv:ct:tag` versionado |
| Transporte | TLS del proveedor (Vercel/Neon/Supabase) | gestionada por proveedor | automática |
| Reposo PG | Cifrado del proveedor de Postgres | gestionada por proveedor | automática |
| Backups JSON (`db-backup`) | **SIN cifrar por defecto** | — | Custodiar como secreto o cifrar con `EnvKMSProvider.encrypt` (ver runbook DR) |

## Reglas

1. ML-DSA-87 es SIMULATION-ONLY: jamás autoridad de firma.
2. `secure/` + `secret-redactor` evitan fugas a logs/telemetría.
3. Rotación de `AUTH_JWT_SECRET` invalida todos los JWT (ventana: TTL 1h).
4. Snapshots de backup contienen PII potencial: tratarlos como secretos.
