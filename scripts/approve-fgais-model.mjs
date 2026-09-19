#!/usr/bin/env node
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const tenantId = process.env.FGAIS_MODEL_TENANT_ID;
const modelId =
  process.env.FGAIS_MODEL_ID ||
  process.env.LLM_DEFAULT_MODEL?.split("/").at(-1) ||
  "gemini-3-flash";
const version = process.env.FGAIS_MODEL_VERSION || modelId;
const artifactHash = process.env.FGAIS_MODEL_ARTIFACT_HASH || `provider:google:${modelId}`;

if (!databaseUrl || !tenantId) {
  console.error("FGAIS model approval requires DATABASE_URL and FGAIS_MODEL_TENANT_ID.");
  process.exit(2);
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query(
    `
    INSERT INTO public.fgais_model_registry
      (tenant_id, model_id, version, provider_id, territory_id, modalities, capabilities,
       enabled, production_approved, status, artifact_hash, license)
    VALUES ($1,$2,$3,'google','global','["text"]'::jsonb,'["text"]'::jsonb,true,true,'APPROVED',$4,'provider-managed')
    ON CONFLICT (tenant_id, model_id, version)
    DO UPDATE SET enabled=true, production_approved=true, status='APPROVED', artifact_hash=EXCLUDED.artifact_hash, updated_at=now()
  `,
    [tenantId, modelId, version, artifactHash],
  );
  console.log(JSON.stringify({ approved: true, tenantId, modelId, version }, null, 2));
} finally {
  await pool.end();
}
