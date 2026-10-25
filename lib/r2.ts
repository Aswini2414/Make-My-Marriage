import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Env } from "@/lib/env";

// Cloudflare R2 through its S3-compatible API. The bucket is private: every upload and
// view goes through a short-lived signed URL. Keys always start with weddings/<weddingId>/.

export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
export const VIEW_URL_TTL_SECONDS = 60 * 60;

let client: S3Client | undefined;

function r2() {
  if (client) return client;
  const env = r2Env();
  client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    // Newer AWS SDK versions add CRC32 checksum headers to every request by default.
    // R2 rejects these on presigned PUT uploads, so only send checksums when an
    // operation strictly requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

const bucket = () => r2Env().R2_BUCKET;

/** A URL the browser can PUT the file to, with the same Content-Type. */
export function signedUploadUrl(key: string, contentType: string) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    },
  );
}

/** A URL for viewing a private object, valid for 1 hour. */
export function signedViewUrl(key: string) {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: VIEW_URL_TTL_SECONDS,
  });
}

/** The object's size in bytes, or null if it doesn't exist. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return head.ContentLength ?? 0;
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
      return null;
    throw err;
  }
}

/** Deletes one object. */
export function deleteObject(key: string) {
  return deleteKeys([key]);
}

/** Deletes every object under a prefix, such as weddings/<weddingId>/. */
export async function deletePrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await r2().send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : []));
    if (keys.length > 0) {
      await deleteKeys(keys);
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

async function deleteKeys(keys: string[]) {
  await r2().send(
    new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  );
}
