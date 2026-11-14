import { appUrl } from "@/lib/env";
import { sampleEmails } from "@/lib/email-samples";

// Development only: one sample email as the page the inbox would show. `?text=1` shows the
// plain-text part. Answers 404 in production, before anything else is read or rendered.
export async function GET(req: Request, ctx: RouteContext<"/dev/emails/[name]">) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const { name } = await ctx.params;
  const samples = sampleEmails(appUrl());
  const email = Object.hasOwn(samples, name) ? samples[name] : undefined;
  if (!email) return new Response(null, { status: 404 });
  const text = new URL(req.url).searchParams.get("text") === "1";
  return new Response(text ? email.text : email.html, {
    headers: {
      "Content-Type": text ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
