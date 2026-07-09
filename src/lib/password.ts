import { getServiceClient } from "./supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

function generateRandomDigits(length = 5): string {
  let r = "";
  for (let i = 0; i < length; i++) r += Math.floor(Math.random() * 10);
  return r;
}

const ROLE_LETTERS: Record<string, string> = {
  school_admin: "A",
  teacher: "T",
  student: "S",
};

export async function generateUniquePassword(
  schoolOrClient: string | SupabaseClient,
  role: string,
  maybeSchool?: string,
): Promise<string> {
  let schoolName: string;
  let supabase: SupabaseClient;

  if (typeof schoolOrClient === "string") {
    schoolName = schoolOrClient;
    supabase = getServiceClient();
  } else {
    supabase = schoolOrClient;
    schoolName = maybeSchool || schoolOrClient?.toString() || "SCH";
  }

  const prefix =
    schoolName
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "SCH";
  const roleLetter = ROLE_LETTERS[role] || "X";

  let password = "";
  let unique = false;
  let attempts = 0;

  while (!unique && attempts < 30) {
    password = `${prefix}${roleLetter}${generateRandomDigits(5)}`;
    const { data } = await supabase
      .from("password_history")
      .select("id")
      .eq("password", password)
      .maybeSingle();
    if (!data) unique = true;
    attempts++;
  }

  await supabase
    .from("password_history")
    .insert({ password, school_prefix: prefix, role });
  return password;
}
