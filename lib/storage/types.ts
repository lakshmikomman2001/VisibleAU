export interface StorageAdapter {
  upload(path: string, buffer: Buffer, contentType: string): Promise<void>;
  getDownloadUrl(path: string, expirySeconds?: number): Promise<string>;
}
