import type { Metadata } from "next";
import { Faq } from "@/components/landing/Faq";
import { CalmBand, Features } from "@/components/landing/Features";
import { FinalCta } from "@/components/landing/FinalCta";
import { LandingFooter } from "@/components/landing/Footer";
import { ForGuests } from "@/components/landing/ForGuests";
import { LandingHeader } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { PlanTogether } from "@/components/landing/PlanTogether";
import { Privacy } from "@/components/landing/Privacy";

// Shown only to visitors who aren't logged in. proxy.ts sends members to /dashboard.

// Static, but rebuilt once a day so the footer's copyright year rolls over on its own.
export const revalidate = 86400;

const title = "Make My Marriage — Your wedding, beautifully in order";
const description =
  "Plan your whole Indian wedding in one private workspace: events, guests, RSVPs, expenses, vendors and photos. Free to use.";

// The preview image comes from opengraph-image.tsx in this folder.
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Make My Marriage",
    locale: "en_IN",
    title,
    description,
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function LandingPage() {
  return (
    <>
      <LandingHeader />
      <main className="flex-1">
        <Hero />
        <CalmBand />
        <Features />
        <ForGuests />
        <HowItWorks />
        <PlanTogether />
        <Privacy />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
