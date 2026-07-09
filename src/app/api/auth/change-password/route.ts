import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";

const getSecret = () =>
  new TextEncoder().encode(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export async function POST() {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(session, getSecret());
    if (!payload.role || !payload.school_id || !payload.sub)
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const supabase = getServiceClient();
    const { data: school } = await supabase
      .from("schools")
      .select("name")
      .eq("id", payload.school_id)
      .single();
    if (!school)
      return NextResponse.json({ error: "School not found" }, { status: 404 });

    const password = await generateUniquePassword(
      school.name,
      payload.role as string,
    );

    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${payload.sub}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({ password }),
      },
    );

    await supabase
      .from("password_history")
      .update({ used_by: payload.sub as string })
      .eq("password", password);

    return NextResponse.json({ password });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
