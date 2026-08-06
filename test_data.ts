import { getServiceClient } from "./src/lib/supabase/service";

async function main() {
  const supabase = getServiceClient();
  const { data: school } = await supabase.from("schools").select("*").eq("name", "Test").single();
  if (!school) return console.log("School not found");
  console.log("School ID:", school.id);

  const { data: cls } = await supabase.from("classes").select("*").eq("school_id", school.id).eq("name", "Basic 1").single();
  if (!cls) return console.log("Class not found");
  console.log("Class ID:", cls.id);

  const { data: students } = await supabase.from("students").select("id, profiles(full_name)").eq("class_id", cls.id);
  console.log("Students in Basic 1:", JSON.stringify(students, null, 2));
}
main().catch(console.error);
