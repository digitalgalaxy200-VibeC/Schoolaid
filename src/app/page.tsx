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

export default function Home() {
  return (
    <>
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
    </>
  );
}
