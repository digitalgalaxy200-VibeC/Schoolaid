import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  if (typeof window === "undefined" && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return new Proxy({} as any, {
      get: () => () => {},
    });
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
