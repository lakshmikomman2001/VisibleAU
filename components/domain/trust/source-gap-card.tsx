"use client";

import type { TopDomainEntry } from "@/lib/trust/citation-intelligence";

interface SourceRow {
  id: string;
  engine: string;
  sourceType: string;
  citationCount: number;
  citationShare: string;
  brandPresentInSource: boolean;
  gapSeverity: string;
  sourceAffinityNote: string | null;
  // Task #45: null for rows written before migration 0039 (or whose
  // non-fatal write fell back to omitting it) -- distinct from a
  // genuinely-computed empty array (a card whose responses had no
  // extractable/structured sources at all).
  topDomains: TopDomainEntry[] | null;
}

// Task #46: the default title fallback (sourceType.replace(/_/g, " "))
// reads fine for existing categories ("au directory", "review site")
// but not for the two added here ("industry association" undersells
// what it is; "government regulator" is clunky) -- explicit overrides,
// falling back to the plain replace for everything else.
const SOURCE_TYPE_LABELS: Record<string, string> = {
  industry_association: "Industry body",
  government_regulator: "Regulator / government",
};

function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType.replace(/_/g, " ");
}

const GAP_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  critical: {
    bg: "color-mix(in srgb, var(--destructive) 15%, transparent)",
    color: "var(--destructive)",
    label: "Critical gap",
  },
  warning: {
    bg: "color-mix(in srgb, var(--warning) 15%, transparent)",
    color: "var(--warning)",
    label: "Warning",
  },
  opportunity: {
    bg: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
    color: "var(--accent-primary)",
    label: "Opportunity",
  },
  covered: {
    bg: "color-mix(in srgb, var(--success) 15%, transparent)",
    color: "var(--success)",
    label: "Covered",
  },
  // Task #43: "other" is an unclassified bucket, not an actionable gap
  // in a specific channel -- a neutral badge, not Critical/Covered.
  // Without this entry, an unrecognised gapSeverity value falls back to
  // GAP_CONFIG.covered below, which would have rendered "other" as a
  // false-reassuring green "Covered" badge.
  unclassified: {
    bg: "color-mix(in srgb, var(--muted) 20%, transparent)",
    color: "var(--muted)",
    label: "Unclassified",
  },
};

const RECALLED_TOOLTIP =
  "Domains the model wrote from memory, not verified by a live search — may be outdated or invented.";
const MIXED_TOOLTIP =
  "Some of these domains came from a live search; others are from the model's memory and aren't verified.";

/** Task #45: a domain is only ever rendered as a clickable link when it's
 * "retrieved" (came from a provider's own structured citation metadata,
 * e.g. a live search actually ran) AND resolves to a genuine http(s)
 * URL. "Recalled" domains (pattern-matched out of model-generated text,
 * never verified -- may not even be real businesses) are never links,
 * regardless of how they'd parse, and any non-http(s) scheme is refused
 * either way. */
function safeHttpHref(domain: string): string | null {
  try {
    const url = new URL(`https://${domain}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function originSummary(domains: TopDomainEntry[]): { label: string; tooltip: string | null } {
  const retrievedCount = domains.filter((d) => d.origin === "retrieved").length;
  const recalledCount = domains.filter((d) => d.origin === "recalled").length;

  if (retrievedCount > 0 && recalledCount > 0) {
    return { label: `Retrieved (${retrievedCount}) + Recalled (${recalledCount})`, tooltip: MIXED_TOOLTIP };
  }
  if (retrievedCount > 0) return { label: "Retrieved", tooltip: null };
  if (recalledCount > 0) return { label: "Recalled", tooltip: RECALLED_TOOLTIP };
  return { label: "", tooltip: null };
}

function TopDomainsList({ domains }: { domains: TopDomainEntry[] }) {
  if (domains.length === 0) return null;
  const summary = originSummary(domains);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
          Top cited domains
        </p>
        {summary.label && (
          <span
            // Native title (mouse) + aria-label (screen reader) +
            // tabIndex (keyboard focus) -- reachable without a full
            // custom tooltip component.
            {...(summary.tooltip
              ? { title: summary.tooltip, "aria-label": `${summary.label}. ${summary.tooltip}`, tabIndex: 0 }
              : {})}
            role={summary.tooltip ? "note" : undefined}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)",
              color: "var(--muted)",
            }}
          >
            {summary.label}
          </span>
        )}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {domains.map((d) => {
          const href = d.origin === "retrieved" ? safeHttpHref(d.domain) : null;
          return (
            <li key={d.domain} className="text-xs" style={{ color: "var(--foreground)" }}>
              {href ? (
                // Task #46 Part C: a retrieved link previously looked
                // identical to plain recalled text -- underline is now
                // always-on (not hover-only) plus a visible
                // focus-visible ring for keyboard users, and a small
                // external-link icon makes the affordance legible at a
                // glance, not just on interaction. aria-label on the
                // anchor itself (rather than a separate sr-only span)
                // is what a screen reader announces instead of the
                // visible text + decorative icon.
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={`${d.domain} (opens in new tab)`}
                  className="inline-flex items-center gap-0.5 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                  style={{ color: "var(--accent-primary)", outlineColor: "var(--accent-primary)" }}
                >
                  {d.domain}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    width="10"
                    height="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" />
                    <path d="M9 2h5v5" />
                    <path d="M14 2 7 9" />
                  </svg>
                </a>
              ) : (
                <span>{d.domain}</span>
              )}
              <span style={{ color: "var(--muted)" }}> ({d.count})</span>
              {d.isBrand && (
                <span
                  className="ml-1 rounded px-1 py-0.5 text-[9px] font-medium"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)",
                    color: "var(--success)",
                  }}
                >
                  this brand
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SourceGapCard({ source }: { source: SourceRow }) {
  const gap = GAP_CONFIG[source.gapSeverity] ?? GAP_CONFIG.covered;

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="font-medium" style={{ color: "var(--foreground)" }}>
          {sourceTypeLabel(source.sourceType)}
        </p>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: gap.bg, color: gap.color }}
        >
          {gap.label}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-4">
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Citations
          </p>
          <p
            className="text-lg font-bold"
            style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
          >
            {source.citationCount}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Share
          </p>
          <p
            className="text-lg font-bold"
            style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
          >
            {source.citationShare}%
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Engine
          </p>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            {source.engine}
          </p>
        </div>
      </div>

      {source.sourceAffinityNote ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          {source.sourceAffinityNote}
        </p>
      ) : source.gapSeverity === "unclassified" ? (
        // Task #43: plain, data-driven -- names the actual share, not a
        // generic line, and doesn't badge it as a channel-specific gap.
        <p className="mt-3 text-sm italic" style={{ color: "var(--muted)" }}>
          {source.citationShare}% of this engine&apos;s cited sources couldn&apos;t be categorised
          yet.
        </p>
      ) : (
        // Task #41: a real category somehow missing its seed note -- a
        // neutral fallback instead of silently rendering nothing.
        <p className="mt-3 text-sm italic" style={{ color: "var(--muted)" }}>
          No category-specific guidance available for this source type yet.
        </p>
      )}

      {/* Task #45: null (pre-migration-0039 row, or a non-fatal write
          that fell back to omitting it) gets its own honest fallback --
          never an empty or broken list. A genuinely-computed empty array
          (this card's responses had nothing extractable) renders
          nothing further, which TopDomainsList already handles. */}
      {source.topDomains === null ? (
        <p className="mt-3 text-xs italic" style={{ color: "var(--muted)" }}>
          Top domains appear after the next audit.
        </p>
      ) : (
        <TopDomainsList domains={source.topDomains} />
      )}
    </div>
  );
}
