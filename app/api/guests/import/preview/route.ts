import { requireMember } from "@/lib/access";
import { handler, json, parseUpload } from "@/lib/api";
import { previewImport } from "@/modules/guests/import";
import { MAX_IMPORT_BYTES } from "@/modules/guests/import-file";

// Checks the file and answers row by row. Nothing is saved, and the file is not kept.
export const POST = handler(async (req) => {
  const { membership } = await requireMember(req);
  const file = await parseUpload(req, "file", MAX_IMPORT_BYTES);
  return json(await previewImport(membership.weddingId, file));
});
