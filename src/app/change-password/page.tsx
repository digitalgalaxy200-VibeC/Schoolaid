"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Card } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const validate = (): string | null => {
    if (newPw.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(newPw)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(newPw)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(newPw)) return "Password must contain at least one number.";
    if (newPw === current) return "New password must be different from current password.";
    if (newPw !== confirm) return "Passwords do not match.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = validate();
    if (msg) { setError(msg); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push("/login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <Card variant="bordered" className="max-w-md w-full shadow-lg p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary-light flex items-center justify-center mb-4">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-h2 font-bold text-text-primary">Create Your Password</h1>
          <p className="text-small text-text-secondary mt-2">
            Welcome to SchoolAid. Your account was created with a temporary password by your school.
            For your security, you must create a personal password before you can continue.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordInput label="Current Password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Temporary password" required />
          <PasswordInput label="New Password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 chars, upper, lower, number" required />
          <PasswordInput label="Confirm Password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter new password" required />
          {error && <div className="bg-error-bg border border-error rounded-sm px-4 py-3"><p className="text-small text-error font-medium">{error}</p></div>}
          <Button type="submit" fullWidth loading={loading}>Set Password &amp; Continue</Button>
        </form>
      </Card>
    </div>
  );
}
