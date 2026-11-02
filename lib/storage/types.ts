export interface StoredFile {
  /** Its whole path in the store, as upload(), download() and delete() take it. */
  path: string;
  /** When it was stored; null when the store doesn't say. */
  createdAt: Date | null;
}

export interface StorageListing {
  files: StoredFile[];
  /** Whole paths of the folders directly inside. */
  folders: string[];
}

export interface StorageAdapter {
  upload(path: string, buffer: Buffer, contentType: string): Promise<void>;
  getDownloadUrl(path: string, expirySeconds?: number): Promise<string>;
  /** The file's bytes; null when there's no such file. Throws when storage can't be reached. */
  download(path: string): Promise<Buffer | null>;
  /**
   * What's directly inside a folder ("" is the top of the store); empty when
   * there's no such folder. In no particular order. With `limit`, it stops reading
   * once it has at least that many files. Throws when storage can't be reached.
   */
  list(folder: string, options?: { limit?: number }): Promise<StorageListing>;
  /** Removes these files; one already gone is no error. Throws when storage can't be reached. */
  delete(paths: string[]): Promise<void>;
}
