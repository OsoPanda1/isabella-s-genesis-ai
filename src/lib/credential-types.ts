export type CredentialType = "bearer" | "api_key" | "service_account";

export interface AuthenticatedPrincipal {
  subject: string;
  tenantId: string;
  role: string;
  scopes: string[];
  credentialId: string;
  credentialType: CredentialType;
  issuedAt: string;
  expiresAt?: string;
  authenticationMethod: string;
}

export interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  owner_id: string;
  name: string;
  prefix: string;
  key_hash: string;
  role: string;
  scopes: string[];
  status: "active" | "suspended" | "expired" | "revoked";
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  revoked_at?: string;
  rotated_from?: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
}
