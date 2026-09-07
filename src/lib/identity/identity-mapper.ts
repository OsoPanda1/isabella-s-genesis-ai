import type { Role } from "../rbac";

// ============================================================================
// IDENTITY MAPPER (src/lib/identity/identity-mapper.ts)
// ----------------------------------------------------------------------------
// Traduce los claims de Supabase Auth / JWT canónico a un Principal interno.
// Autoridad: la identidad se deriva SOLO de Supabase Auth (FASE 1.2 — ruta única).
// ============================================================================

export interface SupabaseClaims {
  sub: string;
  tenantId?: string;
  role?: string;
  scope?: string[];
  jti?: string;
  exp?: number;
  aud?: string;
  iss?: string;
}

export interface Principal {
  userId: string;
  tenantId: string;
  role: Role;
  scopes: string[];
  jti?: string;
}

/** Traduce claims de Supabase Auth a un Principal tipado. */
export function mapToPrincipal(claims: SupabaseClaims): Principal {
  const principal: Principal = {
    userId: claims.sub,
    tenantId: claims.tenantId ?? "",
    role: normalizeRole(claims.role),
    scopes: claims.scope ?? [],
  };
  if (claims.jti) principal.jti = claims.jti;
  return principal;
}

/** Normalización segura de rol (fail-safe a Guest). */
export function normalizeRole(role?: string): Role {
  switch (role) {
    case "SovereignOwner":
    case "Operator":
    case "Auditor":
    case "Guest":
    case "System":
    case "governance_admin":
      return role;
    default:
      return "Guest";
  }
}
