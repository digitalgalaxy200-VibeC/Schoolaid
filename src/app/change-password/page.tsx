"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

type Step = "create" | "success";

const requirements = [
  { key: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { key: "uppercase", label: "Contains an uppercase letter (A–Z)", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lowercase", label: "Contains a lowercase letter (a–z)", test: (p: string) => /[a-z]/.test(p) },
  { key: "number", label: "Contains a number (0–9)", test: (p: string) => /[0-9]/.test(p) },
];

export default function ChangePasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("create");
  const [user, setUser] = useState<{ full_name?: string; role?: string }>({});
  const [loading, setLoading] = useState(true);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setUser(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const checks = requirements.map((r) => ({
    ...r,
    met: r.test(newPassword),
  }));

  const allMet = checks.every((c) => c.met);
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!allMet) {
      setError("Please meet all password requirements before continuing.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update password.");
        return;
      }
      setStep("success");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-display font-extrabold text-primary">SchoolAid</h1>
          <p className="text-small text-text-muted mt-1">
            {user.role === "student" ? "Student Portal" : user.role === "teacher" ? "Teacher Portal" : "Portal"}
          </p>
        </div>

        {step === "create" && (
          <Card variant="bordered" className="shadow-md">
            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              <div>
                <h2 className="text-h3 font-bold">Create Your New Password</h2>
                <p className="text-small text-text-muted mt-1">
                  Welcome{user.full_name ? `, ${user.full_name}` : ""}! For your security, please create a strong password.
                </p>
              </div>

              {/* Requirements */}
              <div className="bg-bg rounded-sm p-3 space-y-1.5">
                <p className="text-caption font-semibold text-text-secondary mb-1">Password Requirements</p>
                {checks.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 text-caption">
                    <span className={c.met ? "text-success" : "text-text-muted"}>
                      {c.met ? "✓" : "○"}
                    </span>
                    <span className={c.met ? "text-success" : "text-text-muted"}>{c.label}</span>
                  </div>
                ))}
              </div>

              {/* Password fields */}
              <PasswordInput
                label="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter your new password"
                required
              />
              <PasswordInput
                label="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
              />
              {confirmPassword.length > 0 && (
                <div className={`text-caption ${passwordsMatch ? "text-success" : "text-error"}`}>
                  {passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match"}
                </div>
              )}

              {error && (
                <div className="bg-error-bg border border-error rounded-sm px-4 py-3">
                  <p className="text-small text-error font-medium">{error}</p>
                </div>
              )}

              <Button type="submit" fullWidth loading={submitting} disabled={!allMet || !passwordsMatch}>
                Save Password
              </Button>
            </form>
          </Card>
        )}

        {step === "success" && (
          <Card variant="bordered" className="shadow-md">
            <div className="p-5 space-y-5 text-center">
              <div className="w-14 h-14 rounded-full bg-success-bg flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-h3 font-bold">Password Updated Successfully</h2>
                <p className="text-small text-text-muted mt-2">
                  Your password has been updated successfully.
                </p>
                <p className="text-small text-text-muted mt-1">
                  Please remember this password because it will be required every time you log into SchoolAid.
                </p>
                <p className="text-small text-text-muted mt-1">
                  We recommend saving it in a secure place before continuing.
                </p>
              </div>
              <Button fullWidth onClick={() => router.push("/login")}>
                Continue to Login
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
