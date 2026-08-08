import { GraduationCap } from "lucide-react";

const SOLUTIONS = [
  "Digital Transformation",
  "Student Administration",
  "Academic Management",
  "Financial Administration",
  "School Websites",
  "Parent & Student Experience",
];

const RESOURCES = [
  { label: "Blog", href: "#" },
  { label: "Case Studies", href: "#" },
  { label: "Digital Transformation Guide", href: "#" },
  { label: "Frequently Asked Questions", href: "#faq" },
];

export function Footer() {
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
          <p className="mt-3 font-landing-display italic text-body-lg text-white/90">
            Africa&rsquo;s Digital Transformation Partner for Schools.
          </p>
          <p className="mt-3 text-body text-white/60 max-w-sm">
            Helping schools modernize their operations, empower educators,
            strengthen school communities, and preserve every student&rsquo;s
            educational journey for generations to come.
          </p>
        </div>

        <div>
          <h3 className="font-mono text-caption uppercase tracking-wide text-white/40">
            Solutions
          </h3>
          <ul className="mt-4 space-y-2.5">
            {SOLUTIONS.map((item) => (
              <li key={item} className="text-body text-white/70">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-mono text-caption uppercase tracking-wide text-white/40">
            Resources
          </h3>
          <ul className="mt-4 space-y-2.5">
            {RESOURCES.map((item) => (
              <li key={item.label}>
                <a href={item.href} className="text-body text-white/70 hover:text-white">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-mono text-caption uppercase tracking-wide text-white/40">
            Contact
          </h3>
          <ul className="mt-4 space-y-2.5">
            <li>
              <a
                href="mailto:partnerships@schoolaid.app"
                className="text-body text-white/70 hover:text-white"
              >
                partnerships@schoolaid.app
              </a>
            </li>
            <li>
              <a href="#" className="text-body text-white/70 hover:text-white">
                Privacy Policy
              </a>
            </li>
            <li>
              <a href="#" className="text-body text-white/70 hover:text-white">
                Terms of Service
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 tablet:px-8 py-5 text-caption text-white/40">
          &copy; {new Date().getFullYear()} SchoolAid. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
