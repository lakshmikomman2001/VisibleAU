import { serviceDb } from "@/db/client";
import { dataResidencyLog } from "@/db/schema";

const RESIDENCY_MAP = [
  {
    dataType: "audit_data",
    storageRegion: "ap-southeast-2",
    provider: "supabase",
    retentionPeriod: "12 months",
    encryptionStatus: "AES-256 at rest, TLS 1.3 in transit",
  },
  {
    dataType: "evidence_snapshots",
    storageRegion: "ap-southeast-2",
    provider: "supabase",
    retentionPeriod: "12 months",
    encryptionStatus: "AES-256 at rest, TLS 1.3 in transit",
  },
  {
    dataType: "pdf_reports",
    storageRegion: "ap-southeast-2",
    provider: "supabase",
    retentionPeriod: "12 months",
    encryptionStatus: "AES-256 at rest, TLS 1.3 in transit",
  },
  {
    dataType: "llm_cache",
    storageRegion: "ap-southeast-2",
    provider: "supabase",
    retentionPeriod: "30 days",
    encryptionStatus: "AES-256 at rest, TLS 1.3 in transit",
  },
  {
    dataType: "crawler_logs",
    storageRegion: "ap-southeast-2",
    provider: "supabase",
    retentionPeriod: "90 days",
    encryptionStatus: "AES-256 at rest, TLS 1.3 in transit",
  },
  {
    dataType: "ai_bot_registry",
    storageRegion: "ap-southeast-2",
    provider: "supabase",
    retentionPeriod: "indefinite",
    encryptionStatus: "AES-256 at rest, TLS 1.3 in transit",
  },
  {
    dataType: "ai_bot_ip_ranges",
    storageRegion: "ap-southeast-2",
    provider: "supabase",
    retentionPeriod: "indefinite",
    encryptionStatus: "AES-256 at rest, TLS 1.3 in transit",
  },
  {
    dataType: "ai_referral_hits",
    storageRegion: "ap-southeast-2",
    provider: "supabase",
    retentionPeriod: "90 days",
    encryptionStatus: "AES-256 at rest, TLS 1.3 in transit",
  },
  {
    dataType: "llm_processing_openai",
    storageRegion: "us",
    provider: "openai",
    retentionPeriod: "0 days",
    encryptionStatus: "TLS 1.3 in transit, no persistent storage",
  },
  {
    dataType: "llm_processing_anthropic",
    storageRegion: "us",
    provider: "anthropic",
    retentionPeriod: "0 days",
    encryptionStatus: "TLS 1.3 in transit, no persistent storage",
  },
] as const;

export async function recordDataResidency(organizationId: string): Promise<void> {
  for (const entry of RESIDENCY_MAP) {
    await serviceDb
      .insert(dataResidencyLog)
      .values({
        organizationId,
        dataType: entry.dataType,
        storageRegion: entry.storageRegion,
        provider: entry.provider,
        retentionPeriod: entry.retentionPeriod,
        encryptionStatus: entry.encryptionStatus,
      })
      .onConflictDoUpdate({
        target: [dataResidencyLog.organizationId, dataResidencyLog.dataType],
        set: {
          storageRegion: entry.storageRegion,
          provider: entry.provider,
          retentionPeriod: entry.retentionPeriod,
          encryptionStatus: entry.encryptionStatus,
          recordedAt: new Date(),
        },
      });
  }
}
