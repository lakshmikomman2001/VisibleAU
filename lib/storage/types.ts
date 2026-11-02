export interface StorageAdapter {
  upload(path: string, buffer: Buffer, contentType: string): Promise<void>;
  getDownloadUrl(path: string, expirySeconds?: number): Promise<string>;
  /** The file's bytes; null when there's no such file. Throws when storage can't be reached. */
  download(path: string): Promise<Buffer | null>;
}
