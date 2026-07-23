import { NextResponse } from "next/server";
import { verifyStudent } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, userId } = await verifyStudent();
  if (!authorized || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  const [{ data: profile }, { data: student }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", userId).single(),
    supabase.from("students").select("photo_url, date_of_birth, gender, class_id").eq("profile_id", userId).single(),
  ]);

  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  let className = "";
  if (student.class_id) {
    const { data: cls } = await supabase.from("classes").select("name").eq("id", student.class_id).maybeSingle();
    className = cls?.name || "";
  }

  return NextResponse.json({
    username: profile?.email || "",
    full_name: profile?.full_name || "",
    class_name: className,
    photo_url: student.photo_url,
    date_of_birth: student.date_of_birth,
    gender: student.gender,
  });
}

export async function PUT(request: Request) {
  const { authorized, userId } = await verifyStudent();
  if (!authorized || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { photo_url, date_of_birth, gender } = await request.json();
  const updates: Record<string, unknown> = {};
  if (photo_url !== undefined) updates.photo_url = photo_url || null;
  if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth || null;
  if (gender !== undefined) updates.gender = gender || null;

  if (Object.keys(updates).length === 0) return NextResponse.json({ success: true });

  const supabase = getServiceClient();
  const { error } = await supabase.from("students").update(updates).eq("profile_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
