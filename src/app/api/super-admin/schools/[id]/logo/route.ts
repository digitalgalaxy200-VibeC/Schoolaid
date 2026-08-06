import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: schoolId } = await params;
  const supabase = getServiceClient();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !file.size) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const ext = file.name.split(".").pop() || "png";
    const fileName = `logos/${schoolId}-${Date.now()}.${ext}`;

    // Delete existing logo if any
    const { data: school } = await supabase.from("schools").select("logo_url").eq("id", schoolId).single();
    if (school?.logo_url) {
      const oldPath = school.logo_url.split("/").slice(-2).join("/");
      if (oldPath && !oldPath.startsWith("http")) {
        await supabase.storage.from("avatars").remove([oldPath]);
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, buffer, {
      contentType: file.type || "image/png",
      upsert: true,
    });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) return NextResponse.json({ error: "Could not get public URL" }, { status: 500 });

    await supabase.from("schools").update({ logo_url: publicUrl }).eq("id", schoolId);

    return NextResponse.json({ url: publicUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
