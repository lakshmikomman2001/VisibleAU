import { getSupabaseAdmin } from "@/lib/supabase";
import { redactSecrets } from "./redact";
import type { StorageAdapter, StorageListing, StoredFile } from "./types";
import { uploadFailureMessage } from "./upload-error";

const DEFAULT_EXPIRY_SECONDS = 604800; // 7 days
const LIST_PAGE = 100;
const DELETE_BATCH = 100;

export class SupabaseStorageAdapter implements StorageAdapter {
  /** "reports" accepts only PDFs; "logos" only PNG and JPEG (lib/storage/index.ts). */
  constructor(private readonly bucket: "reports" | "logos" = "reports") {}

  async upload(path: string, buffer: Buffer, contentType: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      // URGENT PDF reports (1 Nov), part 0: with the real reason (err.cause)
      // and the body's size and type -- the outer message alone was just
      // "fetch failed". No URL, key or token (lib/storage/redact.ts).
      throw new Error(uploadFailureMessage(error, buffer));
    }
  }

  async getDownloadUrl(path: string, expirySeconds?: number): Promise<string> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(path, expirySeconds ?? DEFAULT_EXPIRY_SECONDS);

    if (error || !data?.signedUrl) {
      throw new Error(`Supabase Storage signed URL failed: ${error?.message ?? "no URL returned"}`);
    }

    return data.signedUrl;
  }

  async download(path: string): Promise<Buffer | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(this.bucket).download(path);
    if (error) {
      // storage-js reports a missing object as a 400/404 StorageApiError.
      const status = (error as { status?: unknown; statusCode?: unknown }).status;
      if (status === 400 || status === 404 || /not found/i.test(error.message)) return null;
      throw new Error(`Supabase Storage download failed: ${redactSecrets(error.message)}`);
    }
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  }

  async list(folder: string, options?: { limit?: number }): Promise<StorageListing> {
    const supabase = getSupabaseAdmin();
    const limit = options?.limit ?? Number.POSITIVE_INFINITY;
    const files: StoredFile[] = [];
    const folders: string[] = [];
    const inFolder = (name: string) => (folder ? `${folder}/${name}` : name);
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await supabase.storage
        .from(this.bucket)
        .list(folder, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`Supabase Storage list failed: ${redactSecrets(error.message)}`);
      for (const entry of data) {
        // storage-js: a folder is the entry with no id.
        if (entry.id === null) folders.push(inFolder(entry.name));
        else {
          files.push({
            path: inFolder(entry.name),
            createdAt: entry.created_at ? new Date(entry.created_at) : null,
          });
        }
      }
      if (data.length < LIST_PAGE || files.length >= limit) return { files, folders };
    }
  }

  async delete(paths: string[]): Promise<void> {
    const supabase = getSupabaseAdmin();
    for (let i = 0; i < paths.length; i += DELETE_BATCH) {
      const { error } = await supabase.storage
        .from(this.bucket)
        .remove(paths.slice(i, i + DELETE_BATCH));
      if (error) throw new Error(`Supabase Storage delete failed: ${redactSecrets(error.message)}`);
    }
  }
}
