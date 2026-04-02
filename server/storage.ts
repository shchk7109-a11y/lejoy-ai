// R2 Object Storage via AWS S3 SDK (Cloudflare R2 is S3-compatible)
// Replaces the previous Manus Forge storage proxy

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string; // e.g. custom domain or r2.dev public URL
};

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() || "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || "";
  const bucketName = process.env.R2_BUCKET_NAME?.trim() || "";
  const publicUrl = process.env.R2_PUBLIC_URL?.trim() || "";

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      "R2 storage credentials missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME"
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

function getS3Client(): { client: S3Client; config: R2Config } {
  const config = getR2Config();
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedConfig = config;
  }
  return { client: cachedClient, config: cachedConfig! };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

async function buildObjectUrl(client: S3Client, bucketName: string, key: string, publicUrl: string): Promise<string> {
  // If a public URL base is configured (custom domain or r2.dev), use it directly
  if (publicUrl) {
    const base = publicUrl.replace(/\/+$/, "");
    return `${base}/${key}`;
  }

  // Otherwise, generate a presigned URL (7 days max for R2)
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  }), { expiresIn: 7 * 24 * 60 * 60 });
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { client, config } = getS3Client();
  const key = normalizeKey(relKey);

  await client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: typeof data === "string" ? Buffer.from(data) : data,
    ContentType: contentType,
  }));

  const url = await buildObjectUrl(client, config.bucketName, key, config.publicUrl);
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const { client, config } = getS3Client();
  const key = normalizeKey(relKey);
  const url = await buildObjectUrl(client, config.bucketName, key, config.publicUrl);
  return { key, url };
}
