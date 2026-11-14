import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { StorageConfig } from "./config.ts";

export interface StoredObject {
  body: Uint8Array<ArrayBuffer>;
  contentType: string | undefined;
}

/** Private object storage over the S3 API (RustFS locally, any S3-compatible service elsewhere). */
export interface ObjectStorage {
  put: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  get: (key: string) => Promise<StoredObject | undefined>;
  /** Deletes every object under `prefix`, except the keys listed in `keep`. */
  deletePrefix: (prefix: string, keep?: readonly string[]) => Promise<void>;
  /** Resolves when the bucket is reachable with the configured credentials. */
  check: () => Promise<void>;
  /** Creates the bucket when it does not exist. Returns whether it was created. */
  ensureBucket: () => Promise<boolean>;
  close: () => void;
}

export function createStorage(config: StorageConfig): ObjectStorage {
  const { bucket } = config;
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    // Self-hosted S3-compatible services address buckets by path rather than subdomain.
    forcePathStyle: config.endpoint !== undefined,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  async function listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of page.Contents ?? [])
        if (object.Key) keys.push(object.Key);
      continuationToken = page.NextContinuationToken;
    } while (continuationToken);
    return keys;
  }

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async get(key) {
      try {
        const object = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!object.Body) return undefined;
        const bytes = await object.Body.transformToByteArray();
        return { body: new Uint8Array(bytes), contentType: object.ContentType };
      } catch (error) {
        if (error instanceof NoSuchKey) return undefined;
        throw error;
      }
    },

    async deletePrefix(prefix, keep = []) {
      const keys = (await listKeys(prefix)).filter(
        (key) => !keep.includes(key),
      );
      await Promise.all(
        keys.map((key) =>
          client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
        ),
      );
    },

    async check() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },

    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        return false;
      } catch (error) {
        if (!(error instanceof NotFound)) throw error;
      }
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      return true;
    },

    close() {
      client.destroy();
    },
  };
}
