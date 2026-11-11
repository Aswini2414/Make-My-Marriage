import { requireMember } from "@/lib/access";
import { handler, json, parseBody, parseQuery } from "@/lib/api";
import { createGuestSchema, listGuestsQuery } from "@/modules/guests/schema";
import { createGuest, listGuests } from "@/modules/guests/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  return json(await listGuests(membership.weddingId, parseQuery(req, listGuestsQuery)));
});

// A duplicate email or phone is a warning, not an error: nothing is saved and the answer is 200
// with `{ saved: false, duplicates }`. The page asks, then sends again with confirmDuplicates.
export const POST = handler(async (req) => {
  const { membership } = await requireMember(req);
  const input = await parseBody(req, createGuestSchema);
  const result = await createGuest(membership.weddingId, input);
  return "duplicates" in result ? json(result) : json(result, 201);
});
