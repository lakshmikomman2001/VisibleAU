"use client";

import { useCallback, useEffect, useState } from "react";
import { ResidencyTable } from "@/components/domain/governance/residency-table";

interface ResidencyEntry {
  dataType: string;
  storageRegion: string;
  provider: string;
  retentionPeriod: string;
  encryptionStatus: string;
}

export default function DataResidencyPage() {
  const [entries, setEntries] = useState<ResidencyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResidency = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) return;
      const me = await meRes.json();

      const res = await fetch(`/api/organizations/${me.organizationId}/data-residency`);
      if (!res.ok) throw new Error("Failed to load data residency");
      const data = await res.json();
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchResidency(); }, [fetchResidency]);

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
        <div className="mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Data Residency</h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Where your data is stored, processed, and how long it's retained.
          </p>
        </div>

        {/* Region badge */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-md"
            style={{ background: "var(--success-soft)", border: "1px solid var(--success-border, var(--border-default))" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--success)" }} />
            <span className="text-[12px] font-medium" style={{ color: "var(--success)" }}>
              Primary region: Australia (ap-southeast-2)
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
            ))}
          </div>
        ) : (
          <>
            <ResidencyTable entries={entries} />

            <div className="mt-8 p-5 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Data Processing Agreement
              </h3>
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                All Australian customer data is stored in Supabase's ap-southeast-2 (Sydney) region.
                LLM processing occurs via US-based providers (OpenAI, Anthropic) with zero persistent storage
                — prompts and responses are processed in-transit only and are not retained by the provider.
                All data in transit uses TLS 1.3; data at rest uses AES-256 encryption.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
