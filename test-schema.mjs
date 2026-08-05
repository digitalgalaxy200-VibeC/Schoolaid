import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envFile = fs.readFileSync(".env.staging", "utf-8");
envFile.split("\n").forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].trim();
  }
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkScoresTable() {
  const { error } = await supabase.from("student_scores").insert({
    school_id: "test",
    student_id: "test",
    component_id: "test",
    term_id: "test",
    score: "100",
    class_id: "test",
    subject_id: "test"
  });
  console.log("Insert Error:", error);
}

checkScoresTable();
