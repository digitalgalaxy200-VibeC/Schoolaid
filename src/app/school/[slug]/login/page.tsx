"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button, Input, Card } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function SchoolLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const [school, setSchool] = useState<{ name: string; logo_url?: string; motto?: string } | null>(null);
  const [schoolError, setSchoolError] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/school-by-slug?slug=${slug}`)
      .then((r) => r.json())
      .then((d) => {
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
            The link you followed is invalid. Please contact your school administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {school?.logo_url ? (
            <img
              src={school.logo_url}
              alt={school.name}
              className="w-20 h-20 rounded-xl object-cover border-2 border-border shadow-md mx-auto mb-4"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-4 border-2 border-border shadow-md">
              <span className="text-primary font-extrabold text-3xl">
                {school?.name?.charAt(0) || "…"}
              </span>
            </div>
          )}
          <h1 className="text-h1 font-extrabold text-text-primary">
            {school?.name || "Loading…"}
          </h1>
          {school?.motto && (
            <p className="text-small text-text-muted italic mt-1">"{school.motto}"</p>
          )}
          <p className="text-caption text-text-muted mt-2">Student & Staff Portal</p>
        </div>

        <Card variant="bordered" className="shadow-md">
          <form onSubmit={handleLogin} className="space-y-5">
            <Input
              label="Email / Username"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
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
            <Button type="submit" fullWidth loading={loading}>
              Sign In
            </Button>
          </form>
        </Card>

        <p className="text-caption text-text-muted text-center mt-6">
          Having trouble? Contact your school administrator.
        </p>
      </div>
    </div>
  );
}
