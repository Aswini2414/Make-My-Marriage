import type { Metadata } from "next";
import { EventsView } from "@/components/events/EventsView";
import { pageMember } from "@/lib/page-access";
import { getEventTypes, listEvents } from "@/modules/events/service";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage() {
  const { member } = await pageMember();
  // The layout has already sent anyone without a wedding to onboarding.
  const weddingId = member!.wedding.id;
  const [events, types] = await Promise.all([listEvents(weddingId), getEventTypes(weddingId)]);
  return <EventsView events={events} customTypes={types.custom} />;
}
