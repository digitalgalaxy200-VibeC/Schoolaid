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
      if (!res.ok) {
        // A 429 body carries how long the block lasts. Say it out loud: "too many
        // attempts" without a wait time leaves the person guessing whether to
        // retry now, in a minute, or to call the school.
        const wait = Number(data?.retry_after_seconds);
        if (res.status === 429 && Number.isFinite(wait) && wait > 0) {
          const seconds = Math.ceil(wait);
          throw new Error(
            `Too many attempts. Please wait ${seconds} ${seconds === 1 ? "second" : "seconds"} and try again.`,
          );
        }
        throw new Error(data.error || "Login failed");
      }
      router.push(data.redirect || "/super-admin/dashboard");
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
        <Card variant="elevated" className="shadow-lg p-2">
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
              placeholder="Enter password"
              required
            />
            {error && (
              <div className="bg-error-bg border border-error rounded-md px-4 py-3 animate-fade-in">
                <p className="text-small text-error font-medium">{error}</p>
              </div>
            )}
            <div className="pt-2">
              <Button type="submit" fullWidth loading={loading} size="lg" className="text-body font-bold rounded-lg">
                Sign In
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
