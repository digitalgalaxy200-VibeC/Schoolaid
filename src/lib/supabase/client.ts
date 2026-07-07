import { createBrowserClient } from "@supabase/ssr";

// Always reads from .env.local — single source of truth
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
