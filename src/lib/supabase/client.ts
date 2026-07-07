import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://acxgfhvptoluhlxuttly.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjeGdmaHZwdG9sdWhseHV0dGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDQzNzksImV4cCI6MjA5ODk4MDM3OX0.aku3B1StfTn2wJBi8DWO5IncpQexQ9zY7_rRMgS34eM";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
