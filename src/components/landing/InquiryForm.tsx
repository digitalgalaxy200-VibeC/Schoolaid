"use client";

import { useState } from "react";
import {
  HONEYPOT_FIELD,
  INQUIRY_LABELS,
  INQUIRY_LIMITS,
  INQUIRY_ROLES,
  INQUIRY_ROLE_LABELS,
  INQUIRY_SIZES,
  INQUIRY_SIZE_LABELS,
  parseInquiry,
} from "@/lib/inquiries/config";

type Fields = Record<string, string>;
type FieldErrors = Record<string, string>;

const EMPTY: Fields = {
  full_name: "",
  email: "",
  phone: "",
  school_name: "",
  role: "",
  school_size: "",
  message: "",
  [HONEYPOT_FIELD]: "",
};

const inputCls =
  "w-full min-h-[48px] px-4 rounded-lp-lg bg-lp-surface-container-lowest border text-lp-body-md text-lp-on-surface placeholder:text-lp-outline focus:outline-none focus:ring-2 focus:ring-lp-primary-container";

/** The public "Waitlist" form. Wording comes from INQUIRY_LABELS. */
export function InquiryForm() {
  const [values, setValues] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  const set = (name: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    if (errors[name]) setErrors((er) => ({ ...er, [name]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Same rules the server enforces, so most mistakes are caught without a round trip.
    const { errors: local } = parseInquiry(values);
    if (!local.ok) {
      setErrors(Object.fromEntries(local.list.map((f) => [f.field, f.message])));
      return;
    }
    setErrors({});
    setState("sending");

    try {
      const res = await fetch("/api/public/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, source: "landing" }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setState("done");
        return;
      }
      if (res.status === 400 && Array.isArray(json.fields)) {
        setErrors(Object.fromEntries(json.fields.map((f: { field: string; message: string }) => [f.field, f.message])));
      }
      setFormError(json.error || "Something went wrong. Please try again.");
    } catch {
      setFormError("We could not reach the server. Check your connection and try again.");
    }
    setState("idle");
  };

  if (state === "done") {
    return (
      <div role="status" className="rounded-lp-xl bg-lp-surface-container-lowest p-8 text-center shadow-lp-lg">
        <span className="material-symbols-outlined text-lp-primary text-5xl">check_circle</span>
        <h3 className="text-lp-headline-md text-lp-primary mt-3">{INQUIRY_LABELS.successTitle}</h3>
        <p className="text-lp-body-md text-lp-on-surface-variant mt-2">{INQUIRY_LABELS.successBody}</p>
      </div>
    );
  }

  const field = (name: keyof typeof EMPTY, label: string, input: React.ReactNode, required = false) => (
    <div>
      <label htmlFor={`inq-${name}`} className="block text-lp-label-md text-lp-on-surface mb-1.5">
        {label}
        {required && <span className="text-lp-error ml-0.5">*</span>}
      </label>
      {input}
      {errors[name] && (
        <p id={`inq-${name}-err`} className="text-lp-label-sm text-lp-error mt-1">
          {label} {errors[name]}
        </p>
      )}
    </div>
  );

  const common = (name: string) => ({
    id: `inq-${name}`,
    name,
    value: values[name],
    onChange: set(name),
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `inq-${name}-err` : undefined,
    className: `${inputCls} ${errors[name] ? "border-lp-error" : "border-lp-outline-variant"}`,
  });

  return (
    <form onSubmit={submit} noValidate className="rounded-lp-xl bg-lp-surface-container-lowest p-6 lg:p-8 shadow-lp-lg space-y-4">
      {field("full_name", "Full name", <input {...common("full_name")} type="text" autoComplete="name" maxLength={INQUIRY_LIMITS.name} />, true)}
      {field("email", "Email", <input {...common("email")} type="email" autoComplete="email" maxLength={INQUIRY_LIMITS.email} />, true)}

      <div className="grid sm:grid-cols-2 gap-4">
        {field("phone", "Phone (optional)", <input {...common("phone")} type="tel" autoComplete="tel" maxLength={INQUIRY_LIMITS.phone} />)}
        {field("school_name", "School name (optional)", <input {...common("school_name")} type="text" autoComplete="organization" maxLength={INQUIRY_LIMITS.school} />)}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {field(
          "role",
          "Your role (optional)",
          <select {...common("role")}>
            <option value="">Select…</option>
            {INQUIRY_ROLES.map((r) => <option key={r} value={r}>{INQUIRY_ROLE_LABELS[r]}</option>)}
          </select>,
        )}
        {field(
          "school_size",
          "School size (optional)",
          <select {...common("school_size")}>
            <option value="">Select…</option>
            {INQUIRY_SIZES.map((s) => <option key={s} value={s}>{INQUIRY_SIZE_LABELS[s]}</option>)}
          </select>,
        )}
      </div>

      {field(
        "message",
        `${INQUIRY_LABELS.messageLabel} (optional)`,
        <textarea
          {...common("message")}
          rows={4}
          maxLength={INQUIRY_LIMITS.message}
          placeholder={INQUIRY_LABELS.messagePlaceholder}
          className={`${common("message").className} py-3`}
        />,
      )}

      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="inq-hp">Leave this field empty</label>
        <input id="inq-hp" type="text" tabIndex={-1} autoComplete="off" name={HONEYPOT_FIELD} value={values[HONEYPOT_FIELD]} onChange={set(HONEYPOT_FIELD)} />
      </div>

      {formError && (
        <p role="alert" className="rounded-lp-lg bg-lp-error-container text-lp-on-error-container text-lp-label-md px-4 py-3">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full min-h-[52px] rounded-lp-lg bg-lp-secondary-container text-lp-on-secondary-container text-lp-label-lg font-bold hover:bg-lp-secondary-fixed-dim transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "sending" ? "Sending…" : INQUIRY_LABELS.submit}
      </button>
      <p className="text-lp-label-sm text-lp-on-surface-variant text-center">
        We only use your details to reply about SchoolAid.
      </p>
    </form>
  );
}
