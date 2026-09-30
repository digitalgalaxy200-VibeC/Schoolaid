import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { MEDIA_LIMITS, tombstonePatch } from "@/lib/site/media";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * /api/school-admin/website/media/[id]
 *
 * PATCH  — change an asset's alt text.
 * DELETE — soft-delete it: the row becomes a tombstone and the object stays
 *          fetchable until the grace period passes, so a page still using the
 *          image does not break the instant somebody tidies the library.
 *          `scripts/site-media-gc.cjs` removes both afterwards.
 *
 * Both handlers scope by the session's `school_id`, so another school's id
 * simply matches nothing — the same 404 either way, which also means the API
 * never confirms whether an id exists elsewhere on the platform.
 */

type Params = { params: Promise<{ id: string }> };

/** Paths and ids in a URL are strings; validate the shape before Postgres sees it. */
function readId(id: string): string | null {
  const errors = new ValidationErrors();
  return uuid({ id }, "id", errors, { required: true });
}

export async function PATCH(request: Request, { params }: Params) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mediaId = readId((await params).id);
  if (!mediaId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const raw = typeof body?.alt_text === "string" ? body.alt_text.trim() : "";
  if (raw.length > MEDIA_LIMITS.altTextMax) {
    return NextResponse.json(
      { error: `Alt text must be at most ${MEDIA_LIMITS.altTextMax} characters.` },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("website_media")
    .update({ alt_text: raw || null })
    .eq("id", mediaId)
    .eq("school_id", school_id)
    .eq("status", "active")
    .select("id, alt_text")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mediaId = readId((await params).id);
  if (!mediaId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("website_media")
    .update(tombstonePatch())
    .eq("id", mediaId)
    .eq("school_id", school_id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, id: data.id });
}
