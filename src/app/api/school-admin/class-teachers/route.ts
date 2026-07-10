import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");

  let query = supabase
    .from("class_teachers")
    .select("*, teachers(profile_id, profiles(full_name, email)), classes(name, grade_level)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });

  if (classId) query = query.eq("class_id", classId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { class_id, teacher_id, role } = await request.json();

  if (!class_id || !teacher_id) {
    return NextResponse.json({ error: "class_id and teacher_id required" }, { status: 400 });
  }

  // If assigning as primary, demote any existing primary for this class
  if (role === "primary") {
    await supabase
      .from("class_teachers")
      .update({ role: "assistant" })
      .eq("school_id", school_id)
      .eq("class_id", class_id)
      .eq("role", "primary");
  }

  const { data, error } = await supabase
    .from("class_teachers")
    .upsert(
      { school_id, class_id, teacher_id, role: role || "assistant", is_active: true },
      { onConflict: "school_id,class_id,teacher_id" },
    )
    .select("*, teachers(profile_id, profiles(full_name, email)), classes(name, grade_level)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { id, role, is_active } = await request.json();

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  if (is_active !== undefined) updates.is_active = is_active;

  // If promoting to primary, demote other primaries
  if (role === "primary") {
    const { data: current } = await supabase
      .from("class_teachers").select("class_id").eq("id", id).single();
    if (current) {
      await supabase
        .from("class_teachers")
        .update({ role: "assistant" })
        .eq("school_id", school_id)
        .eq("class_id", current.class_id)
        .eq("role", "primary")
        .neq("id", id);
    }
  }

  const { data, error } = await supabase
    .from("class_teachers")
    .update(updates)
    .eq("id", id)
    .eq("school_id", school_id)
    .select("*, teachers(profile_id, profiles(full_name, email)), classes(name, grade_level)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("class_teachers")
    .delete()
    .eq("id", id)
    .eq("school_id", school_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
