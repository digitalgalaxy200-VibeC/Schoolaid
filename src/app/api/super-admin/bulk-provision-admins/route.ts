import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";
import { generateUniquePassword } from "@/lib/password";

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

      // If school has 0 admins, provision one
      if (count === 0) {
        const adminEmail = `admin@${school.slug}.edu`;
        const adminPassword = await generateUniquePassword(supabase, school.slug, "school_admin");

        // Create auth user
        let authUserId = null;
        const { data: createData } = await supabase.auth.admin.createUser({
          email: adminEmail,
          password: adminPassword,
          email_confirm: true,
        });

        if (createData?.user?.id) {
          authUserId = createData.user.id;
        } else {
          // Check if exists
          const { data: listData } = await supabase.auth.admin.listUsers();
          const existing = listData?.users?.find((u) => u.email === adminEmail);
          if (existing) {
            authUserId = existing.id;
            await supabase.auth.admin.updateUserById(authUserId, { password: adminPassword });
          }
        }

        if (authUserId) {
          // Create profile
          await supabase.from("profiles").upsert(
            {
              id: authUserId,
              email: adminEmail,
              full_name: `${school.name} Admin`,
              role: "school_admin",
              school_id: school.id,
            },
            { onConflict: "id" }
          );

          // Force update role to be safe
          await supabase.from("profiles").update({ role: "school_admin" }).eq("id", authUserId);

          // Create school admin record
          const { error: insertError } = await supabase.from("school_admins").insert({
            school_id: school.id,
            profile_id: authUserId,
            first_name: "School",
            last_name: "Admin",
            generated_password: adminPassword,
            must_change_password: true,
          });

          if (!insertError || insertError.code === "23505") { // unique violation if already exists
            if (insertError?.code === "23505") {
              await supabase.from("school_admins").update({
                generated_password: adminPassword,
                must_change_password: true
              }).eq("profile_id", authUserId);
            }
            provisioned.push({
              schoolName: school.name,
              email: adminEmail,
              password: adminPassword,
            });
          }
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
