import { handler, json, parseBody, withSession } from "@/lib/api";
import { resetPasswordSchema } from "@/modules/auth/schema";
import { resetPassword } from "@/modules/auth/service";

export const POST = handler(async (req) => {
  const { token, password } = await parseBody(req, resetPasswordSchema);
  const result = await resetPassword(token, password);
  return withSession(json(result), result.user.id);
});
