"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button, Input, Card } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

/**
 * A school's own login page.
 *
 * Reachable two ways, and `slug` carries whichever applies:
 *   /school/<slug>/login   on the platform — the link the school's website uses
 *   /login                 on the school's own domain, rewritten by middleware
 *
 * So the parameter is an identifier, not strictly a slug: `findPortalSchool`
 * accepts either, exactly as the website resolver does.
 *
 * The school's NAME, LOGO and PALETTE come from `/api/public/portal-school`,
 * which refuses an archived or inactive school — a closed school loses its login
 * page along with its website. School colours are applied as CSS variables and
 * only to the chrome around the form (a bar, the logo ring, the heading): the
 * form itself stays the platform's, because a sign-in box is the last place to
 * invent a colour scheme. Every colour is already contrast-checked in
 * `src/lib/site/theme.ts`.
 */

type PortalSchool = {
  name: string;
  slug: string;
  logo_url: string | null;
  motto: string | null;
  palette: { id: string; label: string; colors: Record<string, string> };
};

export default function SchoolLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const [school, setSchool] = useState<PortalSchool | null>(null);
  const [schoolError, setSchoolError] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/portal-school?identifier=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d: PortalSchool) => {
        if (d?.name) setSchool(d);
        else setSchoolError(true);
      })
      .catch(() => setSchoolError(true));
  }, [slug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.push(data.redirect || "/school-admin/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (schoolError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="text-center">
          <p className="text-h2 font-bold text-error">School Not Found</p>
          <p className="text-small text-text-muted mt-2">
            This school has no portal at this address. Please contact your school administrator.
          </p>
          <a href="/login" className="text-small text-primary hover:underline mt-4 inline-block">
            Go to the SchoolAid login
          </a>
        </div>
      </div>
    );
  }

  const colors = school?.palette?.colors;
  const theme = colors
    ? ({
        "--portal-primary": colors.primary,
        "--portal-primary-dark": colors.primaryDark,
        "--portal-tint": colors.tint,
      } as CSSProperties)
    : undefined;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4" style={theme}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {school?.logo_url ? (
            <img
              src={school.logo_url}
              alt={school.name}
              className="w-20 h-20 rounded-xl object-cover border-2 shadow-md mx-auto mb-4"
              style={{ borderColor: colors?.tint ?? "var(--border)" }}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-xl flex items-center justify-center mx-auto mb-4 border-2 shadow-md"
              style={{ backgroundColor: colors?.tint ?? "var(--primary-light)", borderColor: colors?.tint ?? "var(--border)" }}
            >
              <span
                className="font-extrabold text-3xl"
                style={{ color: colors?.primary ?? "var(--primary)" }}
              >
                {school?.name?.charAt(0) || "…"}
              </span>
            </div>
          )}
          <h1
            className="text-h1 font-extrabold"
            style={{ color: colors?.primaryDark ?? "var(--text-primary)" }}
          >
            {school?.name || "Loading…"}
          </h1>
          {school?.motto && (
            <p className="text-small text-text-muted italic mt-1">&ldquo;{school.motto}&rdquo;</p>
          )}
          <p className="text-caption text-text-muted mt-2">Student &amp; Staff Portal</p>
        </div>

        {/* The school's colour, on the one piece of chrome everybody looks at. */}
        <div
          className="h-1.5 rounded-t-sm"
          style={{ backgroundColor: colors?.primary ?? "var(--primary)" }}
        />

        <Card variant="default" className="shadow-md">
          <form onSubmit={handleLogin} className="space-y-5">
            <Input
              label="Username"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your username"
              required
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
            {error ? (
              <div className="bg-error-bg border border-error rounded-sm px-4 py-3">
                <p className="text-small text-error font-medium">{error}</p>
              </div>
            ) : null}
            <Button
              type="submit"
              fullWidth
              loading={loading}
              className="rounded-lg"
              style={colors ? { backgroundColor: colors.primary } : undefined}
            >
              Sign In
            </Button>
          </form>
        </Card>

        <p className="text-caption text-text-muted text-center mt-6">
          Having trouble? Contact your school administrator.
        </p>
        {school?.slug ? (
          <p className="text-caption text-text-muted text-center mt-2">
            <a href={`/site/${school.slug}`} className="hover:underline">
              ← Back to the school website
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
