"use client";

import { ArrowRight, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";

interface TopPage {
  url: string;
  hitCount: number;
  purpose: string;
  lastVisit: string;
}

interface CoverageGapResult {
  sitemapUrls: string[];
  crawledUrls: string[];
  gaps: string[];
  coveragePercent: number;
}

interface CoverageData {
  coverage: {
    gap: CoverageGapResult;
    topRetrieval: TopPage[];
    topIndexing: TopPage[];
    periodStart: string;
    periodEnd: string;
    /** Every AI crawler visit recorded for the brand in the period (17 Nov, part 3). */
    visitsInPeriod?: number;
  };
}

/**
 * 17 Nov, part 3: whether any crawler visit was recorded in the period. With none (no log uploaded, no snippet
 * installed), "Pages AI has never seen" listed every sitemap page -- a conclusion drawn from no data at all.
 */
export function crawlerVisitsRecorded(coverage: CoverageData["coverage"] | undefined): boolean {
  if (!coverage) return false;
  if (typeof coverage.visitsInPeriod === "number") return coverage.visitsInPeriod > 0;
  return (
    coverage.gap.crawledUrls.length > 0 ||
    coverage.topRetrieval.length > 0 ||
    coverage.topIndexing.length > 0
  );
}

interface PagesCoverageProps {
  brandId: string;
}

const PURPOSE_META: Record<string, { label: string; dot: string }> = {
  retrieval: { label: "Retrieval", dot: "var(--success)" },
  indexing: { label: "Indexing", dot: "var(--accent-blue)" },
  training: { label: "Training", dot: "var(--text-tertiary)" },
};

export function mergeTopPages(
  retrieval: TopPage[],
  indexing: TopPage[],
): Array<{
  url: string;
  retrieval: number;
  indexing: number;
  training: number;
}> {
  const map = new Map<string, { retrieval: number; indexing: number; training: number }>();
  for (const p of retrieval) {
    const entry = map.get(p.url) ?? { retrieval: 0, indexing: 0, training: 0 };
    entry.retrieval = p.hitCount;
    map.set(p.url, entry);
  }
  for (const p of indexing) {
    const entry = map.get(p.url) ?? { retrieval: 0, indexing: 0, training: 0 };
    entry.indexing = p.hitCount;
    map.set(p.url, entry);
  }
  return Array.from(map.entries())
    .map(([url, counts]) => ({ url, ...counts }))
    .sort((a, b) => b.retrieval + b.indexing - (a.retrieval + a.indexing));
}

function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function AgentAnalyticsPagesCoverage({ brandId }: PagesCoverageProps) {
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { locked, planRefused } = useBrandFeatureGate("page_coverage");
  const [taskState, setTaskState] = useState<"idle" | "creating" | "done" | "error">("idle");

  useEffect(() => {
    if (locked) return;
    setLoading(true);
    fetch(`/api/brands/${brandId}/agent-analytics/coverage`)
      .then(async (r) => {
        if (await planRefused(r)) return null;
        if (!r.ok) throw new Error("coverage failed");
        return r.json();
      })
      .then((res) => {
        if (res) setData(res);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [brandId, locked, planRefused]);

  if (locked) return <PlanLockedCard feature="page_coverage" />;

  if (loading) {
    return (
      <div
        className="h-48 animate-pulse rounded-xl"
        style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
      />
    );
  }

  if (error) return null;

  const { gap, topRetrieval, topIndexing } = data?.coverage ?? {
    gap: { sitemapUrls: [], crawledUrls: [], gaps: [], coveragePercent: 0 },
    topRetrieval: [] as TopPage[],
    topIndexing: [] as TopPage[],
  };
  const merged = mergeTopPages(topRetrieval, topIndexing);
  const hasTopPages = merged.length > 0;
  const hasSitemap = gap.sitemapUrls.length > 0;
  const visitsRecorded = crawlerVisitsRecorded(data?.coverage);
  // Only with visits on record can a sitemap page be one no crawler fetched.
  const hasGaps = visitsRecorded && gap.gaps.length > 0;

  async function handleCreateTask() {
    setTaskState("creating");
    try {
      const gapCount = gap.gaps.length;
      const sitemapTotal = gap.sitemapUrls.length;
      const isWideGap = sitemapTotal > 0 && gapCount > sitemapTotal * 0.5;

      const res = await fetch(`/api/brands/${brandId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          // 17 Nov, part 3: the logs cover the period asked for (30 days), so "never" was more than they show.
          title: hasSitemap
            ? `${gapCount} sitemap ${gapCount === 1 ? "page" : "pages"} with no AI crawler visit in this period`
            : "Add a sitemap so AI crawlers can discover your pages",
          description: isWideGap
            ? `Only ${gap.coveragePercent}% of your sitemap had a visit from any AI crawler in this period, in the visits we have on record.`
            : hasSitemap
              ? `These sitemap pages had no AI crawler visit in this period, in the visits we have on record: ${gap.gaps.slice(0, 5).map(extractPath).join(", ")}${gapCount > 5 ? ` (+${gapCount - 5} more)` : ""}.`
              : "No sitemap detected — AI crawlers rely on sitemaps for discovery. Add one and submit it.",
          dimension: "retrieval",
          recommendationKey: hasSitemap ? "thin_content_never_crawled" : "add_sitemap_for_ai",
          effort: "low",
          qualityStatus: "partial",
        }),
      });

      if (await planRefused(res)) return;
      if (!res.ok) throw new Error("task creation failed");
      setTaskState("done");
    } catch {
      setTaskState("error");
    }
  }

  return (
    <div className="space-y-5">
      {/* Block 1 — Top Pages */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
      >
        <div className="mb-4">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Which pages is AI actually reading?
          </h3>
          {/* 17 Nov, part 3: it said "Retrieval hits mean a human asked an AI a question". The purpose is
              our crawler list's label for the bot, not something seen in the visit. */}
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            The pages AI crawlers fetched most, from your logs. Each bot&apos;s purpose comes from
            our list of AI crawlers.
          </p>
        </div>

        {hasTopPages ? (
          <div className="space-y-2">
            {merged.map((p) => (
              <div
                key={p.url}
                className="rounded-lg p-3"
                style={{ background: "var(--bg-hover)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className="truncate text-[13px]"
                    style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                  >
                    {extractPath(p.url)}
                  </span>
                  {/* 17 Nov, part 3: this said "Cited in AI answers" -- but a crawler fetching a page is
                      not a citation; the audit page measures citations. */}
                  {p.retrieval > 0 && (
                    <span
                      className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
                    >
                      Fetched by a retrieval bot
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  {(["retrieval", "indexing", "training"] as const).map((k) => {
                    const n = p[k];
                    if (n === 0) return null;
                    const meta = PURPOSE_META[k];
                    return (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1.5"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: meta.dot }}
                          aria-hidden="true"
                        />
                        <span
                          style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}
                        >
                          {n}
                        </span>
                        {meta.label.toLowerCase()}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            No pages fetched by AI yet. Once AI crawlers visit, the pages they read most appear
            here.
          </p>
        )}

        {/* AA-14 — CORRELATION, NEVER CAUSATION */}
        <div
          className="mt-2 flex items-start gap-1.5 pt-2 text-[11px] leading-relaxed"
          style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}
        >
          <Info style={{ width: 12, height: 12, flexShrink: 0, marginTop: 1 }} />
          {/* 17 Nov, part 3: it said fetched pages "tend to appear in AI answers 2–4 weeks later", a figure
              nothing here measures. Your audits show which pages AI answers cite. */}
          <span>
            A crawler fetching a page doesn&apos;t mean an AI answer used it. Any link between the
            two is a <strong style={{ color: "var(--text-secondary)" }}>correlation</strong> at
            most, not proof of causation — a crawl grants access, not influence. Your audits show
            which pages AI answers cite.
          </span>
        </div>
      </div>

      {/* Block 2 — Coverage Gap */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Pages AI has never seen
            </h3>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {!visitsRecorded
                ? "Needs crawler visits on record to measure"
                : hasSitemap
                  ? "In your sitemap, with no AI crawler visit to them in this period"
                  : "Add a sitemap so we can measure which pages AI has and hasn’t discovered"}
            </p>
          </div>
          {visitsRecorded && (
            <button
              type="button"
              onClick={handleCreateTask}
              disabled={taskState === "creating" || taskState === "done"}
              className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-opacity disabled:opacity-60"
              style={{ background: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
            >
              {taskState === "creating" ? (
                <>
                  <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
                  Creating…
                </>
              ) : taskState === "done" ? (
                <>
                  <CheckCircle2 style={{ width: 12, height: 12 }} />
                  Task created
                </>
              ) : (
                <>
                  Create task
                  <ArrowRight style={{ width: 12, height: 12 }} />
                </>
              )}
            </button>
          )}
        </div>

        {taskState === "done" && (
          <div
            className="mb-3 flex items-center gap-2 rounded-lg p-2 text-[11px]"
            style={{ background: "var(--success-soft)", color: "var(--success)" }}
          >
            <CheckCircle2 style={{ width: 14, height: 14, flexShrink: 0 }} />
            Task created — see Workflow to track progress.
          </div>
        )}

        {taskState === "error" && (
          <div
            className="mb-3 flex items-center gap-2 rounded-lg p-2 text-[11px]"
            style={{
              background: "color-mix(in srgb, var(--danger) 8%, transparent)",
              color: "var(--danger)",
            }}
          >
            Failed to create task. Try again.
          </div>
        )}

        {hasGaps ? (
          <div className="space-y-1.5">
            {gap.gaps.map((gapUrl) => (
              <div
                key={gapUrl}
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-hover)" }}
              >
                <XCircle style={{ width: 14, height: 14, color: "var(--danger)", flexShrink: 0 }} />
                <span
                  className="truncate text-[12px]"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                >
                  {extractPath(gapUrl)}
                </span>
              </div>
            ))}
          </div>
        ) : !visitsRecorded ? (
          <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            No AI crawler visit is recorded for this period, so we can&apos;t tell which pages AI
            crawlers have or haven&apos;t fetched. Upload a log file or install the snippet above to
            start recording visits.
          </p>
        ) : hasSitemap ? (
          <p className="text-[12px]" style={{ color: "var(--success)" }}>
            Every sitemap page had an AI crawler visit in this period.
          </p>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            Add a sitemap so we can measure which pages AI has and hasn&apos;t discovered.
          </p>
        )}
      </div>
    </div>
  );
}
