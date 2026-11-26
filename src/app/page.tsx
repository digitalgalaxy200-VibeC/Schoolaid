import type { Metadata } from "next";
import localFont from "next/font/local";
import { LandingPageClient } from "@/components/landing/LandingPageClient";

const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  weight: "400 800",
  style: "normal",
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: { absolute: "SchoolAid — your school, digitised with you" },
  description:
    "Student records, results, CBT exams, attendance, fees and your own school website in one connected system. SchoolAid partners with your school from assessment to go-live, and stays after.",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_NG",
    siteName: "SchoolAid",
    title: "SchoolAid — your school, digitised with you",
    description:
      "Records, results, CBT exams, attendance, fees and your school website in one connected system — with a partner who sets it up, trains your staff and supports you after go-live.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SchoolAid — your school, digitised with you",
    description:
      "A digital transformation partner for schools in Nigeria, with pilot schools in Benin and Francophone Africa.",
  },
};

export default function Home() {
  // Resolved once, on the server, and handed to the client component as a prop:
  // the same number is then used by the HTML and by hydration. See the footer
  // note in LandingPageClient.
  const year = new Date().getFullYear();

  return (
    <div className={`${jakarta.variable} sa-site sa-mobile-clearance`}>
      <LandingPageClient year={year} />
    </div>
  );
}
