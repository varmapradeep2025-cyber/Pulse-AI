import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

/**
 * Global service-role client for authorized system operations (e.g. background worker,
 * atomic sequence increment RPCs, schema verification).
 *
 * NOTE: As documented in security audits, service-role queries bypass PostgreSQL Row Level
 * Security (RLS). All caller routes MUST enforce strict application-layer authorization.
 */
export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

/**
 * Creates a user-scoped Supabase client that forwards the authenticated user's JWT.
 * When queries are sent through this client, PostgREST evaluates PostgreSQL Row Level
 * Security (RLS) policies against the authenticated user's claims (auth.uid()), ensuring
 * defense-in-depth isolation between tenants and users.
 */
export function createUserScopedSupabase(userJwt: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`,
      },
    },
  });
}
