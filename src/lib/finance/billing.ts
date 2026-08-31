import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Finance — billing calculation engine (Phase 3)
// The SINGLE source of truth for how a student's bill is resolved.
// Used by: billing generation, bill detail, waivers, dashboard (Phase 5).
// Resolution order (per fee head):
//   1. class_fees override (class-level exception)
//   2. term_fees default (section-level or school-wide)
//   3. no fee
// Compulsory fees (fee_type = 'Required') are always included.
// Optional fees ('Not Required') are included ONLY when the student is
// opted in via student_fee_adjustments (is_opted_in = true).
// ============================================================================

export type BillLineInput = {
  fee_head_id: string;
  fee_name: string;
  amount: number;
  is_compulsory: boolean;
  term_fee_id: string;
  class_fee_id: string | null;
  source: "override" | "default";
  description: string | null;
};

export type ResolvedBill = {
  lines: BillLineInput[];
  gross_amount: number;
  termId: string;
};

type ClassRow = { id: string; section_id: string | null };
type TermFeeRow = {
  id: string;
  fee_head_id: string;
  default_amount: number;
  fee_type: string | null;
  academic_section_id: string | null;
  term_id: string | null;
  is_active: boolean | null;
};
type ClassFeeRow = { id: string; term_fee_id: string; class_id: string; amount: number; is_compulsory: boolean | null };
type AdjustmentRow = { class_fee_id: string; is_opted_in: boolean | null };
type FeeHeadRow = { id: string; name: string | null };

export type FeeConfig = {
  termFees: TermFeeRow[];
  classFees: ClassFeeRow[];
  adjustments: AdjustmentRow[];
  classes: ClassRow[];
  feeHeads: Map<string, FeeHeadRow>;
};

// ── Load the school's entire fee configuration in 5 queries (batch-friendly) ──
export async function loadFeeConfig(
  supabase: SupabaseClient,
  school_id: string,
): Promise<FeeConfig> {
  const [tfRes, cfRes, adjRes, clsRes, fhRes] = await Promise.all([
    supabase.from("term_fees").select("id, fee_head_id, default_amount, fee_type, academic_section_id, term_id, is_active").eq("school_id", school_id),
    supabase.from("class_fees").select("id, term_fee_id, class_id, amount, is_compulsory").eq("school_id", school_id),
    supabase.from("student_fee_adjustments").select("class_fee_id, is_opted_in").eq("school_id", school_id),
    supabase.from("classes").select("id, section_id").eq("school_id", school_id),
    supabase.from("fee_heads").select("id, name").eq("school_id", school_id),
  ]);

  const termFees = (tfRes.data || []) as TermFeeRow[];
  const classFees = (cfRes.data || []) as ClassFeeRow[];
  const adjustments = (adjRes.data || []) as AdjustmentRow[];
  const classes = (clsRes.data || []) as ClassRow[];
  const feeHeads = new Map<string, FeeHeadRow>();
  for (const fh of (fhRes.data || []) as FeeHeadRow[]) feeHeads.set(fh.id, fh);

  return { termFees, classFees, adjustments, classes, feeHeads };
}

// ── Resolve a student's bill lines for a term (pure, no I/O) ──
export function resolveBillLines(
  config: FeeConfig,
  student: { id: string; class_id: string | null },
  termId: string,
): ResolvedBill {
  const classRow = config.classes.find((c) => c.id === student.class_id) || null;
  const studentSectionId = classRow?.section_id ?? null;

  // Active term fees for this term (term-scoped OR legacy school-wide)
  const applicableTermFees = config.termFees.filter(
    (tf) =>
      tf.is_active !== false &&
      (tf.term_id === termId || tf.term_id === null) &&
      (tf.academic_section_id === null || tf.academic_section_id === studentSectionId),
  );

  const lines: BillLineInput[] = [];

  for (const tf of applicableTermFees) {
    // Class override (highest precedence)
    const override = config.classFees.find(
      (cf) => cf.term_fee_id === tf.id && cf.class_id === student.class_id,
    );

    const isCompulsory = tf.fee_type !== "Not Required";
    const amount = override ? Number(override.amount) : Number(tf.default_amount);

    if (isCompulsory) {
      const fh = config.feeHeads.get(tf.fee_head_id);
      lines.push({
        fee_head_id: tf.fee_head_id,
        fee_name: fh?.name || "Fee",
        amount,
        is_compulsory: true,
        term_fee_id: tf.id,
        class_fee_id: override?.id || null,
        source: override ? "override" : "default",
        description: null,
      });
    } else {
      // Optional fee: included ONLY when explicitly opted in
      if (override) {
        const optedIn = config.adjustments.find(
          (a) => a.class_fee_id === override.id && a.is_opted_in === true,
        );
        if (optedIn) {
          const fh = config.feeHeads.get(tf.fee_head_id);
          lines.push({
            fee_head_id: tf.fee_head_id,
            fee_name: fh?.name || "Fee",
            amount,
            is_compulsory: false,
            term_fee_id: tf.id,
            class_fee_id: override.id,
            source: override ? "override" : "default",
            description: null,
          });
        }
      }
    }
  }

  const gross = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, gross_amount: gross, termId };
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
