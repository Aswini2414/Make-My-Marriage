import { requireMember } from "@/lib/access";
import { handler, json, parseBody } from "@/lib/api";
import { commitImport } from "@/modules/guests/import";
import { importCommitSchema } from "@/modules/guests/schema";

// 2,000 rows of guest details come to a few hundred KB; the usual 100 KB body cap is too small.
const MAX_COMMIT_BYTES = 1_500_000;

export const POST = handler(async (req) => {
  const { membership } = await requireMember(req);
  const input = await parseBody(req, importCommitSchema, MAX_COMMIT_BYTES);
  return json(await commitImport(membership.weddingId, input));
});
