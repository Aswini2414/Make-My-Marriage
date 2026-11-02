import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { appUrl } from "@/lib/env";
import { todayIST } from "@/lib/dates";
import { pageMember } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Create your wedding",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const { user, member } = await pageMember();
  // Someone who already has a wedding has nothing to set up.
  if (member) redirect("/dashboard");
  return (
    <OnboardingShell email={user.email}>
      <OnboardingFlow siteHost={new URL(appUrl()).host} today={todayIST()} />
    </OnboardingShell>
  );
}
