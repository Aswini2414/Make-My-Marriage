import { requireUser } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { authResult } from "@/modules/auth/service";

export const GET = handler(async (req) => {
  const { user } = await requireUser(req);
  return json(await authResult(user.id));
});
