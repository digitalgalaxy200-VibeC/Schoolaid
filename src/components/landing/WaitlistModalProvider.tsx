"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Modal, Button, Input } from "@/components/ui";
import { useLanguage } from "./LanguageProvider";

interface WaitlistModalContextValue {
  open: (source: string) => void;
}

const WaitlistModalContext = createContext<WaitlistModalContextValue | null>(null);

export function useWaitlistModal() {
  const ctx = useContext(WaitlistModalContext);
  if (!ctx) throw new Error("useWaitlistModal must be used within WaitlistModalProvider");
  return ctx;
}

const EMPTY_FORM = {
  full_name: "",
  school_name: "",
  email: "",
  phone: "",
  country: "",
  city: "",
  message: "",
  website: "", // honeypot
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = Partial<Record<"full_name" | "school_name" | "email", string>>;

export function WaitlistModalProvider({ children }: { children: ReactNode }) {
  const { t, locale } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState("landing_page");
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const open = (src: string) => {
    setSource(src);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    // Reset after the close animation has time to finish.
    setTimeout(() => {
      setForm(EMPTY_FORM);
      setFieldErrors({});
      setSubmitted(false);
      setError("");
    }, 200);
  };

  const field = (key: keyof typeof EMPTY_FORM) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!form.full_name.trim()) errors.full_name = t.waitlistForm.validationRequired;
    if (!form.school_name.trim()) errors.school_name = t.waitlistForm.validationRequired;
    if (!form.email.trim()) errors.email = t.waitlistForm.validationRequired;
    else if (!EMAIL_RE.test(form.email.trim())) errors.email = t.waitlistForm.validationEmail;
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source, locale }),
      });
      if (res.status === 429) throw new Error(t.waitlistForm.errorRateLimit);
      if (!res.ok) throw new Error(t.waitlistForm.errorGeneric);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.waitlistForm.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WaitlistModalContext.Provider value={{ open }}>
      {children}

      <Modal isOpen={isOpen} onClose={close} title={submitted ? undefined : t.waitlistForm.modalTitle} size="md">
        {submitted ? (
          <div className="py-6 text-center">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-bg text-success mb-4">
              <CheckCircle2 className="w-7 h-7" strokeWidth={2.25} />
            </span>
            <h3 className="font-display font-bold text-h2 text-text-primary">
              {t.waitlistForm.successHeading}
            </h3>
            <p className="mt-2 text-body text-text-secondary max-w-sm mx-auto">
              {t.waitlistForm.successBody.replace(
                "{email}",
                form.email || t.waitlistForm.successFallbackName,
              )}
            </p>
            <Button variant="primary" className="mt-6" onClick={close}>
              {t.waitlistForm.doneButton}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <p className="text-body text-text-secondary -mt-1">{t.waitlistForm.intro}</p>

            <Input
              label={t.waitlistForm.fullName}
              required
              placeholder={t.waitlistForm.fullNamePlaceholder}
              error={fieldErrors.full_name}
              {...field("full_name")}
            />
            <Input
              label={t.waitlistForm.schoolName}
              required
              placeholder={t.waitlistForm.schoolNamePlaceholder}
              error={fieldErrors.school_name}
              {...field("school_name")}
            />
            <div className="grid tablet:grid-cols-2 gap-4">
              <Input
                label={t.waitlistForm.email}
                type="email"
                required
                placeholder={t.waitlistForm.emailPlaceholder}
                error={fieldErrors.email}
                {...field("email")}
              />
              <Input
                label={t.waitlistForm.phone}
                type="tel"
                placeholder={t.waitlistForm.phonePlaceholder}
                {...field("phone")}
              />
            </div>
            <div className="grid tablet:grid-cols-2 gap-4">
              <Input label={t.waitlistForm.country} placeholder={t.waitlistForm.countryPlaceholder} {...field("country")} />
              <Input label={t.waitlistForm.city} placeholder={t.waitlistForm.cityPlaceholder} {...field("city")} />
            </div>

            <div>
              <label htmlFor="waitlist-message" className="block text-caption font-medium text-text-primary mb-1.5">
                {t.waitlistForm.message}
              </label>
              <textarea
                id="waitlist-message"
                rows={3}
                placeholder={t.waitlistForm.messagePlaceholder}
                className="w-full px-4 py-3 text-body bg-surface border border-border rounded-md placeholder:text-text-disabled transition-colors duration-150 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 resize-none"
                {...field("message")}
              />
            </div>

            {/* Honeypot — hidden from real visitors, catches simple bots */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="absolute left-[-9999px] w-px h-px opacity-0"
              aria-hidden="true"
              {...field("website")}
            />

            {error && <p className="text-caption text-error">{error}</p>}

            <Button type="submit" variant="primary" fullWidth loading={submitting}>
              {t.waitlistForm.submit}
            </Button>
          </form>
        )}
      </Modal>
    </WaitlistModalContext.Provider>
  );
}
