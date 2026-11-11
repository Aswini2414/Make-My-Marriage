import type { Metadata } from "next";
import { GuestsView } from "@/components/guests/GuestsView";
import { pageMember } from "@/lib/page-access";
import { listEvents } from "@/modules/events/service";
import { PAGE_SIZE, parseGuestFilters, walkToPage } from "@/modules/guests/format";
import { listGuestsQuery } from "@/modules/guests/schema";
import { guestSummary, listGuests, listHouseholds } from "@/modules/guests/service";

export const metadata: Metadata = { title: "Guests" };

export default async function GuestsPage({ searchParams }: PageProps<"/guests">) {
  const { member } = await pageMember();
  // The layout has already sent anyone without a wedding to onboarding.
  const { wedding } = member!;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  const parsed = parseGuestFilters(params);

  const [events, summary, households] = await Promise.all([
    listEvents(wedding.id),
    guestSummary(wedding.id),
    listHouseholds(wedding.id),
  ]);
  // A link to an event that has since been deleted shows the whole list, not an empty one.
  const asked =
    parsed.eventId && !events.some((e) => e.id === parsed.eventId)
      ? { ...parsed, eventId: undefined }
      : parsed;

  const queryFor = (cursor?: string) =>
    listGuestsQuery.parse({
      q: asked.q,
      eventId: asked.eventId,
      household: asked.household,
      limit: PAGE_SIZE,
      cursor,
    });
  // Pages are keyset-based, so page N is reached by following the cursors, here in-process. The
  // pages passed over are fetched without their totals; only the page shown gets the full answer.
  const walked =
    asked.page === 1
      ? undefined
      : await walkToPage(
          (cursor) => listGuests(wedding.id, queryFor(cursor), { light: true }),
          asked.page,
        );
  const page = walked?.page ?? 1;
  const cursors = walked?.cursors ?? [undefined];
  const list = await listGuests(wedding.id, queryFor(cursors[page - 1]));
  if (list.nextCursor) cursors[page] = list.nextCursor;

  return (
    <GuestsView
      initial={{ list, cursors, filters: { ...asked, page } }}
      summary={summary}
      events={events.map((e) => ({ id: e.id, name: e.name }))}
      households={households}
    />
  );
}
