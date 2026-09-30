import { notFound } from "next/navigation";
import { verifyStudent } from "@/lib/school-auth";
import { readCbtEntitlement } from "@/lib/cbt/entitlement";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * The student CBT screen gate.
 *
 * The student equivalent of `/teacher/cbt/layout.tsx`: when the school has no
 * CBT entitlement, `/student/cbt` and `/student/cbt/attempt/...` answer
 * `notFound()` rather than rendering a test screen that cannot load anything.
 *
 * An exam attempt is the one place a student can least afford a confusing
 * half-state, so this closes the subtree before any of it runs.
 */

export default async function StudentCbtLayout({ children }: { children: React.ReactNode }) {
  const { authorized, school_id } = await verifyStudent();
  if (!authorized || !school_id) notFound();

  const entitlement = await readCbtEntitlement(getServiceClient(), school_id);
  if (!entitlement.enabled) notFound();

  return <>{children}</>;
}
