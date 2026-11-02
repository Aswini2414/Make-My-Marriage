import { clientIp, handler, json, parseBody, withSession } from "@/lib/api";
import { loginSchema } from "@/modules/auth/schema";
import { login } from "@/modules/auth/service";

export const POST = handler(async (req) => {
  const { email, password } = await parseBody(req, loginSchema);
  const result = await login(email, password, clientIp(req));
  return withSession(json(result), result.user.id);
});
