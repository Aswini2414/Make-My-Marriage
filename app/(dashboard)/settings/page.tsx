import type { Metadata } from "next";
import { WeddingSettings } from "@/components/settings/WeddingSettings";
import { todayIST } from "@/lib/dates";
import { pageMember } from "@/lib/page-access";

export const metadata: Metadata = { title: "Wedding details" };

export default async function SettingsPage() {
  const { member } = await pageMember();
  // The layout has already sent anyone without a wedding to onboarding.
  const { wedding, role } = member!;
  return (
    <WeddingSettings
      wedding={{
        brideName: wedding.brideName,
        groomName: wedding.groomName,
        weddingDate: wedding.weddingDate,
        slug: wedding.slug,
        rsvpCutoffDate: wedding.rsvpCutoffDate,
      }}
      isAdmin={role === "admin"}
      today={todayIST()}
    />
  );
}
