import { getSupabaseAdmin } from "@/lib/supabase";
import type { StorageAdapter } from "./types";
import { uploadFailureMessage } from "./upload-error";

const BUCKET = "reports";
const DEFAULT_EXPIRY_SECONDS = 604800; // 7 days

export class SupabaseStorageAdapter implements StorageAdapter {
  async upload(path: string, buffer: Buffer, contentType: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(BUCKET)
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
      .from(BUCKET)
      .createSignedUrl(path, expirySeconds ?? DEFAULT_EXPIRY_SECONDS);

    if (error || !data?.signedUrl) {
      throw new Error(`Supabase Storage signed URL failed: ${error?.message ?? "no URL returned"}`);
    }

    return data.signedUrl;
  }
}
