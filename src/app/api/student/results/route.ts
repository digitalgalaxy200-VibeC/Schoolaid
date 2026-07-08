import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";

const getSecret = () => new TextEncoder().encode(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(session, getSecret());
    if (payload.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    // Find student record
    const { data: student } = await supabase.from("students").select("id").eq("profile_id", payload.sub).single();
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    // Get published results
    const { data: results } = await supabase.from("term_results")
      .select("*, subjects(name), term:academic_terms(name)")
      .eq("student_id", student.id).eq("published", true).order("term_id");

    // Get active term
    const { data: activeTerm } = await supabase.from("academic_terms")
      .select("*").eq("school_id", payload.school_id).eq("is_active", true).single();

    return NextResponse.json({ results: results || [], activeTerm });
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
}
