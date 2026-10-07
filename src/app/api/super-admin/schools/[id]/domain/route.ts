import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { id } = await params;

  // The URL segment may be a SLUG — every screen links schools by slug — and
  // `website_configs.school_id` is a uuid column, so it is resolved to the
  // school's id the same way the sibling routes resolve it.
  const column = isUUID(id) ? "id" : "slug";
  const { data: school } = await supabase.from("schools").select("id").eq(column, id).maybeSingle();
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  const { custom_domain } = await request.json();

  let cleanDomain: string | null = null;
  if (typeof custom_domain === "string" && custom_domain.trim()) {
    cleanDomain = custom_domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");

    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(cleanDomain)) {
      return NextResponse.json(
        { error: "Invalid domain format (e.g. yourschool.edu.ng or school.com)." },
        { status: 400 },
      );
    }
  }

  const { error } = await supabase
    .from("website_configs")
    .upsert({ school_id: school.id, custom_domain: cleanDomain }, { onConflict: "school_id" });

  if (error) {
    if (error.code === "23505" || error.message?.includes("unique")) {
      return NextResponse.json(
        { error: "This domain is already registered to another school." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, custom_domain: cleanDomain });
}
