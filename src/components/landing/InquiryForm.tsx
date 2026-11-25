"use client";

import { useRef, useState } from "react";
import {
  DEFAULT_INQUIRY_SOURCE,
  HONEYPOT_FIELD,
  INQUIRY_LABELS,
  INQUIRY_LIMITS,
  INQUIRY_ROLES,
  INQUIRY_ROLE_LABELS,
  INQUIRY_SIZES,
  INQUIRY_SIZE_LABELS,
  parseInquiry,
  parseInquirySource,
  type InquirySource,
} from "@/lib/inquiries/config";
import { CheckCircleIcon } from "./icons";

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

const STEP_ONE_FIELDS = ["school_name", "full_name", "role"];

/**
 * The tag on the link that brought someone here: `?src=whatsapp`.
 *
 * Read at submit time rather than on mount, so the value survives however the page
 * was reached (a short link, a redirect, a back-navigation) and so this component
 * stays safe to render on the server.
 */
function sourceFromUrl(): InquirySource {
  if (typeof window === "undefined") return DEFAULT_INQUIRY_SOURCE;
  return parseInquirySource(new URLSearchParams(window.location.search).get("src"));
}

const inputCls =
  "w-full min-h-[48px] rounded-[12px] border bg-white px-4 text-[16px] text-[#0f1f3d] placeholder:text-[#8a94a6] focus:outline-none";

/**
 * The partnership application, in two steps.
 *
 * WHY TWO STEPS: seven fields on one screen on a 360px phone looks like a chore
 * and reads as a "structured assessment" it is not. Two short steps with a
 * progress indicator let someone start with what they know — their school — and
 * finish with how to reach them.
 *
 * WHAT IS REQUIRED is still the server's contract: school name, your name, email
 * and a WhatsApp number. Step one gates the first two; step two the rest. The
 * submit call is unchanged, so no backend behaviour depends on the split.
 *
 * ACCESSIBILITY DETAILS THAT MATTER HERE:
 *   - the progress bar is a real `progressbar` with a text label beside it;
 *   - the honeypot is off-screen, `aria-hidden` and untabbable;
 *   - errors are announced through one live region and focus moves to it;
 *   - each step moves focus to its own heading, so a screen reader follows.
 */
export function InquiryForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const alertRef = useRef<HTMLParagraphElement | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const set =
    (name: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      if (errors[name]) setErrors((er) => ({ ...er, [name]: "" }));
    };

  const goToStepTwo = () => {
    const nextErrors: FieldErrors = {};
    if (values.school_name.trim().length < 2) nextErrors.school_name = "is required";
    if (values.full_name.trim().length < 2) nextErrors.full_name = "is required";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError("Please check the highlighted fields.");
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }

    setErrors({});
    setFormError("");
    setStep(2);
    requestAnimationFrame(() => stepHeadingRef.current?.focus());
  };

  const goToStepOne = () => {
    setFormError("");
    setStep(1);
    requestAnimationFrame(() => stepHeadingRef.current?.focus());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Same rules the server enforces, so most mistakes are caught without a round trip.
    const { errors: local } = parseInquiry(values);
    if (!local.ok) {
      const mapped = Object.fromEntries(local.list.map((f) => [f.field, f.message]));
      setErrors(mapped);
      setFormError("Please check the highlighted fields.");
      // Send the person back to the step that owns the first problem.
      const firstField = local.list[0]?.field ?? "";
      if (STEP_ONE_FIELDS.includes(firstField)) {
        setStep(1);
        requestAnimationFrame(() => stepHeadingRef.current?.focus());
      } else {
        requestAnimationFrame(() => alertRef.current?.focus());
      }
      return;
    }

    setErrors({});
    setState("sending");

    try {
      const res = await fetch("/api/public/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, source: sourceFromUrl() }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setState("done");
        return;
      }
      if (res.status === 400 && Array.isArray(json.fields)) {
        setErrors(
          Object.fromEntries(
            json.fields.map((f: { field: string; message: string }) => [f.field, f.message]),
          ),
        );
      }
      setFormError(json.error || "Something went wrong. Please try again.");
    } catch {
      setFormError("We could not reach the server. Check your connection and try again.");
    }
    setState("idle");
    requestAnimationFrame(() => alertRef.current?.focus());
  };

  if (state === "done") {
    return (
      <div role="status" className="py-6 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#eaf4ef] text-[#1f7a5a]">
          <CheckCircleIcon className="h-8 w-8" />
        </span>
        <h3 className="sa-h3 mt-4 text-[#0f1f3d]">{INQUIRY_LABELS.successTitle}</h3>
        <p className="sa-body mx-auto mt-2 max-w-md text-[#4a586e]">{INQUIRY_LABELS.successBody}</p>
      </div>
    );
  }

  const field = (
    name: keyof typeof EMPTY,
    label: string,
    input: React.ReactNode,
    required = false,
  ) => (
    <div>
      <label htmlFor={`inq-${name}`} className="mb-1.5 block text-[14px] font-semibold text-[#0f1f3d]">
        {label}
        {required && (
          <>
            <span className="ml-0.5 text-[#b42318]" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {input}
      {errors[name] && (
        <p id={`inq-${name}-err`} className="mt-1 text-[13px] text-[#b42318]">
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
    className: `${inputCls} ${errors[name] ? "border-[#b42318]" : "border-[#e6dfd3]"}`,
  });

  return (
    <form onSubmit={submit} noValidate>
      {/* Progress */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#2a4b8d]">
            Step {step} of 2
          </p>
          <p className="text-[13px] text-[#4a586e]">
            {step === 1 ? "About your school" : "How to reach you"}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={2}
          aria-valuenow={step}
          aria-label="Application progress"
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e6dfd3]"
        >
          <div
            className="h-full rounded-full bg-[#2a4b8d] transition-[width] duration-300"
            style={{ width: step === 1 ? "50%" : "100%" }}
          />
        </div>
      </div>

      <h3
        ref={stepHeadingRef}
        tabIndex={-1}
        className="sa-h3 mb-4 text-[#0f1f3d] focus:outline-none"
      >
        {step === 1 ? "Tell us about your school" : "Last step — how we follow up"}
      </h3>

      {step === 1 ? (
        <div className="space-y-4">
          {field(
            "school_name",
            "School name",
            <input
              {...common("school_name")}
              type="text"
              autoComplete="organization"
              maxLength={INQUIRY_LIMITS.school}
              placeholder="e.g. Greenfield Academy"
            />,
            true,
          )}

          {field(
            "full_name",
            "Your name",
            <input
              {...common("full_name")}
              type="text"
              autoComplete="name"
              maxLength={INQUIRY_LIMITS.name}
            />,
            true,
          )}

          {field(
            "role",
            "Your role",
            <select {...common("role")}>
              <option value="">Select…</option>
              {INQUIRY_ROLES.map((r) => (
                <option key={r} value={r}>
                  {INQUIRY_ROLE_LABELS[r]}
                </option>
              ))}
            </select>,
          )}

          <button type="button" onClick={goToStepTwo} className="sa-btn sa-btn-primary w-full">
            Continue
          </button>
          <p className="text-center text-[13px] text-[#4a586e]">
            Two short steps. Nothing is charged and no partnership is automatic.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {field(
            "email",
            "Email",
            <input
              {...common("email")}
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={INQUIRY_LIMITS.email}
            />,
            true,
          )}

          {field(
            "phone",
            "WhatsApp number",
            <input
              {...common("phone")}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              maxLength={INQUIRY_LIMITS.phone}
              placeholder="+234…"
            />,
            true,
          )}

          {field(
            "school_size",
            "School size",
            <select {...common("school_size")}>
              <option value="">Select…</option>
              {INQUIRY_SIZES.map((s) => (
                <option key={s} value={s}>
                  {INQUIRY_SIZE_LABELS[s]}
                </option>
              ))}
            </select>,
          )}

          {field(
            "message",
            INQUIRY_LABELS.messageLabel,
            <textarea
              {...common("message")}
              rows={3}
              maxLength={INQUIRY_LIMITS.message}
              placeholder={INQUIRY_LABELS.messagePlaceholder}
              className={`${common("message").className} py-3`}
            />,
          )}

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="submit"
              disabled={state === "sending"}
              className="sa-btn sa-btn-primary w-full sm:flex-1"
            >
              {state === "sending" ? "Sending…" : INQUIRY_LABELS.submit}
            </button>
            <button type="button" onClick={goToStepOne} className="sa-btn sa-btn-ghost w-full sm:w-auto">
              Back
            </button>
          </div>

          <p className="text-center text-[13px] text-[#4a586e]">
            We only use your details to reply about SchoolAid.
          </p>
        </div>
      )}

      {/* Honeypot: off-screen, hidden from assistive tech, untabbable. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="inq-hp">Leave this field empty</label>
        <input
          id="inq-hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          name={HONEYPOT_FIELD}
          value={values[HONEYPOT_FIELD]}
          onChange={set(HONEYPOT_FIELD)}
        />
      </div>

      <p
        ref={alertRef}
        tabIndex={-1}
        role="alert"
        aria-live="assertive"
        className={
          formError
            ? "mt-4 rounded-[12px] bg-[#fdecea] px-4 py-3 text-[14px] text-[#8c1d13]"
            : "sr-only"
        }
      >
        {formError}
      </p>
    </form>
  );
}
