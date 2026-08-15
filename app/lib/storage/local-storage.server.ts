import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";

import { AppError } from "~/lib/errors/AppError";

import {
  isSafeStorageKey,
  type FileStorage,
  type PutObjectInput,
  type StoredObject,
} from "./storage";

/**
 * Storage root for the local adapter, resolved against the process working
 * directory. Defaults to ./storage — outside the public web root (public/
 * and build/) — and is configurable via STORAGE_LOCAL_ROOT.
 */
export function localStorageRoot(): string {
  return resolve(process.env.STORAGE_LOCAL_ROOT ?? "./storage");
}

function isNoSuchFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "ENOENT"
  );
}

/**
 * Private local storage: objects live under STORAGE_LOCAL_ROOT on disk with
 * restrictive permissions. Paths are built only from validated storage keys
 * (generated IDs), never from original filenames, and the root is never
 * served by the web server.
 */
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string = localStorageRoot()) {
    this.root = root;
  }

  private pathFor(key: string): string {
    if (!isSafeStorageKey(key)) {
      throw new AppError("FORBIDDEN", "Invalid storage key.");
    }
    return join(this.root, key);
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    await this.ensureDir();
    // 'wx' fails if the key already exists: keys are UUIDs, so a collision
    // indicates something is wrong rather than a benign overwrite.
    await writeFile(this.pathFor(input.key), input.body, {
      mode: 0o600,
      flag: "wx",
    });
    return {
      key: input.key,
      size: input.size,
      checksum: input.checksum,
      contentType: input.contentType,
    };
  }

  async get(key: string): Promise<ReadableStream> {
    const target = this.pathFor(key);
    // stat() first so a missing object fails fast with a thrown ENOENT the
    // caller can map to a clean 404 instead of a mid-stream error.
    await stat(target);
    return Readable.toWeb(createReadStream(target)) as ReadableStream;
  }

  async delete(key: string): Promise<void> {
    const target = this.pathFor(key);
    try {
      await unlink(target);
    } catch (error) {
      // Already absent: deletion is idempotent.
      if (isNoSuchFile(error)) return;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch (error) {
      if (isNoSuchFile(error)) return false;
      throw error;
    }
  }

  /**
   * sha256 (hex) of the stored object, streamed in constant memory.
   * Download-time integrity verification compares this against the
   * checksum persisted in the attachment metadata row. Missing files
   * reject with ENOENT, matching `get` semantics.
   */
  async checksum(key: string): Promise<string> {
    const target = this.pathFor(key);
    const hash = createHash("sha256");
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const stream = createReadStream(target);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", rejectPromise);
      stream.on("end", () => resolvePromise());
    });
    return hash.digest("hex");
  }

  async listKeys(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.root);
    } catch (error) {
      if (isNoSuchFile(error)) return [];
      throw error;
    }
    const keys: string[] = [];
    for (const entry of entries) {
      const info = await stat(join(this.root, entry));
      if (info.isFile()) keys.push(entry);
    }
    return keys;
  }

  /** mtime of a stored object (null when missing) for orphan grace checks. */
  async modifiedAt(key: string): Promise<Date | null> {
    try {
      const info = await stat(this.pathFor(key));
      return info.mtime;
    } catch (error) {
      if (isNoSuchFile(error)) return null;
      throw error;
    }
  }
}

export function createLocalStorage(): FileStorage {
  return new LocalFileStorage();
}
