import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { INQUIRY_STATUSES } from "@/lib/inquiries/config";
import { ValidationErrors, oneOf, text, uuid } from "@/lib/validate";

/** Super admin: move an inquiry through the follow-up workflow and keep notes. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await params;
  const errors = new ValidationErrors();
  uuid({ id }, "id", errors, { required: true });
  const status = oneOf(body, "status", INQUIRY_STATUSES, errors);
  const notesProvided = !!body && typeof body === "object" && "admin_notes" in (body as object);
  const admin_notes = text(body, "admin_notes", errors, { max: 2000 });

  if (!errors.ok) return NextResponse.json({ error: errors.summary() }, { status: 400 });
  if (!status && !notesProvided) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (notesProvided) patch.admin_notes = admin_notes; // null clears the note

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("inquiries")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[inquiries] update failed:", error);
    return NextResponse.json({ error: "Could not update inquiry" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
