import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { AppError } from "~/lib/errors/AppError";

import { isSafeStorageKey, type FileStorage, type PutObjectInput, type StoredObject } from "./storage";

function envOr(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}

/**
 * Optional S3-compatible adapter (STORAGE_DRIVER=s3). The bucket is expected
 * to be private: browsers never receive storage credentials, downloads flow
 * through the ownership-checked app handler which streams the object, and
 * every key is a generated ID. Works against AWS S3 and S3-compatible stores
 * (MinIO via S3_ENDPOINT + S3_FORCE_PATH_STYLE=true).
 */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const bucket = envOr("S3_BUCKET");
    if (!bucket) {
      throw new Error("S3_BUCKET must be set when STORAGE_DRIVER=s3.");
    }
    const accessKeyId = envOr("S3_ACCESS_KEY_ID");
    const secretAccessKey = envOr("S3_SECRET_ACCESS_KEY");
    this.bucket = bucket;
    this.client = new S3Client({
      region: envOr("S3_REGION") ?? "us-east-1",
      endpoint: envOr("S3_ENDPOINT"),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      // Fall back to the SDK's default credential chain when app env vars
      // are absent (IAM roles, ~/.aws/credentials, etc.).
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ChecksumSHA256: createHash("sha256").update(input.body).digest("base64"),
      }),
    );
    return {
      key: input.key,
      size: input.size,
      checksum: input.checksum,
      contentType: input.contentType,
    };
  }

  async get(key: string): Promise<ReadableStream> {
    if (!isSafeStorageKey(key)) {
      throw new AppError("FORBIDDEN", "Invalid storage key.");
    }
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new AppError("NOT_FOUND", "Object not found.");
    }
    return response.Body.transformToWebStream() as ReadableStream;
  }

  async delete(key: string): Promise<void> {
    // S3 object deletion is naturally idempotent: deleting a missing key is
    // a successful no-op.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async listKeys(): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: token,
        }),
      );
      for (const object of response.Contents ?? []) {
        if (object.Key) keys.push(object.Key);
      }
      token = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
}

export function createS3Storage(): FileStorage {
  return new S3FileStorage();
}
