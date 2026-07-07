import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://iojiahkehnijxxczrgft.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvamlhaGtlaG5panh4Y3pyZ2Z0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzM4NDEyMywiZXhwIjoyMDk4OTYwMTIzfQ.B65fIDG8h6a4lsEE8qwnRanik4sVo9A-w3Vu97QhPr0";

// Service-role Supabase client — bypasses GoTrue and works directly with DB
export function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
