import {
  UsersRound,
  ClipboardCheck,
  Layers,
  Banknote,
  HeartHandshake,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";

const AREAS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: UsersRound,
    title: "Student Administration",
    description:
      "Create a connected student journey from admission to graduation with secure digital records, admissions management, promotions, transfers, and lifelong student history.",
  },
  {
    icon: ClipboardCheck,
    title: "Academic Management",
    description:
      "Simplify assessments, examinations, grading, report cards, academic tracking, and curriculum management while reducing administrative workload for teachers.",
  },
  {
    icon: Layers,
    title: "School Operations",
    description:
      "Digitize attendance, communication, scheduling, approvals, document management, and everyday administrative processes.",
  },
  {
    icon: Banknote,
    title: "Financial Administration",
    description:
      "Improve fee management, payment tracking, receipts, reporting, and financial visibility across the entire school.",
  },
  {
    icon: HeartHandshake,
    title: "Parent & Student Experience",
    description:
      "Strengthen communication through secure parent and student portals, academic progress tracking, notifications, and digital report cards.",
  },
  {
    icon: Globe,
    title: "School Website & Digital Presence",
    description:
      "Build a stronger digital identity with professional school websites, online admissions, branding, and communication tools.",
  },
];

export function Transform() {
  return (
    <section id="transform" className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
      <Reveal className="max-w-2xl">
        <EyebrowLabel>What We Help Schools Transform</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          Building better schools through digital transformation.
        </h2>
      </Reveal>

      <div className="mt-10 grid tablet:grid-cols-2 desktop:grid-cols-3 gap-5">
        {AREAS.map(({ icon: Icon, title, description }, i) => (
          <Reveal key={title} delay={((i % 3) as 0 | 1 | 2)}>
            <div className="group h-full transition-transform duration-300 ease-out hover:-translate-y-1">
              <div className="flex items-center justify-center w-11 h-9 rounded-t-md bg-primary text-white ml-5 transition-colors duration-300 group-hover:bg-accent">
                <Icon className="w-4 h-4" strokeWidth={2.25} />
              </div>
              <div className="h-full bg-surface border border-border rounded-lg rounded-tl-none p-6 shadow-sm transition-shadow duration-300 group-hover:shadow-md">
                <h3 className="font-display font-bold text-h2 text-text-primary">{title}</h3>
                <p className="mt-2 text-body text-text-secondary">{description}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
