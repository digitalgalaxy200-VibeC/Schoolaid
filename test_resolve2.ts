import { getServiceClient } from "./src/lib/supabase/service";
import { resolveTemplateRows } from "./src/lib/report-card";

async function main() {
  const supabase = getServiceClient();
  const { data: schools } = await supabase.from("schools").select("id, name");
  
  for (const sch of schools) {
    console.log(`School: ${sch.name}`);
    const { data: classes } = await supabase.from("classes").select("id, name").eq("school_id", sch.id);
    for (const cls of classes) {
      const comps = await resolveTemplateRows(sch.id, cls.id, "class_components_templates", "components_templates", "components_rows");
      if (!comps || comps.length === 0) console.log(`  Class ${cls.name}: EMPTY`);
      else console.log(`  Class ${cls.name}: HAS COMPONENTS`);
    }
  }
}
main().catch(console.error);
