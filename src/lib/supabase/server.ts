import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = "https://iojiahkehnijxxczrgft.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvamlhaGtlaG5panh4Y3pyZ2Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzODQxMjMsImV4cCI6MjA5ODk2MDEyM30.3mbfezCTPbd-lKhwjwwV7vgLZGoysVNoxqRZh8eFjkE";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });
}
