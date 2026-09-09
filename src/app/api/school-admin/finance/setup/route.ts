import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { SETUP_STEPS, TOTAL_SETUP_STEPS, canMarkManual } from "@/lib/finance/setup";

// Finance — guided Setup Guide status.
//   GET  /finance/setup
//   POST /finance/setup  { step?: string; done?: boolean } | { dismissed?: boolean }
//
// Auto-detected steps are computed LIVE from the school's real finance
// records (never stored) — add a fee head and the step flips to done by
// itself. Only manual/hybrid steps are persisted in finance_setup_progress.

type Supabase = ReturnType<typeof getServiceClient>;

const countRows = async (supabase: Supabase, table: string, filters: Record<string, unknown>) => {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filters)) {
    q = q.eq(col, val as string);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
};

const countGt = async (supabase: Supabase, table: string, schoolId: string, column: string, value: number) => {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .gt(column, value);
  if (error) throw error;
  return count || 0;
};

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const row = await buildSetupStatus(supabase, school_id);
  return NextResponse.json(row);
}

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const supabase = getServiceClient();

  // Progress row (created lazily)
  const ensureRow = async () => {
    const { data: existing } = await supabase
      .from("finance_setup_progress")
      .select("completed_steps, dismissed")
      .eq("school_id", school_id)
      .maybeSingle();
    if (existing) {
      return {
        completed: new Set((existing as { completed_steps: string[] }).completed_steps || []),
        dismissed: (existing as { dismissed: boolean }).dismissed,
      };
    }
    await supabase.from("finance_setup_progress").insert({ school_id });
    return { completed: new Set<string>(), dismissed: false };
  };

  const state = await ensureRow();

  if (typeof body.dismissed === "boolean") {
    await supabase
      .from("finance_setup_progress")
      .update({ dismissed: body.dismissed, updated_at: new Date().toISOString() })
      .eq("school_id", school_id);
    const updated = await buildSetupStatus(supabase, school_id);
    return NextResponse.json(updated);
  }

  const step = String(body.step || "");
  const def = SETUP_STEPS.find((s) => s.key === step);
  if (!def) return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 });
  if (!canMarkManual(def)) {
    return NextResponse.json({ error: `Step "${def.title}" is detected automatically and cannot be marked manually` }, { status: 400 });
  }

  const done = body.done !== false;
  const next = new Set(state.completed);
  if (done) next.add(step);
  else next.delete(step);

  await supabase
    .from("finance_setup_progress")
    .update({ completed_steps: Array.from(next), updated_at: new Date().toISOString() })
    .eq("school_id", school_id);

  // Track who finished the last step (best-effort audit value only)
  const updated = await buildSetupStatus(supabase, school_id);
  if (updated.done_count >= TOTAL_SETUP_STEPS && userId) {
    await supabase
      .from("finance_setup_progress")
      .update({ dismissed: true, updated_at: new Date().toISOString() })
      .eq("school_id", school_id);
  }

  const fresh = await buildSetupStatus(supabase, school_id);
  return NextResponse.json(fresh);
}

async function buildSetupStatus(supabase: Supabase, school_id: string) {
  // ── Auto-detection reads (live, never stored) ──
  const [heads, termFeeAmt, classFeeAmt, optionalTerm, optionalHeads, activeAccounts, bills, payments, waivers, optionalLines, schoolRow] =
    await Promise.all([
      countRows(supabase, "fee_heads", { school_id }),
      countGt(supabase, "term_fees", school_id, "default_amount", 0),
      countGt(supabase, "class_fees", school_id, "amount", 0),
      (async () => {
        const { count } = await supabase
          .from("term_fees")
          .select("*", { count: "exact", head: true })
          .eq("school_id", school_id)
          .eq("fee_type", "Not Required")
          .gt("default_amount", 0);
        return count || 0;
      })(),
      countRows(supabase, "fee_heads", { school_id, is_compulsory: false }),
      countRows(supabase, "school_bank_accounts", { school_id, is_active: true }),
      countRows(supabase, "student_bills", { school_id }),
      countRows(supabase, "payments", { school_id }),
      countRows(supabase, "student_waivers", { school_id }),
      countRows(supabase, "student_bill_lines", { school_id, is_compulsory: false }),
      supabase.from("schools").select("currency").eq("id", school_id).maybeSingle(),
    ]);

  const manualRow = await supabase
    .from("finance_setup_progress")
    .select("completed_steps, dismissed")
    .eq("school_id", school_id)
    .maybeSingle();
  const manual = new Set((manualRow.data as { completed_steps?: string[] } | null)?.completed_steps || []);
  const dismissed = (manualRow.data as { dismissed?: boolean } | null)?.dismissed === true;

  const auto: Record<string, boolean> = {
    fee_heads: heads > 0,
    amounts: termFeeAmt > 0 || classFeeAmt > 0,
    optional_fees: optionalTerm > 0 || optionalHeads > 0,
    currency: ((schoolRow as { currency?: string | null } | null)?.currency || "NGN") !== "NGN",
    accounts: activeAccounts > 0,
    bills: bills > 0,
    review_bill: bills > 0 && (optionalLines > 0 || waivers > 0),
    test_payment: payments > 0,
  };

  const steps = SETUP_STEPS.map((def) => {
    const detected = auto[def.key] ?? false;
    const done = def.kind === "auto" ? detected : def.kind === "hybrid" ? detected || manual.has(def.key) : manual.has(def.key);
    return {
      key: def.key,
      title: def.title,
      status: done ? "done" : "todo",
      auto_detected: def.kind === "auto" ? done : detected,
      manual_eligible: canMarkManual(def),
    };
  });

  const doneCount = steps.filter((s) => s.status === "done").length;
  return {
    total: TOTAL_SETUP_STEPS,
    done_count: doneCount,
    dismissed,
    steps,
  };
}
