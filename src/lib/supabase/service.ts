import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client sisi server dengan service role key — melewati RLS.
 * HANYA dipakai di dalam file "use server" (Server Actions) atau Route
 * Handler. JANGAN pernah diimpor dari Client Component.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
