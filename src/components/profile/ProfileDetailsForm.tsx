"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { ProfileProgress } from "./ProfileProgress";

type CompletionRole = "teacher" | "student" | "school_admin";

export interface ProfileDetails {
  full_name?: string;
  phone?: string;
  contact_email?: string;
  gender?: string;
  percent: number;
  complete: boolean;
}

interface ProfileDetailsFormProps {
  role: CompletionRole;
  initial: ProfileDetails;
  /** A student's name belongs to the school; teachers and admins may correct their own. */
  nameEditable?: boolean;
  phoneLabel?: string;
  phoneHint?: string;
  /** Take the user to their dashboard as soon as the completion gate is reached. */
  redirectWhenComplete?: boolean;
  title?: string;
  description?: string;
}

const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

/**
 * The completion fields, shared by every role so the wording and the rules
 * cannot drift:
 *
 *   * the CONTACT email is not the sign-in address and is not verified — no
 *     delivery service is configured, so nothing is ever "sent" to it;
 *   * the school admin form has no gender: that account represents the
 *     institution;
 *   * the score is returned by the server after the save, never computed here.
 */
export function ProfileDetailsForm({
  role,
  initial,
  nameEditable = true,
  phoneLabel = "Phone number",
  phoneHint,
  redirectWhenComplete = false,
  title = "Your details",
  description,
}: ProfileDetailsFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.full_name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contact_email ?? "");
  const [gender, setGender] = useState(initial.gender ?? "");
  const [percent, setPercent] = useState(initial.percent);
  const [complete, setComplete] = useState(initial.complete);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showsGender = role !== "school_admin";

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMsg(null);
    // Crossed the gate on THIS save? Then move on. A later edit to an already
    // complete profile stays on the page instead of throwing the user out.
    const wasComplete = complete;

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(nameEditable ? { full_name: fullName } : {}),
          phone,
          contact_email: contactEmail,
          ...(showsGender ? { gender } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save your profile.");

      setPercent(data.profile_percent ?? percent);
      setComplete(data.profile_complete === true);
      setMsg({ type: "success", text: "Profile saved." });

      // Tell the layout the gate is open. Without this its cached
      // "incomplete" flag would send the user straight back here after the
      // redirect below.
      if (data.profile_complete === true) {
        window.dispatchEvent(new Event("profile-completed"));
      }

      if (redirectWhenComplete && !wasComplete && data.profile_complete === true) {
        router.replace(`/${role}/dashboard`);
      }
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Could not save your profile.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="default" className="shadow-sm">
      <form onSubmit={save} className="p-5 space-y-4">
        <div>
          <h2 className="text-h3 font-bold text-text-primary">{title}</h2>
          <p className="mt-1 text-small text-text-muted">
            {description ??
              "These details are used for school communications. Account recovery is not available yet — this address is not verified, and no reset link is sent to it."}
          </p>
        </div>

        <ProfileProgress percent={percent} complete={complete} />

        <Input
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={!nameEditable}
          hint={nameEditable ? undefined : "Ask your school to correct your name."}
          autoComplete="name"
        />

        {showsGender ? (
          <div className="space-y-1">
            <label
              className="text-caption font-medium text-text-primary"
              htmlFor={`${role}-gender`}
            >
              Gender
            </label>
            <select
              id={`${role}-gender`}
              className="w-full rounded-lg border border-border bg-surface px-3.5 h-[42px] text-body text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <Input
          label={phoneLabel}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0803 123 4567"
          hint={phoneHint ?? "Used to reach you about school matters."}
          autoComplete="tel"
        />

        <Input
          label="Contact email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="you@example.com"
          hint="Not your sign-in address. Kept for school communications and for account recovery once email delivery is enabled."
          autoComplete="email"
        />

        {msg ? (
          <div
            className={`rounded-sm border px-4 py-2 ${
              msg.type === "error" ? "border-error bg-error-bg" : "border-success bg-success-bg"
            }`}
          >
            <p
              className={`text-small font-medium ${
                msg.type === "error" ? "text-error" : "text-success"
              }`}
            >
              {msg.text}
            </p>
          </div>
        ) : null}

        <Button type="submit" loading={saving}>
          Save details
        </Button>
      </form>
    </Card>
  );
}
