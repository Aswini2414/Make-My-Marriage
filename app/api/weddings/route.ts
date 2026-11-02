import { requireUser } from "@/lib/access";
import { handler, json, parseBody } from "@/lib/api";
import { createWeddingSchema } from "@/modules/weddings/schema";
import { createWedding } from "@/modules/weddings/service";

export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const input = await parseBody(req, createWeddingSchema);
  return json({ wedding: await createWedding(user.id, input) }, 201);
});
