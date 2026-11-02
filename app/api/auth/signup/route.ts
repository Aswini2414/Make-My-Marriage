import { clientIp, handler, json, parseBody, withSession } from "@/lib/api";
import { signupSchema } from "@/modules/auth/schema";
import { signup } from "@/modules/auth/service";

export const POST = handler(async (req) => {
  const input = await parseBody(req, signupSchema);
  const result = await signup(input, clientIp(req));
  return withSession(json(result, 201), result.user.id);
});
