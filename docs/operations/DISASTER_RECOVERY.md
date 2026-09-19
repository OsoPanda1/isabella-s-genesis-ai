# Runbook: Disaster Recovery (isabella-ai-genesis)

> RPO ≤ 24h (backup diario) · RTO ≤ 2h (restore + verificación).
> Fuente autoritativa: PostgreSQL (`DATABASE_URL`). Todo lo demás es
> derivado y reconstruible.

## 1. Backup diario

```bash
DATABASE_URL=... node scripts/db-backup.mjs ./backups/isabella-$(date +%F).json
```

- Solo lectura (`SELECT` por tabla, orden FK).
- Manifiesto con `sha256` por tabla; el script imprime conteos.
- Conservar 30 snapshots; el manifiesto permite detectar manipulación.

## 2. Verificación del snapshot (sin tocar la DB)

```bash
node -e "import('./scripts/db-snapshot-lib.mjs').then(async ({verifySnapshot}) => {
  const fs = await import('node:fs');
  const snapshot = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  const errors = verifySnapshot(snapshot);
  console.log(errors.length === 0 ? 'SNAPSHOT OK' : errors.join('\n'));
  process.exit(errors.length === 0 ? 0 : 1);
})" ./backups/isabella-YYYY-MM-DD.json
```

## 3. Restore (aditivo, nunca destructivo)

```bash
DATABASE_URL=... node scripts/db-restore.mjs ./backups/isabella-YYYY-MM-DD.json --confirm
```

- Verifica el manifiesto ANTES de conectar.
- `INSERT ... ON CONFLICT DO NOTHING`: jamás sobrescribe ni borra.
- Sin `--confirm` no hace nada (fail-closed).

## 4. Post-restore (obligatorio)

1. `node scripts/db-verify.mjs` (estructura de migraciones).
2. Reconciliación económica: comparar `sumEconomicBalance` por tenant
   contra el snapshot (`economic_events`).
3. `verifyIntegrity` de BookPI (endpoint o repo).
4. Rotar secretos si la causa fue compromiso (`ENCRYPTION_MASTER_KEY`,
   `AUTH_JWT_SECRET`, Stripe): ver matriz de encriptación.
5. Verificar `/api/health/ready` → 200 y `/api/health/deep` → 200.

## 5. Escenarios

| Escenario | Acción |
|---|---|
| Borrado accidental de filas | Restore aditivo del último snapshot + reconciliación |
| Corrupción de cadena (BookPI/auditoría) | NO restaurar encima: exportar evidencia, restore en DB limpia, comparar |
| Compromiso de secretos | Rotar + revocar sesiones/API keys + auditar `audit_events` |
| Caída del proveedor PG | Failover del proveedor (Neon/Supabase PITR) y luego backup lógico |
| Multi-región | Fuera de alcance actual: RPO/RTO arriba aplican a región única |

## 6. Lo que NO cubre este runbook (deuda declarada)

- Replicación multi-región en caliente.
- Backups cifrados en reposo fuera del proveedor (el snapshot JSON contiene
  datos: custodiarlo como secreto o cifrarlo con `EnvKMSProvider.encrypt`).
