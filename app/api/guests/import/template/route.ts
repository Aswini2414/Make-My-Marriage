import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/access";
import { handler, parseQuery } from "@/lib/api";
import { buildTemplate, TEMPLATE_TYPES } from "@/modules/guests/import-template";

const templateQuery = z.object({ format: z.enum(["csv", "xlsx"]).default("csv") });

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  const { format } = parseQuery(req, templateQuery);
  const file = await buildTemplate(membership.weddingId, format);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": TEMPLATE_TYPES[format],
      "Content-Disposition": `attachment; filename="guest-import-template.${format}"`,
      "Cache-Control": "no-store",
    },
  });
});
