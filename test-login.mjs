import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envFile = fs.readFileSync(".env.staging", "utf-8");
envFile.split("\n").forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].trim();
  }
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testLogin() {
  const email = "gwyn.ukoha@gmail.com";
  const password = "SUPER_MSE5SLN7_admin123!";
  
  console.log("3. Verifying via /token with SERVICE KEY...");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY },
    body: JSON.stringify({ email, password }),
  });
  
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("TOKEN VERIFICATION FAILED:", errBody);
  } else {
    const data = await res.json();
    console.log("TOKEN VERIFICATION SUCCESS:", data.user.id);
  }
}

testLogin();
