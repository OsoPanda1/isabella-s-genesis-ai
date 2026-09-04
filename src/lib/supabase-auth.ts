/**
 * AUTENTICACIÓN SUPABASE (src/lib/supabase-auth.ts)
 * -----------------------------------------------------------------
 * Driver de autenticación que resuelve una sesión de Supabase en una
 * identidad soberana (`PrincipalIdentity`) para el resto del sistema.
 *
 * Diseño por inyección: recibe el cliente de auth como dependencia
 * (nunca lo importa directo), lo que mantiene el módulo acoplado
 * sólo a un contrato mínimo y fácil de verificar. La construcción
 * del cliente real vive en `supabase.ts`.
 *
 * No sustituye a la autorización: resuelve QUIÉN eres (identidad);
 * el QUÉ puedes hacer lo decide `authorization.ts`.
 */

import { type PrincipalIdentity, type Role } from "./rbac";

/** Contrato mínimo del cliente de auth de Supabase que necesita este módulo. */
export interface SupabaseAuthClientLike {
  getUser: () => Promise<{ data: { user: UserLike } | null; error: { message: string } | null }>;
}

/** Usuario mínimo de Supabase. */
export interface UserLike {
  id: string;
  email?: string;
  phone?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  role?: string;
}

/** Fuente de la identidad para telemetría. */
export type AuthSource = "supabase_session" | "legacy_isa_token" | "oidc_id_token";

export interface ResolvedPrincipal {
  identity: PrincipalIdentity;
  source: AuthSource;
}

/**
 * Traduce el rol de Supabase/`app_metadata` a un rol canónico seguro.
 * Cualquier valor desconocido cae a `Guest` (fail-closed).
 */
export function mapSupabaseRole(raw: unknown): Role {
  if (typeof raw !== "string") return "Guest";
  const value = raw.toLowerCase();
  if (value === "sovereignowner" || value === "sovereign_owner" || value === "owner") {
    return "SovereignOwner";
  }
  if (value === "governance_admin" || value === "governance-admin" || value === "gov_admin") {
    return "governance_admin";
  }
  if (value === "operator") return "Operator";
  if (value === "auditor") return "Auditor";
  if (value === "system") return "System";
  return "Guest";
}

/**
 * Resuelve una identidad a partir de un usuario de Supabase. El tenant
 * se deriva de `app_metadata.tenant_id` o, en su defecto, de un tenant
 * de sistema genérico — nunca se toma del cliente.
 */
export function principalFromSupabaseUser(user: UserLike): ResolvedPrincipal {
  const app = (user.app_metadata ?? {}) as Record<string, unknown>;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const tenantId =
    typeof app.tenant_id === "string"
      ? app.tenant_id
      : typeof app.tenantId === "string"
        ? app.tenantId
        : "system";
  const role = mapSupabaseRole(app.role ?? app.roles);
  const username =
    typeof meta.username === "string"
      ? meta.username
      : (user.email ?? user.phone ?? `user_${user.id.slice(0, 8)}`);

  const identity: PrincipalIdentity = {
    subject: user.id,
    username,
    tenantId,
    role,
    scopes: ["openid", "profile"],
    authenticated: true,
  };
  return { identity, source: "supabase_session" };
}

/**
 * Obtiene la identidad actual del cliente de auth de Supabase.
 * Devuelve `null` si no hay sesión válida (no lanza para sesión ausente).
 */
export async function resolvePrincipalFromSession(
  client: SupabaseAuthClientLike,
): Promise<ResolvedPrincipal | null> {
  const { data, error } = await client.getUser();
  if (error || !data?.user) {
    return null;
  }
  return principalFromSupabaseUser(data.user);
}

export const SUPABASE_AUTH = {
  mapRole: mapSupabaseRole,
  fromUser: principalFromSupabaseUser,
  fromSession: resolvePrincipalFromSession,
};
