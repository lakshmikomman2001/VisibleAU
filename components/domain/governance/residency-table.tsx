"use client";

interface ResidencyEntry {
  dataType: string;
  storageRegion: string;
  provider: string;
  retentionPeriod: string;
  encryptionStatus: string;
}

const TYPE_LABELS: Record<string, string> = {
  database: "Primary Database",
  audit_data: "Audit Data",
  evidence_snapshots: "Evidence Snapshots",
  pdf_reports: "PDF Reports",
  llm_cache: "LLM Cache",
  crawler_logs: "Crawler Logs",
  ai_bot_registry: "AI Bot Registry",
  ai_bot_ip_ranges: "AI Bot IP Ranges",
  ai_referral_hits: "AI Referral Hits",
  llm_processing_openai: "LLM Processing (OpenAI)",
  llm_processing_anthropic: "LLM Processing (Anthropic)",
  llm_processing_google: "LLM Processing (Google)",
  llm_processing_perplexity: "LLM Processing (Perplexity)",
};

// Legacy short region codes, kept as a fallback for any row written before
// residency-config.ts switched to human-readable region strings.
export const REGION_LABELS: Record<string, string> = {
  "ap-southeast-2": "Australia (Sydney)",
  us: "United States",
};

export const PROVIDER_DISPLAY: Record<string, string> = {
  neon: "Neon",
  supabase: "Supabase",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  perplexity: "Perplexity",
  vercel: "Vercel",
};

interface ResidencyGroup {
  key: string;
  heading: string;
  subheading: string;
  match: (entry: ResidencyEntry) => boolean;
}

const GROUPS: ResidencyGroup[] = [
  {
    key: "database",
    heading: "Database",
    subheading: "Neon, Sydney",
    match: (e) => e.provider === "neon",
  },
  {
    key: "file_storage",
    heading: "File storage",
    subheading: "Supabase, Sydney",
    match: (e) => e.provider === "supabase",
  },
  {
    key: "llm_processing",
    heading: "LLM processing",
    subheading: "Offshore, United States",
    match: (e) => e.dataType.startsWith("llm_processing_"),
  },
];

function regionLabel(storageRegion: string): string {
  return REGION_LABELS[storageRegion] ?? storageRegion;
}

function providerLabel(provider: string): string {
  return PROVIDER_DISPLAY[provider] ?? provider;
}

function GroupTable({ heading, subheading, entries }: { heading: string; subheading: string; entries: ResidencyEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-2 px-1">
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {heading}
        </h2>
        <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          {subheading}
        </span>
      </div>
      <div
        className="overflow-x-auto rounded-xl"
        style={{ border: "1px solid var(--border-default)" }}
      >
        <table className="w-full text-left">
          <thead>
            <tr
              className="text-[10px] font-semibold uppercase tracking-wider border-b"
              style={{
                borderColor: "var(--border-subtle)",
                background: "var(--bg-elevated)",
                color: "var(--text-tertiary)",
              }}
            >
              <th scope="col" className="px-5 py-3">
                Data Type
              </th>
              <th scope="col" className="px-5 py-3">
                Location
              </th>
              <th scope="col" className="px-5 py-3">
                Provider
              </th>
              <th scope="col" className="px-5 py-3">
                Retention
              </th>
              <th scope="col" className="px-5 py-3">
                Encryption
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.dataType}
                className="border-b last:border-b-0"
                style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)" }}
              >
                <td
                  className="px-5 py-3 text-[13px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {TYPE_LABELS[entry.dataType] ?? entry.dataType}
                </td>
                <td className="px-5 py-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {regionLabel(entry.storageRegion)}
                </td>
                <td className="px-5 py-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {providerLabel(entry.provider)}
                </td>
                <td
                  className="px-5 py-3 text-[12px] tabular-nums"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {entry.retentionPeriod}
                </td>
                <td className="px-5 py-3 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  {entry.encryptionStatus}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ResidencyTable({ entries }: { entries: ResidencyEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Residency information loading…
        </p>
      </div>
    );
  }

  return (
    <div>
      {GROUPS.map((group) => (
        <GroupTable
          key={group.key}
          heading={group.heading}
          subheading={group.subheading}
          entries={entries.filter(group.match)}
        />
      ))}
    </div>
  );
}
