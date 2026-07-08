import { NextResponse } from "next/server";
import { verifyStudent } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifyStudent();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data: school } = await supabase
    .from("schools")
    .select("name, logo_url, address, phone, email, motto")
    .eq("id", school_id)
    .single();

  return NextResponse.json(school || {});
}
