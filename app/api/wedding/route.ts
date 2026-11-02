import { requireMember } from "@/lib/access";
import { handler, json, noContent, parseBody } from "@/lib/api";
import { deleteWeddingSchema, updateWeddingSchema } from "@/modules/weddings/schema";
import { deleteWedding, getWedding, updateWedding } from "@/modules/weddings/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  return json({ wedding: await getWedding(membership.weddingId) });
});

export const PATCH = handler(async (req) => {
  const { membership } = await requireMember(req);
  const input = await parseBody(req, updateWeddingSchema);
  return json({ wedding: await updateWedding(membership.weddingId, input) });
});

// Admins only, and only after typing the website address.
export const DELETE = handler(async (req) => {
  const { membership } = await requireMember(req, "admin");
  const { confirmSlug } = await parseBody(req, deleteWeddingSchema);
  await deleteWedding(membership.weddingId, confirmSlug);
  return noContent();
});
