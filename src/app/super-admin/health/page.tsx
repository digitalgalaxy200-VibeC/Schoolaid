import { Badge, Card } from "@/components/ui";

/**
 * System health — configuration, not guesswork.
 *
 * The only thing this page may report is PRESENCE, never a value: an operator
 * needs to know *which* variable is missing, and no page may ever echo a
 * service-role key or a signing secret back to a browser.
 *
 * It exists because a missing `SUPABASE_JWT_SECRET` surfaced to a teacher as
 * "CBT database access is not configured" — a true statement that named neither
 * the variable nor the environment. Both are recorded here.
 */
type Check = {
  name: string;
  required: boolean;
  /** What breaks when it is absent, in the words the product actually uses. */
  consequence: string;
};

const CHECKS: Check[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    consequence: "No database connection at all — every query fails.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    consequence: "Tenant-scoped (RLS) queries are refused by PostgREST.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    consequence: "Server routes cannot read or write; API routes return 500.",
  },
  {
    name: "JWT_SECRET",
    required: true,
    consequence: "Every sign-in returns 500 (see docs/Phase2-8_Completion_Report.md).",
  },
  {
    name: "SUPABASE_JWT_SECRET",
    required: true,
    consequence:
      "The CBT question bank returns 503 'CBT database access is not configured'. This is the project's legacy HS256 JWT secret (Supabase → Project Settings → API → JWT Settings).",
  },
  {
    name: "RESEND_API_KEY",
    required: false,
    consequence: "Email is disabled; invitations are not sent.",
  },
  {
    name: "DEEPSEEK_API_KEY",
    required: false,
    consequence: "AI features (Copilot, AI import) are unavailable.",
  },
  {
    name: "GROQ_API_KEY",
    required: false,
    consequence: "AI fallback provider is unavailable.",
  },
];

/**
 * Read the environment on every request, never at build time.
 *
 * A statically generated page would freeze the answer into the build output —
 * both wrong (it describes the build, not the running deployment) and a place
 * where a secret's VALUE could be inlined into an artifact. Presence is checked
 * live.
 */
export const dynamic = "force-dynamic";

export default function SystemHealthPage() {
  // Vercel sets these itself; they answer "is production running what I pushed?"
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? null;

  const results = CHECKS.map((check) => ({
    ...check,
    present: Boolean(process.env[check.name]),
  }));

  const missingRequired = results.filter((r) => r.required && !r.present);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold">System Health</h1>
        <p className="text-small text-text-muted mt-1">
          Configuration of the deployment you are looking at
        </p>
      </div>

      <Card variant="default" className="shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-caption text-text-muted">Environment</p>
            <p className="text-body font-semibold text-text-primary capitalize">{environment}</p>
          </div>
          {commit && (
            <div>
              <p className="text-caption text-text-muted">Deployed commit</p>
              <p className="text-body font-mono text-text-primary">
                {commit}
                {branch ? <span className="text-text-muted"> · {branch}</span> : null}
              </p>
            </div>
          )}
          <div>
            <p className="text-caption text-text-muted">Required variables</p>
            <Badge variant={missingRequired.length ? "error" : "success"}>
              {missingRequired.length ? `${missingRequired.length} missing` : "all present"}
            </Badge>
          </div>
        </div>
      </Card>

      {missingRequired.length > 0 && (
        <Card variant="default" className="shadow-sm border-error">
          <p className="text-body font-semibold text-error">
            This deployment cannot work correctly.
          </p>
          <p className="text-small text-text-secondary mt-1">
            Add the missing variables in Vercel → Project → Settings → Environment Variables,
            then <strong>redeploy</strong> — values are read at runtime and a redeploy is what
            makes a change take effect.
          </p>
        </Card>
      )}

      <Card variant="default" className="shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-caption font-semibold text-text-secondary">Variable</th>
              <th className="py-2 pr-3 text-caption font-semibold text-text-secondary">Status</th>
              <th className="py-2 text-caption font-semibold text-text-secondary">If missing</th>
            </tr>
          </thead>
          <tbody>
            {results.map((check) => (
              <tr key={check.name} className="border-b border-border/60 last:border-0 align-top">
                <td className="py-2 pr-3 text-small font-mono text-text-primary">
                  {check.name}
                  {!check.required && (
                    <span className="ml-2 text-caption font-sans text-text-muted">optional</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <Badge variant={check.present ? "success" : check.required ? "error" : "warning"}>
                    {check.present ? "set" : "missing"}
                  </Badge>
                </td>
                <td className="py-2 text-small text-text-secondary">{check.consequence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-caption text-text-muted">
        Only presence is shown. No value is ever rendered here, and no secret leaves the server.
      </p>
    </div>
  );
}
