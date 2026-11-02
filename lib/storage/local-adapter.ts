import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StorageAdapter, StorageListing, StoredFile } from "./types";

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

  async download(path: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.base, path));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async list(folder: string): Promise<StorageListing> {
    const fullPath = join(this.base, folder);
    let entries: Dirent[];
    try {
      entries = await readdir(fullPath, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { files: [], folders: [] };
      throw err;
    }
    const inFolder = (name: string) => (folder ? `${folder}/${name}` : name);
    const folders = entries.filter((e) => e.isDirectory()).map((e) => inFolder(e.name));
    const files: StoredFile[] = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map(async (e) => ({
          path: inFolder(e.name),
          createdAt: (await stat(join(fullPath, e.name))).mtime,
        })),
    );
    return { files, folders };
  }

  async delete(paths: string[]): Promise<void> {
    await Promise.all(paths.map((path) => rm(join(this.base, path), { force: true })));
  }
}
