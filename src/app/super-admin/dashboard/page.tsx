import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import Link from "next/link";
import { getJwtSecret } from "@/lib/jwt-secret";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { KPICard } from "@/components/super-admin/KPICard";
import { SchoolsTable } from "@/components/super-admin/SchoolsTable";
import { Button } from "@/components/ui/Button";
import { School, Users, Inbox, Wrench, Receipt, ArrowRight } from "lucide-react";
import { INQUIRY_LABELS, inquirySourceLabel } from "@/lib/inquiries/config";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
} from "@/lib/super-admin/pipeline";

export const dynamic = "force-dynamic";

/**
 * Super Admin — Home.
 *
 * THE RULE THIS SCREEN FOLLOWS: every number is computed from a stored row, and
 * anything we cannot compute is shown as "not recorded yet" rather than as zero.
 * The previous version showed percentage deltas of 12%, 5% and 142% over bases of
 * four schools, an MRR of $0 beside four "active" schools, and two "Coming soon"
 * cards. A superintendent who spots one invented figure stops believing the rest,
 * so the fix is arithmetic honesty before it is layout.
 *
 * WHAT IS REAL TODAY
 *   - schools, profiles, students, teachers, subscriptions, applications
 *   - created_at on each, so "new this month" is a count, not a guess
 * WHAT IS NOT TRACKED YET (shown as such, never faked)
 *   - onboarding stage per school, teacher login activity, support tickets,
 *     invoicing/payments, AI spend
 */

async function checkAuth() {
  const cookieStore = await cookies();
  const customSession = cookieStore.get("schoolaid-session")?.value;
  let isSuperAdmin = false;
  let adminName = "there";
  let adminId: string | null = null;

  if (customSession) {
    try {
      const { payload } = await jwtVerify(customSession, getJwtSecret());
      if (payload.role === "super_admin") {
        isSuperAdmin = true;
        adminId = typeof payload.sub === "string" ? payload.sub : null;
        if (typeof payload.email === "string") {
          adminName = payload.email.split("@")[0];
        }
      }
    } catch {
      // ignored — the redirect below handles it
    }
  } else {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: userProfile } = await supabase
        .from("users")
        .select("role, full_name")
        .eq("id", data.user.id)
        .single();
      if (userProfile?.role === "super_admin") {
        isSuperAdmin = true;
        adminId = data.user.id;
        adminName = userProfile.full_name || "there";
      }
    }
  }

  if (!isSuperAdmin) redirect("/unauthorized");

  // A person, not a login handle: prefer the stored full name and show only the
  // first word. "gwyn.ukoha" in a greeting reads like a system message.
  if (adminId) {
    const { data: profile } = await getServiceClient()
      .from("profiles")
      .select("full_name")
      .eq("id", adminId)
      .maybeSingle();
    if (profile?.full_name) adminName = profile.full_name;
  }

  const firstName = String(adminName).trim().split(/\s+/)[0] || "there";
  return { firstName };
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Market codes stored on `schools.country` (see migration 083). */
const COUNTRY_LABELS: Record<string, string> = {
  NG: "Nigeria",
  BJ: "Benin",
  CI: "Côte d’Ivoire",
  SN: "Senegal",
  TG: "Togo",
  BF: "Burkina Faso",
  ML: "Mali",
  NE: "Niger",
  GN: "Guinea",
};

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

function relative(iso: string | null | undefined): string {
  const days = daysAgo(iso);
  if (days === null) return "unknown";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export default async function SuperAdminDashboard() {
  const { firstName } = await checkAuth();
  const supabase = getServiceClient();

  const [schoolsRes, profilesRes, studentsRes, teachersRes, subscriptionsRes, inquiriesRes, scoresRes, attendanceRes, activityRes] =
    await Promise.all([
      supabase
        .from("schools")
        .select("id, name, address, subscription_status, is_archived, created_at, pipeline_stage, country")
        .eq("is_archived", false),
      supabase.from("profiles").select("id, school_id, created_at, is_active, last_login_at"),
      supabase.from("students").select("id, school_id"),
      supabase.from("teachers").select("id, school_id, profile_id"),
      supabase.from("subscriptions").select("id, plan, status, school_id"),
      supabase.from("inquiries").select("id, status, source"),
      supabase
        .from("student_scores")
        .select("school_id")
        // eslint-disable-next-line react-hooks/purity -- force-dynamic page
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase
        .from("attendance")
        .select("school_id")
        // eslint-disable-next-line react-hooks/purity -- force-dynamic page
        .gte("date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
      // The existing super-admin trail: impersonation and stage changes write here.
      supabase
        .from("support_logs")
        .select("id, action, created_at, school_id")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const schools = schoolsRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const students = studentsRes.data ?? [];
  const teachers = teachersRes.data ?? [];
  const subscriptions = subscriptionsRes.data ?? [];
  const applicationsPending = (inquiriesRes.data ?? []).filter((i) => i.status === "new").length;

  // This page is `force-dynamic`: reading the clock is the point, not a render
  // impurity to cache away.
  // eslint-disable-next-line react-hooks/purity
  const monthStart = Date.now() - MONTH_MS;

  const countBy = <T extends { school_id?: string | null }>(rows: T[]) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.school_id) continue;
      map.set(row.school_id, (map.get(row.school_id) ?? 0) + 1);
    }
    return map;
  };

  const studentsBySchool = countBy(students);
  const teachersBySchool = countBy(teachers);
  const profilesBySchool = countBy(profiles);

  // "Active this week" means a stored sign-in inside the last seven days.
  // eslint-disable-next-line react-hooks/purity -- force-dynamic page, the clock is the point
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // Who is actually using the platform. `last_login_at` is written at sign-in
  // (migration 083), so "active" is a stored fact rather than an inference.
  const loginByProfile = new Map<string, string | null>();
  for (const profile of profiles) {
    if (profile.id) loginByProfile.set(profile.id as string, profile.last_login_at as string | null);
  }
  const webWeekAgo = weekAgo;
  const activeStaffBySchool = new Map<string, number>();
  for (const teacher of teachers) {
    const schoolId = teacher.school_id as string | null;
    const profileId = teacher.profile_id as string | null;
    if (!schoolId || !profileId) continue;
    const last = loginByProfile.get(profileId);
    if (last && new Date(last).getTime() >= webWeekAgo) {
      activeStaffBySchool.set(schoolId, (activeStaffBySchool.get(schoolId) ?? 0) + 1);
    }
  }

  const scoresBySchool = countBy(scoresRes.data ?? []);
  const attendanceBySchool = countBy(attendanceRes.data ?? []);

  const isLive = (schoolId: string) =>
    (studentsBySchool.get(schoolId) ?? 0) > 0 || (teachersBySchool.get(schoolId) ?? 0) > 0;

  const liveSchools = schools.filter((s) => isLive(s.id)).length;
  const noStaff = schools.filter((s) => (teachersBySchool.get(s.id) ?? 0) === 0).length;
  const noStudents = schools.filter((s) => (studentsBySchool.get(s.id) ?? 0) === 0).length;
  const needsSetup = schools.filter((s) => !isLive(s.id)).length;

  const totalStudents = students.length;
  const newSchoolsThisMonth = schools.filter(
    (s) => s.created_at && new Date(s.created_at).getTime() >= monthStart,
  ).length;
  const newUsersThisMonth = profiles.filter(
    (p) => p.created_at && new Date(p.created_at).getTime() >= monthStart,
  ).length;

  // Onboarding readiness was derived from staff/student counts; the real stage
  // now exists, so it is no longer needed.

  const recentSchools = [...schools]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 5);

  // Real pipeline, now that the stage is stored (migration 082). Schools nobody
  // has triaged are counted separately rather than folded into "applied".
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: schools.filter((s) => s.pipeline_stage === stage).length,
  }));
  const untriaged = schools.filter((s) => !s.pipeline_stage).length;

  const adminActivity = activityRes.data ?? [];

  /**
   * School health, from stored facts only.
   *
   * There is no invented "score": each row carries the REASONS it is flagged, so
   * a head of partnerships can act on "no staff signed in this week" rather than
   * argue with an unexplained 62/100.
   */
  type Risk = "high" | "medium" | "low" | "ok";
  const health = schools
    .map((school) => {
      const staffTotal = teachersBySchool.get(school.id) ?? 0;
      const staffActive = activeStaffBySchool.get(school.id) ?? 0;
      const studentCount = studentsBySchool.get(school.id) ?? 0;
      const scores = scoresBySchool.get(school.id) ?? 0;
      const attendance = attendanceBySchool.get(school.id) ?? 0;

      const reasons: string[] = [];
      let risk: Risk = "ok";

      if (staffTotal === 0) {
        reasons.push("No staff account");
        risk = "high";
      } else if (staffActive === 0) {
        reasons.push("No staff signed in this week");
        risk = "high";
      }

      if (studentCount === 0) {
        reasons.push("No students on file");
        if (risk === "ok") risk = "medium";
      } else if (scores === 0) {
        reasons.push("No scores in the last 30 days");
        if (risk === "ok") risk = "medium";
      }

      if (studentCount > 0 && attendance === 0) {
        reasons.push("No attendance in the last 7 days");
        if (risk === "ok") risk = "low";
      }

      return {
        id: school.id,
        name: school.name || "Unnamed school",
        staffTotal,
        staffActive,
        studentCount,
        scores,
        attendance,
        reasons,
        risk,
      };
    })
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2, ok: 3 } as const;
      return rank[a.risk] - rank[b.risk] || a.name.localeCompare(b.name);
    });

  const RISK_STYLES: Record<Risk, string> = {
    high: "bg-error-bg text-error",
    medium: "bg-warning-bg text-warning",
    low: "bg-bg text-text-secondary",
    ok: "bg-success-bg text-success",
  };

  // Sign-ins recorded by /api/auth/login (migration 083). This is a count of a
  // stored timestamp, not an estimate of "engagement".
  const activeUsers7d = profiles.filter(
    (p) => p.last_login_at && new Date(p.last_login_at).getTime() >= weekAgo,
  ).length;
  const everSignedIn = profiles.filter((p) => Boolean(p.last_login_at)).length;

  const countryCounts = schools.reduce<Record<string, number>>((acc, school) => {
    const code = (school.country as string | null) || "NG";
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});

  const sourceCounts = (inquiriesRes.data ?? []).reduce<Record<string, number>>((acc, row) => {
    const key = (row.source as string | null) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const mappedSchools = schools.map((school) => {
    const sub = subscriptions.find((s) => s.school_id === school.id);
    let plan: "Free" | "Starter" | "Pro" | "Enterprise" = "Free";
    if (sub?.plan) {
      const p = sub.plan.toLowerCase();
      if (p.includes("pro")) plan = "Pro";
      else if (p.includes("starter")) plan = "Starter";
      else if (p.includes("enterprise")) plan = "Enterprise";
    }

    return {
      id: school.id,
      name: school.name || "Unnamed school",
      location: school.address || "No address recorded",
      plan,
      usersCount: profilesBySchool.get(school.id) ?? 0,
      lastActive: "Not tracked",
      status: (school.subscription_status === "active" || school.subscription_status === "trial"
        ? "Active"
        : "Dormant") as "Active" | "Dormant" | "Suspended",
    };
  });

  const attention = [
    {
      key: "applications",
      label: "Applications awaiting review",
      count: applicationsPending,
      detail:
        applicationsPending === 0
          ? "Nothing in the queue."
          : "Reviewed personally; qualified schools move to a discovery call.",
      href: "/super-admin/inquiries",
      cta: "Review",
      Icon: Inbox,
    },
    {
      key: "no-staff",
      label: "Schools with no staff account",
      count: noStaff,
      detail: "Nobody can sign in yet, so nothing can be entered.",
      href: "/super-admin/schools",
      cta: "Open schools",
      Icon: Users,
    },
    {
      key: "no-students",
      label: "Schools with no students on file",
      count: noStudents,
      detail: "Onboarding has started but the roster is empty.",
      href: "/super-admin/schools",
      cta: "Open schools",
      Icon: School,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tablet:text-3xl">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {schools.length} school{schools.length === 1 ? "" : "s"} · {totalStudents} student
            {totalStudents === 1 ? "" : "s"} on file · {activeUsers7d} user
            {activeUsers7d === 1 ? "" : "s"} signed in this week
          </p>
        </div>
        <Button variant="secondary" size="sm" className="self-start sm:self-auto">
          Refresh
        </Button>
      </div>

      {/* ── Needs attention ─────────────────────────────────────────────── */}
      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="text-sm font-bold uppercase tracking-wide text-text-muted">
          Needs attention
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 tablet:grid-cols-3">
          {attention.map(({ key, label, count, detail, href, cta, Icon }) => (
            <Link
              key={key}
              href={href}
              className={`rounded-2xl border p-4 transition-colors ${
                count > 0
                  ? "border-warning bg-warning-bg hover:brightness-95"
                  : "border-border bg-surface hover:bg-bg"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
                <span className={`text-2xl font-bold ${count > 0 ? "text-warning" : "text-text-muted"}`}>
                  {count}
                </span>
              </div>
              <p className="mt-2 text-caption text-text-secondary">{detail}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-caption font-bold text-primary">
                {cta} <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">
          Key figures
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 desktop:grid-cols-5">
          <KPICard
            title="Live schools"
            value={liveSchools}
            icon={<School className="h-6 w-6" />}
            hint="Has staff or students"
            delta={
              newSchoolsThisMonth > 0
                ? `+${newSchoolsThisMonth} added this month`
                : "None added this month"
            }
          />
          <KPICard
            title="Students on file"
            value={totalStudents}
            icon={<Users className="h-6 w-6" />}
            delta={`${newUsersThisMonth} new user account${newUsersThisMonth === 1 ? "" : "s"} this month`}
          />
          <KPICard
            title="Applications pending"
            value={applicationsPending}
            icon={<Inbox className="h-6 w-6" />}
            hint={INQUIRY_LABELS.nav}
            delta={
              applicationsPending > 0 ? "Awaiting a first reply" : "Queue is clear"
            }
          />
          <KPICard
            title="Needs setup"
            value={needsSetup}
            icon={<Wrench className="h-6 w-6" />}
            hint="No staff and no students"
            delta={needsSetup > 0 ? "Cannot go live yet" : "Every school has data"}
          />
          <KPICard
            title="Billing this term"
            value="—"
            icon={<Receipt className="h-6 w-6" />}
            hint="Not recorded yet"
            delta="Invoices are not tracked here"
          />
        </div>
      </section>

      {/* ── Partnership pipeline ────────────────────────────────────────── */}
      <section aria-labelledby="pipeline-heading" className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pipeline-heading" className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Partnership pipeline
          </h2>
          <Link href="/super-admin/schools" className="text-caption font-bold text-primary hover:underline">
            Open schools →
          </Link>
        </div>

        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 desktop:grid-cols-8">
          {stageCounts.map(({ stage, count }) => (
            <li key={stage} className="rounded-xl bg-bg p-3">
              <p className="text-caption leading-tight text-text-secondary">
                {PIPELINE_STAGE_LABELS[stage]}
              </p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  count > 0 ? "text-text-primary" : "text-text-muted"
                }`}
              >
                {count}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-3 text-caption text-text-muted">
          {untriaged > 0
            ? `${untriaged} school${untriaged === 1 ? " is" : "s are"} not triaged yet — open a school and set its stage.`
            : "Every school has a stage."}
        </p>
      </section>

      {/* ── School health ───────────────────────────────────────────────── */}
      <section aria-labelledby="health-heading" className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="health-heading" className="text-sm font-bold uppercase tracking-wide text-text-muted">
            School health
          </h2>
          <p className="text-caption text-text-muted">
            Active = a staff account signed in during the last 7 days
          </p>
        </div>

        {/* Table from tablet up; cards below, so nothing scrolls sideways on a phone. */}
        <div className="mt-3 hidden overflow-x-auto tablet:block">
          <table className="w-full text-left text-small">
            <thead>
              <tr className="text-caption uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-3 font-semibold">School</th>
                <th className="py-2 pr-3 font-semibold">Staff active</th>
                <th className="py-2 pr-3 font-semibold">Students</th>
                <th className="py-2 pr-3 font-semibold">Scores (30d)</th>
                <th className="py-2 pr-3 font-semibold">Attendance (7d)</th>
                <th className="py-2 font-semibold">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {health.map((row) => (
                <tr key={row.id}>
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/super-admin/schools/${row.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-text-secondary">
                    {row.staffActive}/{row.staffTotal}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-text-secondary">{row.studentCount}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-text-secondary">{row.scores}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-text-secondary">{row.attendance}</td>
                  <td className="py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-caption font-semibold ${RISK_STYLES[row.risk]}`}
                    >
                      {row.risk === "ok" ? "Healthy" : row.risk}
                    </span>
                    {row.reasons.length > 0 && (
                      <span className="mt-0.5 block text-caption text-text-muted">
                        {row.reasons.join(" · ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-3 space-y-2 tablet:hidden">
          {health.map((row) => (
            <li key={row.id} className="rounded-xl bg-bg p-3">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/super-admin/schools/${row.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {row.name}
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold ${RISK_STYLES[row.risk]}`}
                >
                  {row.risk === "ok" ? "Healthy" : row.risk}
                </span>
              </div>
              <p className="mt-1 text-caption text-text-secondary">
                {row.staffActive}/{row.staffTotal} staff active · {row.studentCount} students ·{" "}
                {row.scores} scores (30d) · {row.attendance} attendance (7d)
              </p>
              {row.reasons.length > 0 && (
                <p className="mt-1 text-caption text-text-muted">{row.reasons.join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Schools ─────────────────────────────────────────────────────── */}
      <SchoolsTable initialSchools={mappedSchools} />

      {/* ── Recent activity (real rows only) ────────────────────────────── */}
      <section aria-labelledby="recent-heading" className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
        {/* Where the business actually is: stored country codes and form sources. */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Where we are
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-caption font-semibold text-text-secondary">Schools by country</p>
              {Object.keys(countryCounts).length === 0 ? (
                <p className="mt-1 text-caption text-text-muted">No schools yet.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {Object.entries(countryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([code, count]) => (
                      <li key={code} className="flex items-baseline justify-between gap-2 text-body">
                        <span className="text-text-secondary">{COUNTRY_LABELS[code] ?? code}</span>
                        <span className="font-bold text-text-primary">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-caption font-semibold text-text-secondary">
                Applications by source
              </p>
              {Object.keys(sourceCounts).length === 0 ? (
                <p className="mt-1 text-caption text-text-muted">None yet.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {Object.entries(sourceCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([source, count]) => (
                      <li key={source} className="flex items-baseline justify-between gap-2 text-body">
                        <span className="text-text-secondary">{inquirySourceLabel(source)}</span>
                        <span className="font-bold text-text-primary">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
          <p className="mt-4 text-caption text-text-muted">
            {everSignedIn} of {profiles.length} accounts have ever signed in.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 id="recent-heading" className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Recently added schools
          </h2>
          {recentSchools.length === 0 ? (
            <p className="mt-3 text-body text-text-secondary">
              No schools yet. Add the first one to start the pipeline.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {recentSchools.map((school) => (
                <li key={school.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/super-admin/schools/${school.id}`} className="min-w-0 truncate text-body font-medium text-primary hover:underline">
                    {school.name || "Unnamed school"}
                  </Link>
                  <span className="shrink-0 text-caption text-text-muted">
                    {relative(school.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Real admin trail: impersonation and pipeline moves are written to
            support_logs, so this is history, not a placeholder. */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Recent admin activity
          </h2>
          {adminActivity.length === 0 ? (
            <p className="mt-3 text-caption text-text-secondary">
              No admin actions recorded yet. Impersonation sessions and pipeline changes appear
              here.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {adminActivity.map((entry) => (
                <li key={entry.id as string} className="py-2.5">
                  <p className="text-caption leading-snug text-text-primary">{entry.action}</p>
                  <p className="mt-0.5 text-caption text-text-muted">
                    {relative(entry.created_at as string)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Honest placeholder list: features that do not exist in the data model. */}
        <div className="rounded-2xl border border-dashed border-border bg-bg p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Not tracked yet
          </h2>
          <p className="mt-2 text-caption text-text-secondary">
            These need new tracking before they can show real data. Nothing here is estimated.
          </p>
          <ul className="mt-3 space-y-2 text-small text-text-secondary">
            <li>· Teacher-level usage (scores, attendance) as a health score</li>
            <li>· Support inbox and feedback from schools</li>
            <li>· Invoices, payments and Naira revenue per term</li>
            <li>· AI usage and cost</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
