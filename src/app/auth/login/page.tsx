"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <h1 className="text-display font-extrabold text-primary">
            SchoolAid
          </h1>
          <p className="text-small text-text-muted mt-1">
            School Management &amp; Result Processing
          </p>
        </div>

        <Card variant="bordered" className="shadow-md">
          <form onSubmit={handleLogin} className="space-y-5">
            <Input
              label="Email"
              type="email"
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <p className="text-small text-error" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" fullWidth loading={loading}>
              Sign In
            </Button>
          </form>
        </Card>

        <p className="text-caption text-text-muted text-center mt-4">
          Demo: superadmin@schoolaid.com / admin123
        </p>
      </div>
    </div>
  );
}
