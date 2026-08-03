import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";
import { provisionSchoolDefaults } from "@/lib/school-provisioning";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get the impersonated school ID from the cookie
  const cookieStore = await cookies();
  const schoolId = cookieStore.get("schoolaid-impersonate-school")?.value;

  if (!schoolId) {
    return NextResponse.json({ error: "You must be impersonating a school to use this route." }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    await provisionSchoolDefaults(supabase, schoolId);
    return NextResponse.json({ success: true, message: `Provisioned defaults for school ${schoolId}` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
