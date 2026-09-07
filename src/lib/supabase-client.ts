import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

// ============================================================================
// SUPABASE CLIENT (src/lib/supabase-client.ts)
// ----------------------------------------------------------------------------
// Cliente Supabase de usuario para operaciones tenant-scoped (FASE 4).
// No usa service_role: las políticas RLS actúan como segunda barrera real,
// con el JWT del principal como identidad (auth.uid()).
// ============================================================================

/**
 * Crea un cliente Supabase autenticado con el JWT del usuario (no service_role).
 * Si no se provee accessToken, usa la anon key (RLS sigue activo).
 * Nunca cae a service_role para operaciones tenant-scoped.
 */
export function createSupabaseClient(accessToken?: string): SupabaseClient {
  const cfg = config();
  if (!cfg.SUPABASE_URL) {
    throw new Error("SUPABASE_URL es requerido para operaciones tenant-scoped.");
  }
  const anonKey = cfg.SUPABASE_ANON_KEY ?? "";
  if (!accessToken && !anonKey) {
    throw new Error(
      "Se requiere accessToken de usuario o SUPABASE_ANON_KEY para operaciones tenant-scoped (service_role prohibido).",
    );
  }
  return createClient(cfg.SUPABASE_URL, accessToken ?? anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

/**
 * Instancia de solo lectura del estado de Supabase configurado.
 * Útil para diagnósticos que no requieren RLS de usuario.
 */
export function getSupabaseUrl(): string | null {
  try {
    return config().SUPABASE_URL ?? null;
  } catch {
    return null;
  }
}
