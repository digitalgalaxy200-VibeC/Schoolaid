import { notFound } from "next/navigation";
import { verifyTeacher } from "@/lib/school-auth";
import { readCbtEntitlement } from "@/lib/cbt/entitlement";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * The CBT screen gate.
 *
 * Hiding the menu entry is advice, not enforcement — a bookmark, a typed URL or
 * a link from somewhere else all reach the page regardless. This layout is the
 * enforcement for the screens: when the school has no CBT entitlement the whole
 * `/teacher/cbt` subtree answers `notFound()`, which is the honest answer. The
 * feature is not "switched off" behind a permission wall; for that school it is
 * not there.
 *
 * It is a server component on purpose — the check runs before any screen code,
 * and it cannot be talked out of the decision from the browser. The API routes
 * enforce the same flag independently in `requireCbtActor`, so neither layer
 * depends on the other being correct.
 */

export default async function TeacherCbtLayout({ children }: { children: React.ReactNode }) {
  const { authorized, school_id } = await verifyTeacher();
  if (!authorized || !school_id) notFound();

  const entitlement = await readCbtEntitlement(getServiceClient(), school_id);
  if (!entitlement.enabled) notFound();

  return <>{children}</>;
}
