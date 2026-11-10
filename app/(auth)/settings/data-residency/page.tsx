"use client";

import { ResidencyTable } from "@/components/domain/governance/residency-table";
import { LoadError } from "@/components/shared/load-error";
import { useLoad } from "@/lib/hooks/use-load";
import { AUDIT_QUESTIONS, SENT_WHEN_A_BUSINESS_IS_ADDED } from "@/lib/legal/data-facts";
import { fetchJson } from "@/lib/load/fetch-json";

interface ResidencyEntry {
  dataType: string;
  storageRegion: string;
  provider: string;
  retentionPeriod: string;
  encryptionStatus: string;
}

// Playwright-run follow-ups (10 Nov), part 8: a failed /api/auth/me returned as if it had worked, with nothing
// loaded, so the table said "loading" for good. A failure says it couldn't load, through the shared loader
// (useLoad, part 1 of the af8de42..d1eb5a1 follow-ups), with Try again.
async function loadResidency(signal: AbortSignal): Promise<ResidencyEntry[]> {
  const me = await fetchJson<{ organizationId: string }>("/api/auth/me", { signal });
  return fetchJson<ResidencyEntry[]>(`/api/organizations/${me.organizationId}/data-residency`, {
    signal,
  });
}

export default function DataResidencyPage() {
  const residency = useLoad(loadResidency);

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
        <div className="mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Data Residency
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Where your data is stored, processed, and how long it's retained.
          </p>
        </div>

        {/* Region badge */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-md"
            style={{
              background: "var(--success-soft)",
              border: "1px solid color-mix(in srgb, var(--success) 35%, transparent)",
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--success)" }} />
            <span className="text-[12px] font-medium" style={{ color: "var(--success)" }}>
              Primary region: Australia (ap-southeast-2)
            </span>
          </div>
        </div>

        <div
          className="mb-8 p-5 rounded-xl"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Data Processing Agreement
          </h3>
          <p className="text-[13px] mb-3" style={{ color: "var(--text-secondary)" }}>
            Your account data is stored in Australia: the primary database runs on Neon (AWS
            ap-southeast-2, Sydney), generated PDF reports are stored in Supabase Storage (AWS
            ap-southeast-2, Sydney), and rate-limiting data lives in Upstash Redis (Sydney).
            Application functions run in Sydney, Australia. A lightweight routing layer (middleware)
            runs on Vercel's global network to direct requests — it checks for a signed-in session
            cookie and reads the request's path and geo-detected country; it does not read your
            account or brand data.
          </p>
          {/* 9 Nov (retention follow-ups, part 5): it said prompts include "your brand name, domain, and
              public website content". An audit's questions never carry the domain; the sentences are the
              privacy page's and the FAQ's (lib/legal/data-facts.ts). */}
          <p className="text-[13px] mb-3" style={{ color: "var(--text-secondary)" }}>
            Audits send AI providers in the United States (OpenAI, Anthropic, Google, Perplexity){" "}
            {AUDIT_QUESTIONS}. {SENT_WHEN_A_BUSINESS_IS_ADDED} This processing occurs outside
            Australia under each provider's API data-usage terms; prompts are not used to train
            their models.
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Background jobs (audits, reports, scheduled digests) run through Inngest, whose own
            account and event data is hosted on AWS in the United States. Email is sent via Resend,
            whose account metadata and logs are stored in the United States regardless of sending
            region. Data in transit uses TLS 1.2+; data at rest uses AES-256.
          </p>
        </div>

        {residency.status === "error" ? (
          <LoadError
            what="the data residency information"
            detail={residency.detail}
            onRetry={residency.retry}
          />
        ) : residency.status === "loading" ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg animate-pulse"
                style={{ background: "var(--bg-elevated)" }}
              />
            ))}
          </div>
        ) : (
          <ResidencyTable entries={residency.data} />
        )}
      </div>
    </div>
  );
}
