import { clientIp, handler, json, parseBody } from "@/lib/api";
import { forgotPasswordSchema } from "@/modules/auth/schema";
import { forgotPassword } from "@/modules/auth/service";

export const POST = handler(async (req) => {
  const { email } = await parseBody(req, forgotPasswordSchema);
  await forgotPassword(email, clientIp(req));
  return json({ ok: true });
});
