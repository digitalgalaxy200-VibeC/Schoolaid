import { NextResponse } from "next/server";
import { isCbtStaff, openCbtClient, requireCbtActor, type CbtActor } from "./authz";

/**
 * Shared plumbing for CBT routes.
 *
 * Every CBT route does the same four things in the same order: reject cross-origin
 * requests, resolve the session to an actor, refuse the wrong role, then decide
 * whether that actor may touch the specific assessment or attempt. Putting the
 * first three here means a new route cannot accidentally skip one — the failure
 * mode being a route that authenticates but never authorizes.
 *
 * The fourth (per-assessment authority) stays in `authz.ts`, because it needs the
 * database and not every route is assessment-scoped.
 */

export type Gate =
  | { ok: true; actor: CbtActor }
  | { ok: false; response: NextResponse };

export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * Reads a JSON body, tolerating a missing or malformed one.
 *
 * `request.json()` throws on an empty body, which in a route handler means an
 * unhandled 500 for what is really a 400. Callers validate the shape afterwards
 * with `src/lib/validate.ts`; this only guarantees they get an object.
 */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Session + staff role. Use for authoring, marking and configuration. */
export async function staffGate(request: Request): Promise<Gate> {
  const gate = await requireCbtActor(request);
  if (!gate.ok) return gate;
  if (!isCbtStaff(gate.actor)) {
    return { ok: false, response: jsonError(403, "This action is for teachers and administrators") };
  }
  return gate;
}

/** Session only. Use where a student has a legitimate reason to call. */
export async function actorGate(request: Request): Promise<Gate> {
  return requireCbtActor(request);
}

/**
 * Opens the tenant-scoped client, or the response to send instead.
 *
 * `createTenantScopedClient` throws when its signing secret is absent, by
 * design — it will not quietly fall back to the service-role client. Without
 * this wrapper that throw becomes an unhandled 500 with a stack trace; with it,
 * the caller gets a plain 503 and the reason is logged once.
 */
export async function openClientOr503(
  actor: CbtActor,
): Promise<{ ok: true; client: Awaited<ReturnType<typeof openCbtClient>> } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, client: await openCbtClient(actor) };
  } catch (err) {
    console.error("[cbt/api] tenant-scoped client unavailable:", err);
    return {
      ok: false,
      response: jsonError(503, "CBT database access is not configured"),
    };
  }
}

/**
 * Turns a failed `authorizeCbtAssessment` into a response.
 *
 * The reason is passed through deliberately: it is written for the person
 * holding the screen ("you are not assigned to this class and subject"), and
 * none of the reasons disclose anything about another tenant — a foreign
 * assessment id and a non-existent one both produce the same 404.
 */
export function assessmentFailure(result: { status: number; reason: string }): NextResponse {
  return jsonError(result.status, result.reason);
}
