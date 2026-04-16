import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Support both the web app's NEXT_PUBLIC_SUPABASE_URL and a plain SUPABASE_URL
// so the worker .env only needs one of them.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required");
}

// Singleton — shared across all workers in the same process.
let _client: SupabaseClient | null = null;

// Service role client — bypasses RLS. Only used in worker processes, never in browser.
export function adminClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(supabaseUrl!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return _client;
}
