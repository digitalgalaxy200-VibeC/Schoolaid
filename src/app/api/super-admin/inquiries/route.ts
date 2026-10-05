import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { INQUIRY_STATUSES, type InquiryStatus } from "@/lib/inquiries/config";

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  // Keep PostgREST's or() syntax intact: drop separators and wildcards from the term.
  const q = (url.searchParams.get("q") || "").replace(/[,()%*\\]/g, " ").trim().slice(0, 80);

  const supabase = getServiceClient();

  let query = supabase
    .from("inquiries")
    .select("*", { count: "exact" })
    .order("last_submitted_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && (INQUIRY_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }
  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,school_name.ilike.%${q}%`);
  }

  const [list, ...counts] = await Promise.all([
    query,
    ...INQUIRY_STATUSES.map((s) =>
      supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", s),
    ),
  ]);

  if (list.error) {
    console.error("[inquiries] list failed:", list.error);
    return NextResponse.json({ error: "Could not load inquiries" }, { status: 500 });
  }

  const byStatus = Object.fromEntries(
    INQUIRY_STATUSES.map((s, i) => [s, counts[i].count ?? 0]),
  ) as Record<InquiryStatus, number>;

  return NextResponse.json({
    data: list.data ?? [],
    total: list.count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    counts: byStatus,
  });
}
