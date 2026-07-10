"use client";

interface ResidencyEntry {
  dataType: string;
  storageRegion: string;
  provider: string;
  retentionPeriod: string;
  encryptionStatus: string;
}

const TYPE_LABELS: Record<string, string> = {
  audit_data: "Audit Data",
  evidence_snapshots: "Evidence Snapshots",
  pdf_reports: "PDF Reports",
  llm_cache: "LLM Cache",
  crawler_logs: "Crawler Logs",
  llm_processing_openai: "LLM Processing (OpenAI)",
  llm_processing_anthropic: "LLM Processing (Anthropic)",
};

const REGION_LABELS: Record<string, string> = {
  "ap-southeast-2": "Australia (Sydney)",
  us: "United States",
};

const PROVIDER_DISPLAY: Record<string, string> = {
  supabase: "Supabase",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  perplexity: "Perplexity",
  vercel: "Vercel",
};

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
    <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border-default)" }}>
      <table className="w-full text-left">
        <thead>
          <tr
            className="text-[10px] font-semibold uppercase tracking-wider border-b"
            style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}
          >
            <th className="px-5 py-3">Data Type</th>
            <th className="px-5 py-3">Location</th>
            <th className="px-5 py-3">Provider</th>
            <th className="px-5 py-3">Retention</th>
            <th className="px-5 py-3">Encryption</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.dataType}
              className="border-b last:border-b-0"
              style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)" }}
            >
              <td className="px-5 py-3 text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                {TYPE_LABELS[entry.dataType] ?? entry.dataType}
              </td>
              <td className="px-5 py-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {REGION_LABELS[entry.storageRegion] ?? entry.storageRegion}
              </td>
              <td className="px-5 py-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {PROVIDER_DISPLAY[entry.provider] ?? entry.provider}
              </td>
              <td className="px-5 py-3 text-[12px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
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
  );
}
