// Human-readable region labels shown on the Data Residency settings page.
// Overridable via env (NEON_REGION / SUPABASE_STORAGE_REGION) if either
// service is ever migrated to a different region; .env.example is
// gitignored in this repo (blanket `.env*` pattern) so the defaults below,
// not a template file, are the documentation of record.
const NEON_REGION = process.env.NEON_REGION ?? "AWS ap-southeast-2 (Sydney)";
const SUPABASE_STORAGE_REGION = process.env.SUPABASE_STORAGE_REGION ?? "AWS ap-southeast-2 (Sydney)";

const DEFAULT_ENCRYPTION = "AES-256 at rest, TLS 1.3 in transit";
const LLM_ENCRYPTION = "TLS 1.3 in transit";
const LLM_RETENTION = "per provider API data-usage terms";

export interface ResidencyConfigEntry {
  dataType: string;
  provider: string;
  storageRegion: string;
  retentionPeriod: string;
  encryptionStatus: string;
}

export const RESIDENCY_CONFIG: readonly ResidencyConfigEntry[] = [
  {
    dataType: "database",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: "duration of account",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "audit_data",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: "12 months",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "evidence_snapshots",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: "12 months",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "llm_cache",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: "30 days",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "crawler_logs",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: "90 days",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "ai_bot_registry",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: "indefinite",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "ai_bot_ip_ranges",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: "indefinite",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "ai_referral_hits",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: "90 days",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "pdf_reports",
    provider: "supabase",
    storageRegion: SUPABASE_STORAGE_REGION,
    retentionPeriod: "12 months",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "llm_processing_openai",
    provider: "openai",
    storageRegion: "US",
    retentionPeriod: LLM_RETENTION,
    encryptionStatus: LLM_ENCRYPTION,
  },
  {
    dataType: "llm_processing_anthropic",
    provider: "anthropic",
    storageRegion: "US",
    retentionPeriod: LLM_RETENTION,
    encryptionStatus: LLM_ENCRYPTION,
  },
  {
    dataType: "llm_processing_google",
    provider: "google",
    storageRegion: "US",
    retentionPeriod: LLM_RETENTION,
    encryptionStatus: LLM_ENCRYPTION,
  },
  {
    dataType: "llm_processing_perplexity",
    provider: "perplexity",
    storageRegion: "US",
    retentionPeriod: LLM_RETENTION,
    encryptionStatus: LLM_ENCRYPTION,
  },
] as const;
