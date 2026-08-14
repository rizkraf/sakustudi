declare module "archiver" {
  import { Transform } from "node:stream";

  interface ArchiverOptions {
    zlib?: { level?: number };
  }

  interface ArchiveEntryData {
    name: string;
    type?: "file" | "directory" | "symlink";
  }

  class Archiver extends Transform {
    append(
      source: string | NodeJS.ReadableStream | Buffer,
      data?: ArchiveEntryData,
    ): this;
    finalize(): Promise<void>;
  }

  export class ZipArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }

  export class TarArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }
}
