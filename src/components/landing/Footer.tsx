"use client";

import { GraduationCap } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

const RESOURCE_HREFS = ["#", "#", "#", "#faq"];

export function Footer() {
  const { t } = useLanguage();
  const resources = t.footer.resources.map((label, i) => ({ label, href: RESOURCE_HREFS[i] }));

  return (
    <footer className="grain-surface bg-primary-dark text-white/70">
      <div className="max-w-7xl mx-auto px-4 tablet:px-8 py-14 grid tablet:grid-cols-[1.3fr_1fr_1fr_1fr] gap-10">
        <div>
          <div className="flex items-center gap-2 font-landing-display font-medium text-h2 text-white">
            <span className="flex items-center justify-center w-8 h-8 rounded-md bg-white/10">
              <GraduationCap className="w-5 h-5" strokeWidth={2.5} />
            </span>
            SchoolAid
          </div>
          <p className="mt-3 font-landing-display italic text-body-lg text-white/90">{t.footer.tagline}</p>
          <p className="mt-3 text-body text-white/60 max-w-sm">{t.footer.blurb}</p>
        </div>

        <div>
          <h3 className="font-mono text-caption uppercase tracking-wide text-white/40">
            {t.footer.solutionsHeading}
          </h3>
          <ul className="mt-4 space-y-2.5">
            {t.footer.solutions.map((item, i) => (
              <li key={i} className="text-body text-white/70">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-mono text-caption uppercase tracking-wide text-white/40">
            {t.footer.resourcesHeading}
          </h3>
          <ul className="mt-4 space-y-2.5">
            {resources.map((item, i) => (
              <li key={i}>
                <a href={item.href} className="text-body text-white/70 hover:text-white transition-colors">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-mono text-caption uppercase tracking-wide text-white/40">
            {t.footer.contactHeading}
          </h3>
          <ul className="mt-4 space-y-2.5">
            <li>
              <a
                href="mailto:partnerships@schoolaid.app"
                className="text-body text-white/70 hover:text-white transition-colors"
              >
                partnerships@schoolaid.app
              </a>
            </li>
            <li>
              <a href="#" className="text-body text-white/70 hover:text-white transition-colors">
                {t.footer.privacyPolicy}
              </a>
            </li>
            <li>
              <a href="#" className="text-body text-white/70 hover:text-white transition-colors">
                {t.footer.termsOfService}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 tablet:px-8 py-5 text-caption text-white/40">
          {t.footer.copyright.replace("{year}", String(new Date().getFullYear()))}
        </div>
      </div>
    </footer>
  );
}
