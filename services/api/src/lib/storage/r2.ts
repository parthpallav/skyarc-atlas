import {
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "@skyarc/config";
import type { StorageProvider, PresignUploadInput, HeadObjectResult } from "./types.js";

export function createR2Storage(env: Env): StorageProvider {
  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials not configured");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  const bucket = env.R2_BUCKET;

  return {
    async createPresignedUpload(input: PresignUploadInput) {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.maxBytes,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
      return { uploadUrl, expiresAt };
    },

    async putObject(input: { key: string; body: Buffer; contentType: string }) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        })
      );
    },

    async headObject(key: string): Promise<HeadObjectResult | null> {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key })
        );
        return {
          contentType: result.ContentType ?? "application/octet-stream",
          byteSize: result.ContentLength ?? 0,
          etag: result.ETag,
        };
      } catch {
        return null;
      }
    },

    async createPresignedDownload(key: string): Promise<string> {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: 3600 });
    },
  };
}
