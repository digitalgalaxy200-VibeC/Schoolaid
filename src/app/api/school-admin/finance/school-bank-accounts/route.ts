import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Phase A — school payment accounts (the accounts parents pay into).
//   GET    /finance/school-bank-accounts?include_inactive=1
//   POST   { bank_name, account_name, account_number, display_order? }
//   PATCH  { id, bank_name?, account_name?, account_number?, is_active?, display_order? }
//   DELETE ?id=   (historical payments keep their paid_into snapshot)

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "1";
  const supabase = getServiceClient();

  let q = supabase.from("school_bank_accounts").select("*").eq("school_id", school_id).order("display_order").order("bank_name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const bank_name = String(body.bank_name || "").trim();
  const account_name = String(body.account_name || "").trim();
  const account_number = String(body.account_number || "").trim();
  if (!bank_name || !account_name || !account_number) {
    return NextResponse.json({ error: "bank_name, account_name and account_number are required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: existing } = await supabase
    .from("school_bank_accounts")
    .select("id")
    .eq("school_id", school_id)
    .eq("bank_name", bank_name)
    .eq("account_number", account_number)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "An account with this bank and number already exists" }, { status: 409 });

  const { data, error } = await supabase
    .from("school_bank_accounts")
    .insert({
      school_id,
      bank_name,
      account_name,
      account_number,
      is_active: body.is_active !== false,
      display_order: Number.isFinite(body.display_order) ? body.display_order : 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.bank_name === "string" && body.bank_name.trim()) updates.bank_name = body.bank_name.trim();
  if (typeof body.account_name === "string" && body.account_name.trim()) updates.account_name = body.account_name.trim();
  if (typeof body.account_number === "string" && body.account_number.trim()) updates.account_number = body.account_number.trim();
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (Number.isFinite(body.display_order)) updates.display_order = body.display_order;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("school_bank_accounts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("school_bank_accounts")
    .delete()
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
