import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StorageAdapter } from "./types";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir?: string) {}

  private get base(): string {
    return this.baseDir ?? process.env.STORAGE_LOCAL_DIR ?? "./storage/reports";
  }

  async upload(path: string, buffer: Buffer, _contentType: string): Promise<void> {
    const fullPath = join(this.base, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
  }

  async getDownloadUrl(path: string): Promise<string> {
    return `/api/reports/file/${path}`;
  }
}
