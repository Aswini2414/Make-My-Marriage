import type { Metadata } from "next";
import { ImportWizard } from "@/components/guests/import/ImportWizard";
import { pageMember } from "@/lib/page-access";
import { listEvents } from "@/modules/events/service";

export const metadata: Metadata = { title: "Import guests" };

export default async function ImportGuestsPage() {
  const { member } = await pageMember();
  // The layout has already sent anyone without a wedding to onboarding.
  const events = await listEvents(member!.wedding.id);
  return <ImportWizard exampleEvents={events.slice(0, 2).map((e) => e.name)} />;
}
