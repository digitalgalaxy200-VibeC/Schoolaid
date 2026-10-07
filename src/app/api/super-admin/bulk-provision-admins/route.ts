import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";
import { provisionAdminForSchool } from "@/lib/school-provisioning";

export async function POST(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  try {
    // 1. Get all schools
    const { data: schools, error: schoolsError } = await supabase
      .from("schools")
      .select("id, name, slug");

    if (schoolsError) throw new Error("Failed to fetch schools");

    const provisioned: { schoolName: string; email: string; password: string }[] = [];

    // 2. Loop through and check admins
    for (const school of schools || []) {
      const { count, error: countError } = await supabase
        .from("school_admins")
        .select("*", { count: "exact", head: true })
        .eq("school_id", school.id);

      if (countError) {
        console.error(`Error checking admins for school ${school.name}:`, countError);
        continue;
      }

      // If school has 0 admins, provision one — through the SAME shared path
      // the Add School screen and the Copilot use, so all three agree on what
      // "an admin account" means.
      if (count === 0) {
        try {
          const admin = await provisionAdminForSchool(supabase, school);
          provisioned.push({
            schoolName: school.name,
            email: admin.email,
            password: admin.password,
          });
        } catch (err) {
          console.error(`Could not provision an admin for ${school.name}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      provisionedCount: provisioned.length,
      provisioned,
    });
  } catch (error: any) {
    console.error("Bulk provision error:", error);
    return NextResponse.json({ error: error.message || "Failed to provision admins" }, { status: 500 });
  }
}
