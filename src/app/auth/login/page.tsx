"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card } from "@/components/ui";

// Role → dashboard path map
const ROLE_DASHBOARDS: Record<string, string> = {
  super_admin: "/super-admin/dashboard",
  school_admin: "/school-admin/dashboard",
  teacher: "/teacher/dashboard",
  student: "/student/dashboard",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      setError(
        signInError?.message ?? "Login failed. Please check your credentials."
      );
      setLoading(false);
      return;
    }

    // Read the role from the JWT — works for all 4 roles automatically
    const role =
      (data.user.app_metadata?.role as string) ||
      (data.user.user_metadata?.role as string) ||
      "";

    const destination = ROLE_DASHBOARDS[role];

    if (!destination) {
      setError(
        "Your account has no role assigned. Please contact your administrator."
      );
      setLoading(false);
      return;
    }

    // Go straight to the correct dashboard — no stress, no loops
    router.replace(destination);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-display font-extrabold text-primary">
            SchoolAid
          </h1>
          <p className="text-small text-text-muted mt-1">
            School Management &amp; Result Processing
          </p>
        </div>

        <Card variant="bordered" className="shadow-md">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <h2 className="text-h3 font-bold text-text-primary mb-1">
                Sign in to your account
              </h2>
              <p className="text-caption text-text-muted">
                You will be taken to your dashboard automatically.
              </p>
            </div>

            <Input
              label="Email address"
              type="email"
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {error && (
              <div
                className="bg-error-bg border border-error rounded-sm px-4 py-3"
                role="alert"
              >
                <p className="text-small text-error font-medium">{error}</p>
              </div>
            )}

            <Button type="submit" fullWidth loading={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </Card>

        <p className="text-caption text-text-muted text-center mt-6">
          Forgot your password? Contact your school administrator.
        </p>
      </div>
    </div>
  );
}
