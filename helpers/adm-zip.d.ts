// The part of adm-zip (which ships no types) that helpers/redact-artifacts.ts uses.
declare module 'adm-zip' {
  interface ZipEntry {
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer;
  }
  class AdmZip {
    constructor(input?: string | Buffer);
    getEntries(): ZipEntry[];
    addFile(entryName: string, content: Buffer): void;
    updateFile(entry: ZipEntry | string, content: Buffer): void;
    toBuffer(): Buffer;
    writeZip(path?: string): void;
  }
  export = AdmZip;
}
