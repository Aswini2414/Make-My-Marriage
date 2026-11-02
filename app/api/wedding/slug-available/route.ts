import { requireMember } from "@/lib/access";
import { handler, json, parseQuery } from "@/lib/api";
import { slugAvailableQuery } from "@/modules/weddings/schema";
import { checkSlug } from "@/modules/weddings/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  const { slug } = parseQuery(req, slugAvailableQuery);
  return json(await checkSlug(membership.weddingId, slug));
});
