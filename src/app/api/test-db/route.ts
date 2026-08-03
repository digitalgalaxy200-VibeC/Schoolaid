import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("grading_rows")
    .select("*")
    .limit(5);

  return NextResponse.json({ data, error });
}
