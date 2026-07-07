"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Card } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
      router.push("/super-admin/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-display font-extrabold text-primary">
            SchoolAid
          </h1>
          <p className="text-small text-text-muted mt-1">
            School Management Platform
          </p>
        </div>
        <Card variant="bordered" className="shadow-md">
          <form onSubmit={handleLogin} className="space-y-5">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@schoolaid.com"
              required
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
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
          admin@schoolaid.com / Admin123!
        </p>
      </div>
    </div>
  );
}
