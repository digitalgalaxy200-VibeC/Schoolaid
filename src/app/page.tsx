import { cookies } from "next/headers";
import { type Locale } from "@/lib/i18n/dictionary";
import { LanguageProvider } from "@/components/landing/LanguageProvider";
import { WaitlistModalProvider } from "@/components/landing/WaitlistModalProvider";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Challenge } from "@/components/landing/Challenge";
import { Position } from "@/components/landing/Position";
import { Transform } from "@/components/landing/Transform";
import { WhyItMatters } from "@/components/landing/WhyItMatters";
import { Vision } from "@/components/landing/Vision";
import { WhyPartner } from "@/components/landing/WhyPartner";
import { WhoShouldApply } from "@/components/landing/WhoShouldApply";
import { Process } from "@/components/landing/Process";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export default async function Home() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("schoolaid-lang")?.value;
  const initialLocale: Locale = cookieLocale === "fr" ? "fr" : "en";

  return (
    <LanguageProvider initialLocale={initialLocale}>
      <WaitlistModalProvider>
        <Nav />
        <main>
          <Hero />
          <Challenge />
          <Position />
          <Transform />
          <WhyItMatters />
          <Vision />
          <WhyPartner />
          <WhoShouldApply />
          <Process />
          <FAQ />
          <FinalCTA />
        </main>
        <Footer />
      </WaitlistModalProvider>
    </LanguageProvider>
  );
}
