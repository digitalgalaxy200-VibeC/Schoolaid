import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = "https://iojiahkehnijxxczrgft.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvamlhaGtlaG5panh4Y3pyZ2Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzODQxMjMsImV4cCI6MjA5ODk2MDEyM30.3mbfezCTPbd-lKhwjwwV7vgLZGoysVNoxqRZh8eFjkE";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
