import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { loadPromotionState, saveMappings } from "@/lib/promotion/service";
import { validateMappings } from "@/lib/promotion/plan";
import type { MappingInput, PromotionAction } from "@/lib/promotion/types";

/**
 * Promotion configuration.
 *
 * GET  — the school's classes (with active student counts) + saved mappings.
 * POST — replace the saved mappings with the administrator's submitted set.
 *
 * The destination is ALWAYS an explicit administrator choice; nothing here
 * infers it from class names or ordering. Class ownership is enforced here and
 * again by the database CHECK/UNIQUE constraints.
 */

function parseMappings(raw: unknown): { mappings: MappingInput[]; error: string | null } {
  if (!Array.isArray(raw)) return { mappings: [], error: "mappings must be an array" };

  const mappings: MappingInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return { mappings: [], error: "Every mapping must be an object." };
    }
    const candidate = entry as Record<string, unknown>;
    const source = candidate.source_class_id;
    const action = candidate.action;
    const destination = candidate.destination_class_id;

    if (typeof source !== "string" || !source) {
      return { mappings: [], error: "Every mapping needs a source_class_id." };
    }
    if (action !== "promote" && action !== "graduate") {
      return { mappings: [], error: "action must be 'promote' or 'graduate'." };
    }
    if (
      destination !== undefined &&
      destination !== null &&
      typeof destination !== "string"
    ) {
      return { mappings: [], error: "destination_class_id must be a string or null." };
    }

    mappings.push({
      source_class_id: source,
      action: action as PromotionAction,
      destination_class_id: (destination as string | null | undefined) ?? null,
    });
  }

  return { mappings, error: null };
}

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServiceClient();
    const state = await loadPromotionState(supabase, school_id);
    return NextResponse.json({ classes: state.classes, mappings: state.mappings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load promotion settings." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { mappings, error: shapeError } = parseMappings(
      (body as { mappings?: unknown }).mappings,
    );
    if (shapeError) {
      return NextResponse.json({ error: shapeError }, { status: 400 });
    }

    const supabase = getServiceClient();
    const state = await loadPromotionState(supabase, school_id);

    // An empty set is allowed: it clears the configuration. A non-empty set is
    // validated (ownership, self-map, duplicate source, graduate shape) before
    // anything is written.
    if (mappings.length > 0) {
      const errors = validateMappings(mappings, state.classes);
      if (errors.length > 0) {
        return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
      }
    }

    await saveMappings(supabase, school_id, mappings);

    return NextResponse.json({ success: true, count: mappings.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save promotion settings." },
      { status: 500 },
    );
  }
}
