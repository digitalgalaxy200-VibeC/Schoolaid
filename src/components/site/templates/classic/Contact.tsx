import type { SiteContact } from "@/lib/site/config";
import type { PublicSchool, SiteSection } from "@/lib/site/types";

type ContactSection = Extract<SiteSection, { kind: "contact" }>;

const SOCIALS: { key: keyof SiteContact; label: string; icon: string }[] = [
  { key: "whatsapp", label: "WhatsApp", icon: "💬" },
  { key: "facebook", label: "Facebook", icon: "📘" },
  { key: "instagram", label: "Instagram", icon: "📷" },
  { key: "x", label: "X", icon: "𝕏" },
  { key: "youtube", label: "YouTube", icon: "📺" },
];

export function Contact({
  school,
  section,
  contact,
}: {
  school: PublicSchool;
  section: ContactSection;
  contact: SiteContact;
}) {
  const socials = SOCIALS.filter((social) => contact[social.key]);

  return (
    <section id="contact" className="scroll-mt-16 bg-white py-16 sm:py-20 border-t border-gray-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Get In Touch
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          <p className="mt-3 text-base text-gray-600 leading-relaxed">
            {section.intro}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-12">
          {/* Contact Details Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {school.phone ? (
                <a
                  href={`tel:${school.phone}`}
                  className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-[var(--site-tint)]/40 p-5 transition-all hover:bg-[var(--site-tint)]/80 hover:shadow-sm"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm">
                    📞
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Call Us</h3>
                    <p className="mt-1 text-base font-semibold text-gray-900">{school.phone}</p>
                  </div>
                </a>
              ) : null}

              {school.email ? (
                <a
                  href={`mailto:${school.email}`}
                  className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-[var(--site-tint)]/40 p-5 transition-all hover:bg-[var(--site-tint)]/80 hover:shadow-sm"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm">
                    ✉️
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Email Us</h3>
                    <p className="mt-1 text-base font-semibold text-gray-900 break-all">{school.email}</p>
                  </div>
                </a>
              ) : null}
            </div>

            {school.address ? (
              <div className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-[var(--site-tint)]/40 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm">
                  📍
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Campus Location</h3>
                  <p className="mt-1 text-base font-semibold text-gray-900 leading-relaxed">{school.address}</p>
                </div>
              </div>
            ) : null}

            {/* Social Links */}
            {socials.length > 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Connect With Us</h3>
                <div className="flex flex-wrap gap-2.5">
                  {socials.map((social) => (
                    <a
                      key={social.key}
                      href={contact[social.key] as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 transition-all hover:border-[var(--site-primary)] hover:text-[var(--site-primary)] hover:shadow"
                    >
                      <span>{social.icon}</span>
                      <span>{social.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Quick Action Box */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-[var(--site-primary-dark)] to-[var(--site-primary)] p-8 text-white shadow-xl">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                Admissions Open
              </span>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-white">
                Ready to Join Our Community?
              </h3>
              <p className="mt-3 text-base leading-relaxed text-white/90">
                Enrollment is currently open for prospective students. Contact our admissions officer directly or visit our administrative office during working hours.
              </p>

              <div className="mt-8 space-y-3">
                {school.phone ? (
                  <a
                    href={`tel:${school.phone}`}
                    className="block w-full text-center rounded-xl bg-[var(--site-accent)] px-4 py-3.5 text-sm font-bold text-white shadow-md transition-transform hover:opacity-95 active:scale-95"
                  >
                    Call Admissions Office
                  </a>
                ) : null}
                <a
                  href="/login"
                  className="block w-full text-center rounded-xl bg-white/15 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/25"
                >
                  Student / Teacher Portal Login →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
