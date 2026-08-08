import {
  FileStack,
  FolderOpen,
  Clock,
  CreditCard,
  MessageCircleWarning,
  Archive,
} from "lucide-react";
import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";

const PAINS = [
  { icon: FileStack, text: "Admissions are managed on paper." },
  { icon: FolderOpen, text: "Student records are spread across multiple files." },
  { icon: Clock, text: "Teachers spend hours preparing report cards." },
  { icon: CreditCard, text: "Finance teams work with disconnected spreadsheets." },
  { icon: MessageCircleWarning, text: "Parents struggle to access timely information." },
  { icon: Archive, text: "Important academic records become difficult to preserve." },
];

export function Challenge() {
  return (
    <section className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24 grid tablet:grid-cols-2 gap-10 tablet:gap-16 items-start">
      <Reveal>
        <EyebrowLabel>The Challenge</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          Every school wants to grow. Growth shouldn&rsquo;t create more
          administrative work.
        </h2>
        <p className="mt-5 text-body-lg text-text-secondary">
          Many schools are doing remarkable work in education while still
          relying on manual processes behind the scenes.
        </p>
        <p className="mt-4 text-body text-text-secondary">
          As schools grow, these challenges become even more difficult to
          manage. Digital transformation helps schools build better systems
          that support sustainable growth.
        </p>
      </Reveal>

      <Reveal delay={1}>
        <ul className="bg-clay border border-border rounded-lg p-2 tablet:p-3">
          {PAINS.map(({ icon: Icon, text }, i) => (
            <li
              key={text}
              className={`flex items-center gap-4 px-4 py-4 ${
                i !== PAINS.length - 1 ? "border-b border-dashed border-border-strong" : ""
              }`}
            >
              <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border text-warning">
                <Icon className="w-4 h-4" strokeWidth={2.25} />
              </span>
              <span className="text-body text-text-primary">{text}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
