import { createHash, randomUUID } from "node:crypto";

import { AppError } from "~/lib/errors/AppError";

/**
 * Upload policy for MVP: PDF, PNG, JPEG, and DOCX only. The allowlist drives
 * every check — executables, archives, scripts, and any other extension never
 * reach storage. Each entry declares the accepted MIME types and the leading
 * magic bytes the file content must carry (guards MIME spoofing).
 */
export const ALLOWED_FILE_TYPES = {
  pdf: { mimeTypes: ["application/pdf"], magic: "%PDF-" },
  png: { mimeTypes: ["image/png"], magic: "\x89PNG\r\n\x1a\n" },
  jpg: { mimeTypes: ["image/jpeg"], magic: "\xff\xd8\xff" },
  jpeg: { mimeTypes: ["image/jpeg"], magic: "\xff\xd8\xff" },
  docx: {
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    magic: "PK\u0003\u0004",
  },
} as const;

export type AllowedExtension = keyof typeof ALLOWED_FILE_TYPES;

export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
  size: number;
  checksum: string;
};

export type StoredObject = {
  key: string;
  size: number;
  checksum: string;
  contentType: string;
};

/**
 * Storage adapter contract. Adapters never construct paths or keys from the
 * original filename — keys are generated IDs validated by isSafeStorageKey.
 */
export interface FileStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<ReadableStream>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * Optional last-modified lookup. Local files back it with stat() mtime; S3
 * uses HeadObject LastModified. The orphan sweep uses it to enforce a grace
 * period so freshly uploaded objects are never treated as orphans.
 */
export type ModifiableStorage = FileStorage & {
  modifiedAt(key: string): Promise<Date | null>;
};

/** Storage adapters that can enumerate every stored key for orphan cleanup. */
export type ListableStorage = FileStorage & {
  listKeys(): Promise<string[]>;
};

/**
 * Storage adapters that can re-compute an object's sha256 for
 * download-time integrity verification (local driver). The S3 adapter does
 * not implement this: S3 persists checksums server-side, and relying on
 * adapter-reported hashes for user data is optional per spec.
 */
export type ChecksumStorage = FileStorage & {
  checksum(key: string): Promise<string>;
};

/**
 * Result of server-side upload validation: everything the repository row
 * needs plus the bytes ready for storage.put. `buffer` stays server-side and
 * is never exposed to the browser.
 */
export type ValidatedUpload = {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  buffer: Buffer;
};

const MAX_FILENAME_LENGTH = 255;
const MAX_KEY_LENGTH = 1024;

function toInt(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Per-file upload cap, env-configurable for tests. */
export function maxUploadBytes(): number {
  return toInt(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
}

/** Per-user storage cap, env-configurable for tests. */
export function maxStorageBytes(): number {
  return toInt(process.env.MAX_STORAGE_BYTES, 100 * 1024 * 1024);
}

/**
 * Keys are generated IDs (UUIDs). Reject anything path-like so adapters can
 * join the key onto a root safely: no separators, no traversal, no dotfiles,
 * no empty or oversized keys.
 */
export function isSafeStorageKey(key: string): boolean {
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
  if (key === "." || key === "..") return false;
  if (key.includes("/") || key.includes("\\")) return false;
  if (key.startsWith(".")) return false;
  return true;
}

/**
 * Original filenames are display metadata only and must never become paths.
 * Reject traversal, absolute components, dotfiles, control characters, and
 * absurd lengths; the extension is validated against the allowlist next.
 */
function isValidFilename(filename: string): boolean {
  if (filename.length === 0 || filename.length > MAX_FILENAME_LENGTH) {
    return false;
  }
  if (filename.includes("/") || filename.includes("\\")) return false;
  if (filename === "." || filename === "..") return false;
  if (filename.includes("..")) return false;
  if (filename.startsWith(".")) return false;
  for (let index = 0; index < filename.length; index += 1) {
    const code = filename.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

function extensionOf(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).toLowerCase();
}

function hasSignature(bytes: Uint8Array, magic: string): boolean {
  if (bytes.length < magic.length) return false;
  for (let index = 0; index < magic.length; index += 1) {
    if (bytes[index] !== magic.charCodeAt(index)) return false;
  }
  return true;
}

function uploadFieldError(message: string): AppError {
  return new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
    fieldErrors: { file: [message] },
  });
}

/**
 * Validates a client-supplied File against the upload policy: filename shape,
 * extension allowlist, declared MIME allowlist, size cap, and content
 * signature (magic bytes). A random storage key is minted only after every
 * check passes; the original filename is never used as a storage path.
 */
export async function validateUpload(file: File): Promise<ValidatedUpload> {
  const filename = file.name ?? "";
  if (!isValidFilename(filename)) {
    throw uploadFieldError("Invalid file name.");
  }

  const extension = extensionOf(filename);
  if (!extension || !(extension in ALLOWED_FILE_TYPES)) {
    throw uploadFieldError("Only PDF, PNG, JPEG, and DOCX files are allowed.");
  }
  const allowed = ALLOWED_FILE_TYPES[extension as AllowedExtension];

  const declaredType = file.type ?? "";
  if (!(allowed.mimeTypes as readonly string[]).includes(declaredType)) {
    throw uploadFieldError(
      "The file type does not match an allowed format (PDF, PNG, JPEG, DOCX).",
    );
  }

  if (file.size <= 0) {
    throw uploadFieldError("The file is empty.");
  }
  if (file.size > maxUploadBytes()) {
    throw new AppError(
      "LIMIT_EXCEEDED",
      `Files must be ${formatBytes(maxUploadBytes())} or smaller.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasSignature(bytes, allowed.magic)) {
    throw uploadFieldError("The file contents do not match its type.");
  }

  return {
    storageKey: randomUUID(),
    filename,
    mimeType: declaredType,
    sizeBytes: bytes.byteLength,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    buffer: Buffer.from(bytes),
  };
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  const digits = value >= 100 ? Math.round(value).toString() : value.toFixed(1);
  return `${digits} ${units[unit]}`;
}

let cachedStorage: Promise<FileStorage> | null = null;

/**
 * Resolves the configured storage adapter. The AWS SDK module is only loaded
 * (and imported) when STORAGE_DRIVER=s3, so local deployments never pull it
 * in. The instance is cached per process.
 */
export function resolveStorage(): Promise<FileStorage> {
  if (!cachedStorage) {
    cachedStorage = (async () => {
      const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
      if (driver === "s3") {
        const { createS3Storage } = await import("./s3-storage.server");
        return createS3Storage();
      }
      const { createLocalStorage } = await import("./local-storage.server");
      return createLocalStorage();
    })();
  }
  return cachedStorage;
}

/** Test hook: drop the cached adapter so env changes take effect. */
export function resetStorage(): void {
  cachedStorage = null;
}

/** Default orphan grace period: objects younger than this are never deleted. */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;

/**
 * Orphan detection for the cleanup worker: storage keys with no matching
 * metadata row (attachment or export). Objects land in storage before their
 * row (and the row is deleted before the object on removal), so crashed
 * uploads/deletes leave orphans. A grace period protects in-flight uploads
 * and finished export files from being swept moments after creation.
 */
export async function findOrphanObjects(
  storage: ListableStorage,
  knownKeys: string[],
  graceMs = ORPHAN_GRACE_MS,
): Promise<string[]> {
  const known = new Set(knownKeys);
  const keys = await storage.listKeys();
  const modifiable = storage as Partial<ModifiableStorage>;
  const now = Date.now();
  const orphans: string[] = [];
  for (const key of keys) {
    if (known.has(key)) continue;
    if (typeof modifiable.modifiedAt === "function") {
      const modifiedAt = await modifiable.modifiedAt(key).catch(() => null);
      if (modifiedAt && now - modifiedAt.getTime() < graceMs) continue;
    }
    orphans.push(key);
  }
  return orphans;
}
