import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Phase 2 — academic sections + their classes (migrated schema: academic_sections, classes.section_id)

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  type SectionRow = {
    id: string;
    name: string;
    session_id: string | null;
    term_id: string | null;
    is_active: boolean;
    vacation_date: string | null;
    resumption_date: string | null;
  };
  type ClassRow = { id: string; name: string; section_id: string | null; category: string | null; is_active: boolean | null };
  type ClassSummary = { id: string; name: string; category: string | null };

  const [{ data: sections, error: secErr }, { data: classes, error: clsErr }] = await Promise.all([
    supabase
      .from("academic_sections")
      .select("id, name, session_id, term_id, is_active, vacation_date, resumption_date")
      .eq("school_id", school_id)
      .order("name"),
    supabase
      .from("classes")
      .select("id, name, section_id, category, is_active")
      .eq("school_id", school_id)
      .order("name"),
  ]);

  if (secErr) return NextResponse.json({ error: secErr.message }, { status: 500 });
  if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });

  // Group classes under their section; classes without a section appear under "unassigned"
  const result = ((sections || []) as SectionRow[]).map((s) => ({
    ...s,
    classes: ((classes || []) as ClassRow[])
      .filter((c) => c.section_id === s.id && c.is_active !== false)
      .map((c): ClassSummary => ({ id: c.id, name: c.name, category: c.category })),
  }));

  const unassigned = ((classes || []) as ClassRow[]).filter(
    (c) => !c.section_id && c.is_active !== false,
  );
  if (unassigned.length > 0) {
    result.push({
      id: null as unknown as string,
      name: "Unassigned",
      session_id: null,
      term_id: null,
      is_active: true,
      vacation_date: null,
      resumption_date: null,
      classes: unassigned.map((c): ClassSummary => ({ id: c.id, name: c.name, category: c.category })),
    });
  }

  return NextResponse.json(result);
}
