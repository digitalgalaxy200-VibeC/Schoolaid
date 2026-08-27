import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase/service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (!(await checkRateLimit(ip, 5, 10 * 60000))) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Honeypot — real visitors never fill a field they can't see.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ success: true });
  }

  const full_name = String(body.full_name || "").trim();
  const school_name = String(body.school_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim() || null;
  const country = String(body.country || "").trim() || null;
  const city = String(body.city || "").trim() || null;
  const message = String(body.message || "").trim() || null;
  const source = String(body.source || "landing_page").trim() || "landing_page";

  if (!full_name || !school_name || !email) {
    return NextResponse.json({ error: "Name, school, and email are required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from("waitlist_submissions").insert({
      full_name,
      school_name,
      email,
      phone,
      country,
      city,
      message,
      source,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[public/waitlist] insert failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not submit right now. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
