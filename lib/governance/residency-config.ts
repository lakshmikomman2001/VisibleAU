// Human-readable region labels shown on the Data Residency settings page.
// Overridable via env (NEON_REGION / SUPABASE_STORAGE_REGION) if either
// service is ever migrated to a different region; .env.example is
// gitignored in this repo (blanket `.env*` pattern) so the defaults below,
// not a template file, are the documentation of record.
const NEON_REGION = process.env.NEON_REGION ?? "AWS ap-southeast-2 (Sydney)";
const SUPABASE_STORAGE_REGION =
  process.env.SUPABASE_STORAGE_REGION ?? "AWS ap-southeast-2 (Sydney)";

// Every retention period the code enforces, in one place (mock-gate and retention follow-ups, 9 Nov, parts 2 and
// 3). The jobs that delete by age read these, and every claim -- the rows below, the privacy page -- is worded
// from them. Never state a period that isn't one of these; tests/unit/governance/retention-claims.test.ts scans
// for one written anywhere else.
// The weekly job (inngest/functions/audit-data-retention.ts):
export const AUDIT_DATA_RETENTION_MONTHS = 12;
export const CRAWLER_LOG_RETENTION_DAYS = 90;
export const AI_REFERRAL_HIT_RETENTION_DAYS = 90;
// How long an answer is reused (lib/llm/cache.ts). Once expired it's never served again, and the weekly job
// deletes it.
export const ANSWER_CACHE_REUSE_HOURS = { grounded: 24, memoryOnly: 48 } as const;
// The daily sample-audit clean-up (inngest/functions/sample-audit-cleanup.ts): the public sample audit, its
// per-domain rate-limit counters, and the sign-in counts (lib/auth/rate-limit-cleanup.ts, privacy page).
export const SAMPLE_AUDIT_RETENTION_HOURS = 24;
export const SAMPLE_RATE_LIMIT_COUNTER_RETENTION_DAYS = 2;
export const AUTH_RATE_LIMIT_RETENTION_HOURS = 24;
// An uploaded logo no saved branding uses is deleted once it's this old (lib/branding/cleanup-orphan-logos.ts).
export const LOGO_ORPHAN_MIN_AGE_DAYS = 7;

const DEFAULT_ENCRYPTION = "AES-256 at rest, TLS 1.3 in transit";
const LLM_ENCRYPTION = "TLS 1.3 in transit";
const LLM_RETENTION = "per provider API data-usage terms";
// 2 Nov: generated PDF reports are never deleted automatically --
// inngest/functions/audit-data-retention.ts doesn't touch storage, and the
// storage adapter can't delete -- so this no longer claims "12 months".
// The privacy page offers deletion on request. Deleting them after a
// stated period needs a storage delete and an "expired" state on the
// report pages; it's listed for later.
// 9 Nov: the same is true of the evidence archive -- nothing deletes it (an audit's deletion only unlinks it).
const KEPT_UNTIL_ASKED = "Kept until you ask us to delete them (not deleted automatically)";

export interface ResidencyConfigEntry {
  dataType: string;
  provider: string;
  storageRegion: string;
  retentionPeriod: string;
  encryptionStatus: string;
}

/**
 * Google AI surfaces (Phase 1, part 3): the SERP provider, listed only while Google can actually run for a
 * customer (lib/governance/google-surfaces-env.ts googleSurfacesCanRun: the env switch on and its credentials
 * set) -- before that no question goes to it. Only what DataForSEO's own documents say: where it processes
 * isn't documented; the company is DataForSEO OÜ, Tallinn, Estonia; its privacy policy names Google, AWS and
 * Azure (United States) and Hetzner (Germany) as processors; task data is kept 12 months, with no
 * zero-retention option.
 */
/** DataForSEO's own retention for client tasks, results and payloads (its DPA and legal FAQ #15). */
export const DATAFORSEO_TASK_RETENTION_MONTHS = 12;

export const GOOGLE_SURFACES_RESIDENCY_ENTRY: ResidencyConfigEntry = {
  dataType: "serp_processing_dataforseo",
  provider: "dataforseo",
  storageRegion:
    "Not documented by DataForSEO (DataForSEO OÜ, Estonia; its listed processors are in the United States and Germany)",
  retentionPeriod: `${DATAFORSEO_TASK_RETENTION_MONTHS} months at DataForSEO (questions and results); results kept with the audit here`,
  encryptionStatus: "In transit (HTTPS)",
};

export const RESIDENCY_CONFIG: readonly ResidencyConfigEntry[] = [
  {
    dataType: "database",
    provider: "neon",
    storageRegion: NEON_REGION,
    // Not "duration of account": nothing deletes a workspace's data when it closes (closing only marks it).
    retentionPeriod: "Kept until you ask us to delete it (not deleted automatically)",
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "audit_data",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: `Deleted ${AUDIT_DATA_RETENTION_MONTHS} months after the audit`,
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "evidence_snapshots",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: KEPT_UNTIL_ASKED,
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "llm_cache",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: `Reused for at most ${ANSWER_CACHE_REUSE_HOURS.memoryOnly} hours, then deleted by the weekly clean-up`,
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "crawler_logs",
    provider: "neon",
    storageRegion: NEON_REGION,
    retentionPeriod: `${CRAWLER_LOG_RETENTION_DAYS} days`,
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
    retentionPeriod: `${AI_REFERRAL_HIT_RETENTION_DAYS} days`,
    encryptionStatus: DEFAULT_ENCRYPTION,
  },
  {
    dataType: "pdf_reports",
    provider: "supabase",
    storageRegion: SUPABASE_STORAGE_REGION,
    retentionPeriod: KEPT_UNTIL_ASKED,
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
