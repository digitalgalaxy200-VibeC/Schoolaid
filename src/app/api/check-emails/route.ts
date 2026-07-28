import { NextResponse } from "next/server";
const MGMT = "https://api.supabase.com/v1/projects/iojiahkehnijxxczrgft/database/query";

async function query(sql: string) {
  const r = await fetch(MGMT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, body: JSON.stringify({ query: sql }) });
  return r.json();
}

export async function GET() {
  const res = await query("SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NULL");
  return NextResponse.json(res);
}
