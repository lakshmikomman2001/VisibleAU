import type { LocalSeoResult } from "@/db/schema";
import { DirectoryPresenceMatrix } from "./directory-presence-matrix";
import { GmbCard } from "./gmb-card";
import { NapConsistencyTable } from "./nap-consistency-table";
import { SuburbCoverageCard } from "./suburb-coverage-card";

interface DirectoryEntry {
  directory: string;
  present: boolean;
  url: string | null;
}

interface NapFindingEntry {
  source: string;
  name: string;
  address: string;
  phone: string;
}

interface SuburbEntry {
  suburb: string;
  mentionedInContent: boolean;
  mentionedInMeta: boolean;
  mentionedInSchema: boolean;
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: "var(--radius-lg, 8px)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          fontFamily: "var(--font-mono)",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-tertiary)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function LocalSeoView({ result }: { result: LocalSeoResult }) {
  const directories = (result.directoryPresence as DirectoryEntry[]) ?? [];
  const suburbs = (result.suburbCoverage as SuburbEntry[]) ?? [];
  const napFindings = (result.napFindings as NapFindingEntry[]) ?? [];
  const dirPresent = directories.filter((d) => d.present).length;

  return (
    <div style={{ padding: "28px 32px" }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          margin: "0 0 4px",
        }}
      >
        Local SEO signals
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          margin: "0 0 24px",
        }}
      >
        Local SEO and GEO are linked. We track signals that influence both
        Google and LLM visibility.
      </p>

      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label="Local SEO score"
          value={result.scoreComposite ? `${Number(result.scoreComposite).toFixed(1)}` : "—"}
          sub="Weighted local SEO score"
        />
        <KpiCard
          label="NAP consistency"
          value={result.napConsistency ? `${Number(result.napConsistency).toFixed(0)}%` : "—"}
          sub={`${napFindings.length} sources compared`}
        />
        <KpiCard
          label="Directory coverage"
          value={`${dirPresent}/${directories.length}`}
          sub="AU directories present"
        />
        <KpiCard
          label="GMB completeness"
          value={
            result.gmbPresent
              ? `${Number(result.gmbCompleteness ?? 0).toFixed(0)}%`
              : "Not found"
          }
          sub={
            result.gmbPresent
              ? `${result.gmbReviewCount ?? 0} reviews · ${Number(result.gmbAvgRating ?? 0).toFixed(1)} avg`
              : "No Google Business Profile"
          }
        />
      </div>

      {/* GMB card + NAP signals (2-column layout per prototype L3242) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <GmbCard
          gmbPresent={result.gmbPresent}
          gmbCompleteness={result.gmbCompleteness}
          gmbReviewCount={result.gmbReviewCount ?? 0}
          gmbAvgRating={result.gmbAvgRating}
          napFindings={napFindings}
        />
        <NapConsistencyTable findings={napFindings} />
      </div>

      {/* Directory presence matrix */}
      <div style={{ marginBottom: 24 }}>
        <DirectoryPresenceMatrix directories={directories} />
      </div>

      {/* Suburb coverage */}
      <SuburbCoverageCard suburbs={suburbs} />
    </div>
  );
}
