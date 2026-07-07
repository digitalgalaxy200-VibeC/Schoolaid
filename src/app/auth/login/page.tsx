"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card, Container } from "@/components/ui";

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
    <Container as="main" className="flex items-center justify-center min-h-screen">
      <Card variant="bordered" className="w-full max-w-md">
        <Card header={<h1 className="text-heading2 font-bold text-text-primary">SchoolAid</h1>}>
          <form onSubmit={handleLogin} className="space-y-spacing-lg">
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
              <p className="text-body-sm text-error" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" fullWidth loading={loading}>
              Sign In
            </Button>
          </form>
        </Card>

        <Card footer>
          <p className="text-caption text-text-muted text-center">
            Demo: superadmin@schoolaid.com / admin123
          </p>
        </Card>
      </Card>
    </Container>
  );
}
