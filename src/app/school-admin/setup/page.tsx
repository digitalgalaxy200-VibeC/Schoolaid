import { Suspense } from "react";
import { Card } from "@/components/ui";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { SetupWizard } from "./SetupWizard";

/**
 * School Setup — the platform operator's view of one school's configuration.
 *
 * This page is served INSIDE a school session, which is why it can only exist
 * while a Super Admin is impersonating: the school id it reads comes from that
 * session, so there is no way for it to describe a different school.
 *
 * A school's own administrator is refused here as well as in the API, because
 * hiding a link is not access control.
 */
export const dynamic = "force-dynamic";

export default async function SchoolSetupPage() {
  const { authorized, school_id, impersonated } = await verifySchoolAdmin();

  if (!authorized || !school_id) {
    return (
      <Card variant="default" className="shadow-sm">
        <p className="text-body font-semibold text-text-primary">Not available</p>
        <p className="text-small text-text-secondary mt-1">
          Your session has expired. Sign in again to continue.
        </p>
      </Card>
    );
  }

  if (!impersonated) {
    return (
      <Card variant="default" className="shadow-sm">
        <p className="text-body font-semibold text-text-primary">
          School Setup is for platform administrators
        </p>
        <p className="text-small text-text-secondary mt-1">
          Open this school from the Super Admin console and access it as the school to
          see its setup checklist.
        </p>
      </Card>
    );
  }

  return (
    <Suspense
      fallback={
        <Card variant="default" className="shadow-sm">
          <p className="text-small text-text-secondary">Loading the setup checklist…</p>
        </Card>
      }
    >
      <SetupWizard />
    </Suspense>
  );
}
