import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/school-admin/upload-avatar
 * Accepts a multipart form with field "file" (image).
 * Uploads to Supabase Storage bucket "avatars" and returns the public URL.
 * The caller is responsible for saving the URL into profiles.avatar_url.
 */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: Request) {
  try {
    const { authorized, school_id } = await verifySchoolAdmin();
    if (!authorized)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || !file.size)
      return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // Neither of these checks existed before — a file of any type or size
    // was accepted as-is. See docs/CORRECTIONS_SECURITE.md.
    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 },
      );
    }
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 },
      );
    }

    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${school_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const supabase = getServiceClient();

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      // Bucket might not exist yet — try creating it first
      if (uploadError.message?.includes("Bucket not found") || uploadError.message?.includes("bucket")) {
        await supabase.storage.createBucket("avatars", { public: true });
        const { error: retryError } = await supabase.storage
          .from("avatars")
          .upload(fileName, buffer, {
            contentType: file.type || "image/jpeg",
            upsert: false,
          });
        if (retryError)
          return NextResponse.json({ error: retryError.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
    const publicUrl = urlData?.publicUrl;

    if (!publicUrl)
      return NextResponse.json({ error: "Could not get public URL" }, { status: 500 });

    return NextResponse.json({ url: publicUrl });
  } catch (err: any) {
    console.error("[upload-avatar] error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
