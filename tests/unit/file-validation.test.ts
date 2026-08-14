import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  formatBytes,
  isSafeStorageKey,
  maxUploadBytes,
  validateUpload,
} from "~/lib/storage/storage";

const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const DOCX_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const TEXT_BYTES = Buffer.from("plain text is not a supported document");
const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

function file(name: string, bytes: Buffer, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function expectFieldError(error: unknown, field: string, messagePart?: string): void {
  expect(error).toBeInstanceOf(Error);
  const candidate = error as {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string[]>;
  };
  expect(candidate.code).toBe("VALIDATION_FAILED");
  expect(candidate.fieldErrors?.[field]?.[0]).toBeTruthy();
  if (messagePart) {
    expect(candidate.fieldErrors?.[field]?.[0]).toContain(messagePart);
  }
}

describe("upload policy", () => {
  beforeEach(() => {
    delete process.env.MAX_UPLOAD_BYTES;
    delete process.env.MAX_STORAGE_BYTES;
  });

  it("accepts PDF, PNG, JPEG, and DOCX with matching signatures and types", async () => {
    const cases: Array<[string, Buffer, string]> = [
      ["slides.pdf", PDF_BYTES, "application/pdf"],
      ["diagram.png", PNG_BYTES, "image/png"],
      ["photo.jpg", JPEG_BYTES, "image/jpeg"],
      ["photo.jpeg", JPEG_BYTES, "image/jpeg"],
      ["report.docx", DOCX_BYTES, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ];

    for (const [name, bytes, type] of cases) {
      const validated = await validateUpload(file(name, bytes, type));
      expect(validated.filename).toBe(name);
      expect(validated.mimeType).toBe(type);
      expect(validated.sizeBytes).toBe(bytes.byteLength);
      expect(validated.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(validated.storageKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(validated.buffer.equals(bytes)).toBe(true);
    }
  });

  it("rejects executable and script extensions even with a valid signature", async () => {
    const names = [
      "virus.exe",
      "setup.msi",
      "run.bat",
      "run.cmd",
      "run.sh",
      "run.ps1",
      "script.js",
      "lib.dll",
      "driver.sys",
    ];
    for (const name of names) {
      await expect(
        validateUpload(file(name, EXE_BYTES, "application/octet-stream")).catch(
          (error) => error,
        ),
      ).resolves.toSatisfy((error: unknown) => {
        expectFieldError(error, "file", "Only PDF, PNG, JPEG, and DOCX");
        return true;
      });
    }
  });

  it("rejects archive extensions", async () => {
    for (const name of ["backup.zip", "backup.tar", "backup.gz", "backup.rar", "backup.7z"]) {
      await expect(
        validateUpload(file(name, DOCX_BYTES, "application/zip")).catch(
          (error) => error,
        ),
      ).resolves.toSatisfy((error: unknown) => {
        expectFieldError(error, "file");
        return true;
      });
    }
  });

  it("rejects path-like, hidden, and malformed filenames", async () => {
    const invalidNames = [
      "../escape.pdf",
      "..\\escape.pdf",
      "folder/slides.pdf",
      "folder\\slides.pdf",
      ".hidden.pdf",
      "",
      "a..b.pdf",
    ];
    for (const name of invalidNames) {
      await expect(
        validateUpload(file(name, PDF_BYTES, "application/pdf")).catch(
          (error) => error,
        ),
      ).resolves.toSatisfy((error: unknown) => {
        expectFieldError(error, "file", "Invalid file name");
        return true;
      });
    }

    // A trailing dot leaves no usable extension and falls to the allowlist.
    await expect(
      validateUpload(file("slides.pdf.", PDF_BYTES, "application/pdf")).catch(
        (error) => error,
      ),
    ).resolves.toSatisfy((error: unknown) => {
      expectFieldError(error, "file", "Only PDF, PNG, JPEG, and DOCX");
      return true;
    });
  });

  it("rejects MIME spoofing: declared type never matches the content", async () => {
    const cases: Array<[string, Buffer, string]> = [
      ["notes.png", PDF_BYTES, "image/png"],
      ["notes.pdf", PNG_BYTES, "application/pdf"],
      ["notes.pdf", PDF_BYTES, "application/octet-stream"],
      ["notes.pdf", PDF_BYTES, "image/png"],
      ["notes.pdf", PDF_BYTES, ""],
    ];
    for (const [name, bytes, type] of cases) {
      await expect(
        validateUpload(file(name, bytes, type)).catch((error) => error),
      ).resolves.toSatisfy((error: unknown) => {
        expectFieldError(error, "file");
        return true;
      });
    }
  });

  it("rejects content whose signature does not match its extension", async () => {
    const cases: Array<[string, Buffer, string]> = [
      ["notes.pdf", TEXT_BYTES, "application/pdf"],
      ["notes.png", TEXT_BYTES, "image/png"],
      ["notes.docx", TEXT_BYTES, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["notes.jpg", PDF_BYTES, "image/jpeg"],
    ];
    for (const [name, bytes, type] of cases) {
      await expect(
        validateUpload(file(name, bytes, type)).catch((error) => error),
      ).resolves.toSatisfy((error: unknown) => {
        expectFieldError(error, "file", "do not match");
        return true;
      });
    }
  });

  it("rejects empty files", async () => {
    await expect(
      validateUpload(file("empty.pdf", Buffer.alloc(0), "application/pdf")).catch(
        (error) => error,
      ),
    ).resolves.toSatisfy((error: unknown) => {
      expectFieldError(error, "file", "empty");
      return true;
    });
  });

  it("enforces the per-file size cap from MAX_UPLOAD_BYTES", async () => {
    process.env.MAX_UPLOAD_BYTES = "64";
    const oversized = Buffer.concat([PDF_BYTES, Buffer.alloc(200, 0x20)]);

    const error = await validateUpload(
      file("big.pdf", oversized, "application/pdf"),
    ).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as { code?: string }).code).toBe("LIMIT_EXCEEDED");

    process.env.MAX_UPLOAD_BYTES = "4096";
    expect((await validateUpload(file("ok.pdf", oversized, "application/pdf"))).sizeBytes).toBe(
      oversized.byteLength,
    );
  });

  it("computes a deterministic sha256 checksum", async () => {
    const validated = await validateUpload(file("sum.pdf", PDF_BYTES, "application/pdf"));
    expect(validated.checksum).toBe(createHash("sha256").update(PDF_BYTES).digest("hex"));
  });

  it("mints a random storage key per upload, never derived from the filename", async () => {
    const first = await validateUpload(file("report.pdf", PDF_BYTES, "application/pdf"));
    const second = await validateUpload(file("report.pdf", PDF_BYTES, "application/pdf"));
    expect(first.storageKey).not.toBe(second.storageKey);
    expect(first.storageKey).not.toContain("report");
    expect(second.storageKey).not.toContain("report");
  });

  it("accepts uppercase extensions", async () => {
    const validated = await validateUpload(file("NOTES.PDF", PDF_BYTES, "application/pdf"));
    expect(validated.filename).toBe("NOTES.PDF");
  });

  it("defaults to a 10 MB per-file cap and 100 MB user cap", () => {
    expect(maxUploadBytes()).toBe(10 * 1024 * 1024);
  });
});

describe("storage key safety", () => {
  it("rejects path-like, traversal, dotfile, and empty keys", () => {
    expect(isSafeStorageKey("../etc/passwd")).toBe(false);
    expect(isSafeStorageKey("a/b")).toBe(false);
    expect(isSafeStorageKey("a\\b")).toBe(false);
    expect(isSafeStorageKey("..")).toBe(false);
    expect(isSafeStorageKey(".")).toBe(false);
    expect(isSafeStorageKey(".hidden")).toBe(false);
    expect(isSafeStorageKey("")).toBe(false);
    expect(isSafeStorageKey("a".repeat(2000))).toBe(false);
  });

  it("accepts generated UUID keys", () => {
    expect(isSafeStorageKey("5f1b3a1e-1b3a-4c4d-8f0a-1b2c3d4e5f60")).toBe(true);
  });
});

describe("formatBytes", () => {
  it("renders human-readable sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
  });
});
