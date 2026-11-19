import { createHash, randomUUID } from "node:crypto";

/**
 * 20 Nov (Sri's decision, part 5): an uploaded server log never travels through Inngest. The upload route stores the
 * file in the private "crawler-logs" bucket (lib/storage) and the event carries only a reference to it -- the
 * workspace, the brand, where it is, its size and its SHA-256 -- never a line of it. inngest/functions/
 * parse-crawler-log.ts reads it, keeps the AI crawlers' visits only, and deletes it (and deletes it when parsing fails
 * for the last time). Before this, the whole file -- every visitor's IP address included -- went base64 into the
 * event, which Inngest keeps for its plan's history period.
 */

/** The bucket (scripts/ensure-crawler-log-storage-bucket.ts creates it: private, up to 50 MB). */
export const CRAWLER_LOG_BUCKET = "crawler-logs" as const;

/** The upload's limit, kept from the route (50 MB). Vercel's own request-body limit may refuse a large file first. */
export const MAX_CRAWLER_LOG_BYTES = 50 * 1024 * 1024;

/** What the upload event carries, and nothing more. */
export interface CrawlerLogUploadedEvent {
  brandId: string;
  organizationId: string;
  /** The brand's domain, to build each visit's URL. */
  domain: string;
  /** The uploaded file's own name, for its format (.log, .csv, .gz). */
  filename: string;
  /** Where the file is in the bucket: always under the workspace's and the brand's folder (crawlerLogPath). */
  storagePath: string;
  sizeBytes: number;
  sha256: string;
  uploadedBy: string;
}

/**
 * An upload sent by the code before this change: the file itself, base64. The function still parses one, so an upload
 * in flight across the deploy isn't lost.
 */
export interface LegacyCrawlerLogUploadedEvent {
  brandId: string;
  organizationId: string;
  domain: string;
  filename: string;
  contentBase64: string;
}

const EXTENSIONS = [".log", ".csv", ".gz"] as const;

/** The file's extension when it's one the upload accepts, else null. */
export function crawlerLogExtension(filename: string): (typeof EXTENSIONS)[number] | null {
  const lower = filename.toLowerCase();
  return EXTENSIONS.find((ext) => lower.endsWith(ext)) ?? null;
}

/** The content type it's stored with. */
export function crawlerLogContentType(filename: string): string {
  const ext = crawlerLogExtension(filename);
  return ext === ".gz" ? "application/gzip" : ext === ".csv" ? "text/csv" : "text/plain";
}

/** The folder every upload for this brand goes in. Built from the signed-in workspace and the brand, never the request. */
export function crawlerLogFolder(organizationId: string, brandId: string): string {
  return `${organizationId}/crawler-logs/${brandId}/`;
}

/** A new file's place: the brand's folder and a random name, with the upload's extension. */
export function crawlerLogPath(organizationId: string, brandId: string, filename: string): string {
  return `${crawlerLogFolder(organizationId, brandId)}${randomUUID()}${crawlerLogExtension(filename) ?? ".log"}`;
}

/**
 * Whether a path is a file in this workspace's and brand's folder -- the function's check before it reads or deletes
 * anything: a path for another workspace, or one that climbs out (".."), is refused.
 */
export function isCrawlerLogPathOf(path: string, organizationId: string, brandId: string): boolean {
  const folder = crawlerLogFolder(organizationId, brandId);
  if (!path.startsWith(folder)) return false;
  const name = path.slice(folder.length);
  return name.length > 0 && !name.includes("/") && !name.includes("\\") && !name.includes("..");
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
