/**
 * Inline SVG icons for the landing page.
 *
 * WHY NOT AN ICON FONT
 * --------------------
 * The page previously used Material Symbols ligatures. If that font failed to
 * load — slow 3G, a blocked font CDN, an in-app browser — the ligature rendered
 * as literal words on the page ("check_circle", "verified"). An inline SVG has no
 * such failure mode: it ships with the markup, inherits `currentColor`, and is
 * invisible to screen readers by default.
 *
 * All icons are 24×24, 1.75 stroke, and decorative unless a caller labels them.
 */

type IconProps = { className?: string };

export function SchoolAidLogoMark({ className = "h-8 w-auto" }: IconProps) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Dynamic outer swoosh */}
      <path
        d="M11 33C4.5 29.5 3.5 20.5 9.5 14C16 7 29.5 5 41.5 9.5"
        stroke="#0284C7"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M42.5 9.8C48.5 12.2 52.5 16.5 51.5 21.5"
        stroke="#38BDF8"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Digital pixel squares */}
      <rect x="47" y="10" width="3.5" height="3.5" rx="0.6" fill="#0284C7" />
      <rect x="52.5" y="13.5" width="3" height="3" rx="0.5" fill="#38BDF8" />
      <rect x="49.5" y="16.5" width="2.5" height="2.5" rx="0.4" fill="#0F1F3D" />
      <rect x="55" y="18.5" width="2" height="2" rx="0.4" fill="#0284C7" />

      {/* Open Book */}
      <path
        d="M14 29.5C19 26.5 26 26.5 31 29.5C36 26.5 43 26.5 48 29.5V34C43 31 36 31 31 34C26 31 19 31 14 34V29.5Z"
        fill="#0369A1"
      />
      <path
        d="M15.5 27C20 24.5 26 24.8 31 27.5C36 24.8 42 24.5 46.5 27V30.5C42 28 36 28 31 30.8C26 28 20 28 15.5 30.5V27Z"
        fill="#38BDF8"
      />

      {/* Graduation Cap */}
      <path d="M31 7L17 13.5L31 20L45 13.5L31 7Z" fill="#0F1F3D" />
      <path d="M31 7L17 13.5L31 17.5L45 13.5L31 7Z" fill="#1D4ED8" />
      <path
        d="M22.5 16.5V21.5C22.5 23.2 26.3 24.8 31 24.8C35.7 24.8 39.5 23.2 39.5 21.5V16.5L31 20.5L22.5 16.5Z"
        fill="#0F1F3D"
      />
      {/* Tassel */}
      <path
        d="M42.5 14.5V21"
        stroke="#F5A524"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="42.5" cy="21.8" r="1.4" fill="#F5A524" />
    </svg>
  );
}

export function CheckIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CheckCircleIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function ArrowRightIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ClipboardIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="8" y="3" width="8" height="4" rx="1.5" />
      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  );
}

export function SearchIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ChatIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

export function DocumentIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

export function RocketIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3c3.5 1.5 6 5 6 9l-3 3-3-1-3 1-3-3c0-4 2.5-7.5 6-9Z" />
      <path d="M9 15l-3 3M15 15l3 3M12 12v3" />
    </svg>
  );
}

export function GraduationIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 9l9-4 9 4-9 4-9-4Z" />
      <path d="M7 11v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4" />
    </svg>
  );
}

export function UsersIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M16 11a3 3 0 1 0-1.5-5.6M17 20c0-2.2-.9-3.9-2.2-4.9" />
    </svg>
  );
}

export function CalendarCheckIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4" />
    </svg>
  );
}

export function CardIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </svg>
  );
}

export function GlobeIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
    </svg>
  );
}

export function ClockIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function ShieldIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function MailIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function PinIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function WhatsAppIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.74.46 3.44 1.32 4.94L2 22l5.36-1.4a9.82 9.82 0 0 0 4.68 1.2h.01c5.43 0 9.84-4.4 9.84-9.84C21.89 6.4 17.48 2 12.04 2Zm5.76 14.02c-.24.68-1.4 1.3-1.93 1.35-.5.05-.97.23-3.33-.7-2.83-1.12-4.62-4.02-4.76-4.2-.14-.19-1.13-1.5-1.13-2.87 0-1.36.72-2.03.97-2.31.25-.28.55-.35.73-.35l.53.01c.17 0 .4-.06.62.48.23.55.77 1.9.84 2.04.07.14.11.3.02.49-.1.19-.15.3-.29.47l-.43.5c-.14.14-.29.3-.13.58.16.28.72 1.18 1.54 1.9 1.06.94 1.95 1.24 2.23 1.38.28.14.44.12.6-.07.17-.19.7-.8.89-1.08.19-.28.37-.23.62-.14.25.09 1.6.75 1.87.89.28.14.46.21.53.32.07.12.07.68-.17 1.36Z" />
    </svg>
  );
}
