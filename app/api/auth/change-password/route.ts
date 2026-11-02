import { requireUser } from "@/lib/access";
import { handler, noContent, parseBody, withSession } from "@/lib/api";
import { changePasswordSchema } from "@/modules/auth/schema";
import { changePassword } from "@/modules/auth/service";

export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const { currentPassword, newPassword } = await parseBody(req, changePasswordSchema);
  await changePassword(user.id, currentPassword, newPassword);
  // Every other session just ended. This one carries on with a new cookie.
  return withSession(noContent(), user.id);
});
