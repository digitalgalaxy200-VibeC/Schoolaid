import { NextResponse } from "next/server";
import { validateUpload } from "@/lib/ai/uploads";
import { verifySchoolAdmin } from "@/lib/school-auth";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_BUCKET,
  MEDIA_LIMITS,
  mediaPath,
  publicMediaUrl,
  quotaExceeded,
} from "@/lib/site/media";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * /api/school-admin/website/media — the school's media library.
 *
 * GET  lists the school's active assets (newest first) with public URLs and how
 *      much of the quota is used.
 * POST accepts one image (multipart: `file`, optional `alt_text`).
 *
 * Every query is scoped by the `school_id` from the verified session, never by
 * anything the client sends. The service client bypasses RLS, so that scoping
 * IS the control — the same pattern as every other school-admin route.
 *
 * Validation is the platform's: `validateUpload` decides the type from the
 * BYTES, not from the filename or the declared content type, so a renamed file
 * cannot choose its own extension in storage.
 */

const STORAGE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("website_media")
    .select("id, path, mime, bytes, alt_text, created_at")
    .eq("school_id", school_id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const media = (data ?? []).map((row) => ({
    ...row,
    url: publicMediaUrl(STORAGE_URL, row.path as string),
  }));
  const usedBytes = media.reduce((sum, row) => sum + Number(row.bytes ?? 0), 0);

  return NextResponse.json({ media, usedBytes, limitBytes: MEDIA_LIMITS.schoolBytes });
}

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file || !file.size) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload({
    kind: "image",
    bytes,
    declaredMimeType: file.type || null,
    filename: file.name,
  });
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const rawAlt = formData.get("alt_text");
  const alt = typeof rawAlt === "string" ? rawAlt.trim() : "";
  if (alt.length > MEDIA_LIMITS.altTextMax) {
    return NextResponse.json(
      { error: `Alt text must be at most ${MEDIA_LIMITS.altTextMax} characters.` },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  const { data: existing, error: sumError } = await supabase
    .from("website_media")
    .select("bytes")
    .eq("school_id", school_id)
    .eq("status", "active");
  if (sumError) return NextResponse.json({ error: sumError.message }, { status: 500 });

  const usedBytes = (existing ?? []).reduce((sum, row) => sum + Number(row.bytes ?? 0), 0);
  if (quotaExceeded(usedBytes, check.upload.size)) {
    return NextResponse.json(
      { error: "This school's media storage is full. Delete an image and try again." },
      { status: 413 },
    );
  }

  const path = mediaPath(check.upload.extension);
  const bucketError = await ensureBucket(supabase);
  if (bucketError) return NextResponse.json({ error: bucketError }, { status: 500 });

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, Buffer.from(check.upload.bytes), {
      contentType: check.upload.mimeType,
      upsert: false,
    });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: row, error: insertError } = await supabase
    .from("website_media")
    .insert({
      school_id,
      path,
      mime: check.upload.mimeType,
      bytes: check.upload.size,
      alt_text: alt || null,
      created_by: userId,
    })
    .select("id, path, mime, bytes, alt_text, created_at")
    .single();

  if (insertError) {
    // The object is in storage but has no row to account for it. Remove it
    // rather than leave an orphan that nothing will ever clean up.
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    { ...row, url: publicMediaUrl(STORAGE_URL, row.path as string) },
    { status: 201 },
  );
}

/**
 * The bucket is created here, once, on the first upload from any school.
 *
 * Size and type limits are set on the bucket as well as checked in this route:
 * the route is the control, and the bucket is the net that catches a future
 * caller who forgets to validate. "Already exists" is the expected outcome
 * after the first upload, not an error.
 */
async function ensureBucket(
  supabase: ReturnType<typeof getServiceClient>,
): Promise<string | null> {
  const { error } = await supabase.storage.createBucket(MEDIA_BUCKET, {
    public: true,
    fileSizeLimit: MEDIA_LIMITS.fileBytes,
    allowedMimeTypes: MEDIA_ALLOWED_MIME_TYPES,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) return error.message;
  return null;
}
