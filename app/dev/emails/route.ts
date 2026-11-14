import { appUrl } from "@/lib/env";
import { SAMPLE_NAMES } from "@/lib/email-samples";

// Development only: a list of the sample emails. Answers 404 in production, before anything else.
export function GET() {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const base = appUrl();
  const items = SAMPLE_NAMES.map(
    (name) =>
      `<li><a href="${base}/dev/emails/${name}">${name}</a> · <a href="${base}/dev/emails/${name}?text=1">plain text</a></li>`,
  ).join("");
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:Arial,sans-serif;padding:24px"><h1>Email previews</h1><p>Sample data only. Resize the window, or use Chrome's device toolbar, to see 600px and 360px.</p><ul>${items}</ul></body>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
