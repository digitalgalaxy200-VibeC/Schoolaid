import { NextResponse } from "next/server";
import { originAllowed } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase/service";
import { HONEYPOT_FIELD, INQUIRY_KIND, parseInquiry } from "@/lib/inquiries/config";

/**
 * Public landing-page form (the "Waitlist").
 *
 * This is the only door into the `inquiries` table for the public. It is
 * unauthenticated by design, so every protection lives here:
 *   - same-origin check (CSRF),
 *   - a honeypot field that bots fill and people never see,
 *   - a per-IP limit, keyed separately from login so the two never share a budget,
 *   - strict validation that returns only declared fields,
 *   - the same response whether the email is new or already on the list, so the
 *     form cannot be used to discover who has signed up.
 */

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const OK = () => NextResponse.json({ ok: true }, { status: 201 });

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Bots fill every field. Answer as if it worked so they learn nothing.
  const trap = (body as Record<string, unknown> | null)?.[HONEYPOT_FIELD];
  if (typeof trap === "string" && trap.trim() !== "") return OK();

  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (!(await checkRateLimit(`inquiry:${ip}`, RATE_LIMIT, RATE_WINDOW_MS))) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 },
    );
  }

  const { value, errors } = parseInquiry(body);
  if (!value) {
    return NextResponse.json(
      { error: "Please check the highlighted fields.", fields: errors.list },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const source = (() => {
    const s = (body as Record<string, unknown>).source;
    return typeof s === "string" && /^[a-z0-9_-]{1,40}$/i.test(s) ? s : "landing";
  })();

  const { error: insertError } = await supabase
    .from("inquiries")
    .insert({ ...value, kind: INQUIRY_KIND, source });

  if (!insertError) return OK();

  // 23505 = this email is already on the list. Refresh the row instead of failing.
  if (insertError.code === "23505") {
    const { data: existing } = await supabase
      .from("inquiries")
      .select("id, submit_count, status")
      .eq("kind", INQUIRY_KIND)
      .eq("email", value.email) // stored lowercased by parseInquiry
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from("inquiries")
        .update({
          ...value,
          submit_count: (existing.submit_count ?? 1) + 1,
          last_submitted_at: new Date().toISOString(),
          // A closed lead who writes again is a live lead again.
          status: existing.status === "closed" ? "new" : existing.status,
        })
        .eq("id", existing.id);
      if (!updateError) return OK();
      console.error("[inquiries] update failed:", updateError);
    }
  } else {
    console.error("[inquiries] insert failed:", insertError);
  }

  return NextResponse.json(
    { error: "We could not save your details. Please try again shortly." },
    { status: 503 },
  );
}
