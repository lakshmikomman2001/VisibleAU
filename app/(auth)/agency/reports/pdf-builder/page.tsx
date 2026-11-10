"use client";

import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlanTier } from "@/components/domain/plan-tier-context";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanGatedLink, PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { LoadError } from "@/components/shared/load-error";
import { useLoad } from "@/lib/hooks/use-load";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { actionFailureMessage, fetchJson, fetchOrFail, readJson } from "@/lib/load/fetch-json";
import { type Breadcrumbs, CRUMB } from "@/lib/navigation/breadcrumbs";
import { PRODUCT_NAME } from "@/lib/product";
import { measured } from "@/lib/scoring/measured";
import { engineAnswerLine, positionCard, sourceCitationCard } from "@/lib/scoring/measured-display";
import {
  formatVisibilityPercent,
  type VisibilityDisplay,
  visibilityDisplay,
} from "@/lib/scoring/visibility-display";

// Agency › PDF Builder: /agency/reports has no page of its own to link to.
const PDF_BUILDER_CRUMBS: Breadcrumbs = [CRUMB.workspace, CRUMB.agency, { label: "PDF Builder" }];

interface BrandingData {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  footerText: string;
  contactLine: string;
  agencyName: string;
}

interface BrandItem {
  id: string;
  name: string;
}

interface AuditData {
  id: string;
  auditNumber: number;
  scoreComposite: string | null;
  scoreFrequency: string | null;
  scoreSentimentNumeric: string | null;
  scoreContextNumeric: string | null;
  // Audit #36: the counts Position/Source citation are shown as.
  mentionedCount: number;
  rankedCount: number;
  medianPosition: number | null;
  sourcedCount: number;
  scoreConfidenceLow: string | null;
  scoreConfidenceHigh: string | null;
  completedAt: string | null;
  engines: string[] | null;
  /** The audit page's headline ("8%", "3 of 40"), from the latest-audit API. */
  visibility?: VisibilityDisplay;
}

interface ActionItem {
  title: string;
  action: string;
  dimension: string;
  confidenceLabel: string;
  expectedImpactScore: string;
}

interface EngineStat {
  engine: string;
  sampleCount: number;
  mentionedCount: number;
}

interface PriorAudit {
  scoreComposite: string | null;
  completedAt: string | null;
}

/** The latest-audit API's Visibility, or the shared "no audit" display. */
function auditVisibility(audit: AuditData | null): VisibilityDisplay {
  return audit?.visibility ?? visibilityDisplay(null);
}

const DEFAULT_SECTIONS = [
  { key: "executive", label: "Executive summary", default: true },
  { key: "scorecard", label: "Visibility scorecard", default: true },
  { key: "engines", label: "Per-engine breakdown", default: true },
  { key: "actions", label: "Action plan", default: true },
  { key: "methodology", label: "Methodology appendix", default: false },
] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface LatestAudit {
  audit: AuditData | null;
  actionItems: ActionItem[];
  engineStats: EngineStat[];
  priorAudit: PriorAudit | null;
}

type SavedBranding = { [K in keyof BrandingData]?: string | null };

/** The saved branding as the PDF prints it: its colours, or the PDF's own where none is saved. */
function toBranding(saved: SavedBranding | null): BrandingData {
  return {
    logoUrl: saved?.logoUrl ?? "",
    primaryColor: saved?.primaryColor ?? "#0066CC",
    secondaryColor: saved?.secondaryColor ?? "#1A1A1A",
    accentColor: saved?.accentColor ?? "#FF6B35",
    footerText: saved?.footerText ?? "",
    contactLine: saved?.contactLine ?? "",
    agencyName: saved?.agencyName ?? "",
  };
}

// Only until the load is in: the page shows its loading or error state then, never these.
const NO_BRANDING = toBranding(null);
const NO_BRANDS: BrandItem[] = [];
const NO_ACTIONS: ActionItem[] = [];
const NO_ENGINE_STATS: EngineStat[] = [];

// Follow-ups from af8de42..d1eb5a1, part 1: neither fetch checked its answer, so a failed branding fetch
// showed the default colours as the saved branding, and a failed /api/brands an empty brand list.
async function loadBuilder(signal: AbortSignal) {
  const [brandingData, brandsData] = await Promise.all([
    fetchJson<{ branding: SavedBranding | null }>("/api/agency/branding", { signal }),
    fetchJson<{ brands: BrandItem[] }>("/api/brands", { signal }),
  ]);
  return { branding: toBranding(brandingData.branding), brands: brandsData.brands };
}

export default function PdfBuilderPage() {
  const planTier = usePlanTier();
  const auditGate = useBrandFeatureGate("latest_audit_summary");
  const builder = useLoad(loadBuilder);
  const branding = builder.data?.branding ?? NO_BRANDING;
  const brands = builder.data?.brands ?? NO_BRANDS;
  const [selectedBrand, setSelectedBrand] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sections, setSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_SECTIONS.map((s) => [s.key, s.default])),
  );

  // The first brand, once the list is in.
  const firstBrandId = brands[0]?.id ?? "";
  useEffect(() => {
    if (firstBrandId) setSelectedBrand((current) => current || firstBrandId);
  }, [firstBrandId]);

  const { locked: auditLocked, planRefused: auditRefused } = auditGate;
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed latest-audit fetch said "No completed audit for ...
  // yet. Run an audit first" -- it says it couldn't load now. A plan refusal locks (useBrandFeatureGate).
  const loadAudit = useCallback(
    async (signal: AbortSignal): Promise<LatestAudit | null> => {
      const res = await fetchOrFail(`/api/brands/${selectedBrand}/latest-audit`, { signal });
      if (await auditRefused(res)) return null;
      return readJson<LatestAudit>(res);
    },
    [selectedBrand, auditRefused],
  );
  const latest = useLoad(loadAudit, { enabled: selectedBrand !== "" && !auditLocked });
  const audit = latest.data?.audit ?? null;
  const actions = latest.data?.actionItems ?? NO_ACTIONS;
  const engineStats = latest.data?.engineStats ?? NO_ENGINE_STATS;
  const priorAudit = latest.data?.priorAudit ?? null;

  const handleExport = async () => {
    if (!audit) return;
    setExporting(true);
    setExportError(null);
    try {
      const sectionKeys = Object.entries(sections)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(",");
      const res = await fetch(`/api/audits/${audit.id}/export?format=pdf&sections=${sectionKeys}`);
      if (!res.ok) {
        setExportError(await actionFailureMessage(res, "The PDF couldn't be made."));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-report-${audit.auditNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // It was silent: Generate PDF stopped and nothing said why.
      setExportError("The PDF couldn't be made. Check your connection and try again.");
    } finally {
      setExporting(false);
    }
  };

  const currentBrandName = brands.find((b) => b.id === selectedBrand)?.name || "Selected Brand";

  const score = useCallback((v: string | null) => (v != null ? parseFloat(v).toFixed(1) : "—"), []);

  // Task #46 Phase 2, Part 2: this preview's /api/brands/[brandId]/latest-audit
  // data source returns the stored audits.score* columns directly -- it has
  // no access to the real citations-derived mention count the export route
  // and the audit page resolve DimensionResult from (that count lives behind
  // a different route). Frequency is exactly mentionedCount/totalCalls*100
  // (lib/scoring/frequency.ts), so "Frequency stored as exactly 0" is a
  // faithful proxy for "0 mention rows" for every real audit size this app
  // produces (prompts_count × runs_per_prompt × engines is at most a few
  // hundred, so a single real mention would never round down to 0.00 at
  // this column's 2-decimal precision). This keeps the preview honest
  // without needing a server change to this route.
  // 9 Nov (part 9): same rule as before -- no stored frequency, or a stored 0, gives Position and Source
  // citation nothing to measure -- without a `?? 0` (lib/scoring/measured.ts).
  const frequency = measured(audit?.scoreFrequency);
  const insufficientData = !frequency.measured || frequency.value === 0;

  // Display-only relabel: this dimension measures citation rate (accuracyDimensionScore), not
  // factual correctness. DB column (score_accuracy) and internal key (accuracy) are unchanged —
  // see docs/ops for the Phase 1 writeup.
  // Task #46 Phase 3, Part C: Sentiment and Context have no real classifier
  // behind their stored labels (lib/scoring/dimension-result.ts) -- `notMeasured`
  // is unconditional (true for every audit, unlike `insufficient`, which is
  // gated on mention count), so they never show a fabricated-looking number here.
  // Audit #36: Position/Source citation through the same display
  // function as the exported PDF -- "#4", "3 of 3", never a 0-100 score.
  const mentionCards = useMemo(
    () => (audit ? { position: positionCard(audit), source: sourceCitationCard(audit) } : null),
    [audit],
  );
  const dimensions = useMemo(
    () => [
      {
        name: "Frequency",
        // The mention rate, as the audit page shows it ("8%" over "3 of 40").
        value: auditVisibility(audit).value,
        detail: auditVisibility(audit).detail,
        insufficient: false,
        notMeasured: false,
      },
      {
        name: "Position",
        value:
          mentionCards?.position.kind === "measured"
            ? mentionCards.position.value
            : (mentionCards?.position.line ?? "—"),
        detail: mentionCards?.position.kind === "measured" ? mentionCards.position.detail : null,
        insufficient: insufficientData,
        notMeasured: false,
      },
      {
        name: "Sentiment",
        value: score(audit?.scoreSentimentNumeric ?? null),
        insufficient: false,
        notMeasured: true,
      },
      {
        name: "Context",
        value: score(audit?.scoreContextNumeric ?? null),
        insufficient: false,
        notMeasured: true,
      },
      {
        name: "Source citation",
        value:
          mentionCards?.source.kind === "measured"
            ? mentionCards.source.value
            : (mentionCards?.source.line ?? "—"),
        detail: mentionCards?.source.kind === "measured" ? mentionCards.source.detail : null,
        insufficient: insufficientData,
        notMeasured: false,
      },
    ],
    [audit, score, insufficientData, mentionCards],
  );

  const execSummary = useMemo(() => {
    if (!audit?.scoreComposite) return null;
    const composite = parseFloat(audit.scoreComposite);
    const parts: string[] = [];

    // The mention rate, as the audit page shows it ("8%") -- it said "7.5/100".
    const visibility = auditVisibility(audit);
    if (priorAudit?.scoreComposite) {
      const prior = parseFloat(priorAudit.scoreComposite);
      const delta = Number(composite.toFixed(0)) - Number(prior.toFixed(0));
      const direction = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";
      parts.push(
        `${currentBrandName} is mentioned in ${visibility.value} of AI answers (${visibility.detail}), ${direction}${delta === 0 ? "" : ` ${Math.abs(delta)} points`} from ${formatVisibilityPercent(prior)} on ${formatDate(priorAudit.completedAt)}.`,
      );
    } else {
      parts.push(
        `${currentBrandName} is mentioned in ${visibility.value} of AI answers (${visibility.detail}).`,
      );
    }

    // Task #46 Phase 2, Part 2: matches lib/pdf/render.tsx's buildExecSummary
    // -- a zero-mention audit states that plainly instead of comparing four
    // dimensions where three are insufficient_data, which used to read as
    // "All dimensions scored equally (0.0)".
    if (insufficientData) {
      parts.push("Not mentioned by any AI engine in this audit.");
    } else {
      // Task #46 Phase 3, Part C: Sentiment/Context dropped from this list --
      // their stored columns are never null, so a `.val != null` filter could
      // never exclude them, and they'd show up as strongest/weakest despite
      // having no real classifier behind them. See lib/pdf/render.tsx's
      // buildExecSummary, fixed the same way.
      // Audit #36: matches lib/pdf/render.tsx's buildExecSummary -- the
      // counts, not a strongest/weakest ranking of 0-100 scores.
      const position = positionCard(audit);
      const rank =
        position.kind === "measured"
          ? `typically ${position.value} when listed (${position.detail})`
          : "not inside a ranked list";
      parts.push(`When mentioned: ${rank}; ${sourceCitationCard(audit).line}.`);
    }

    if (actions.length > 0) {
      parts.push(
        `${actions.length} open recommendation${actions.length > 1 ? "s" : ""} identified.`,
      );
    }

    return parts.join(" ");
  }, [audit, priorAudit, actions, currentBrandName, insufficientData]);

  if (builder.status === "loading") {
    return (
      <div className="p-8">
        <SetBreadcrumbs crumbs={PDF_BUILDER_CRUMBS} />
        <p className="text-muted-foreground">Loading PDF builder...</p>
      </div>
    );
  }

  if (builder.status === "error") {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <SetBreadcrumbs crumbs={PDF_BUILDER_CRUMBS} />
        <h1 className="text-2xl font-semibold">White-Label Report Builder</h1>
        <LoadError
          what="your report branding and brands"
          detail={builder.detail}
          onRetry={builder.retry}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <SetBreadcrumbs crumbs={PDF_BUILDER_CRUMBS} />

      <h1 className="text-2xl font-semibold">White-Label Report Builder</h1>

      {/* Controls beside the preview from 1024px; above it on a phone. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ─── Left panel: controls ─── */}
        <div className="lg:col-span-4 space-y-4 min-w-0">
          {/* Brand selector */}
          <div
            className="rounded-lg border p-4 space-y-3"
            style={{ background: "var(--bg-elevated)" }}
          >
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Brand
            </h2>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                borderColor: "var(--border-default)",
              }}
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* What's saved. 2 Nov: these were boxes nothing saved -- Generate PDF
              prints the saved branding, so what was typed here vanished. */}
          <div
            className="rounded-lg border p-4 space-y-3"
            style={{ background: "var(--bg-elevated)" }}
          >
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Branding
            </h2>
            <dl className="space-y-2">
              {(
                [
                  ["Agency name", branding.agencyName],
                  ["Logo", branding.logoUrl ? "Set" : ""],
                  ["Footer contact", branding.contactLine],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {label}
                  </dt>
                  <dd className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {value || "Not set"}
                  </dd>
                </div>
              ))}
            </dl>
            <PlanGatedLink
              feature="white_label_reports"
              tier={planTier}
              className="block text-xs underline focus-visible:outline focus-visible:outline-2"
              style={{ color: "var(--accent-blue)" }}
            >
              Change these in Account → Report branding
            </PlanGatedLink>
          </div>

          {/* Sections checklist */}
          <div
            className="rounded-lg border p-4 space-y-3"
            style={{ background: "var(--bg-elevated)" }}
          >
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Sections to include
            </h2>
            {DEFAULT_SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sections[s.key]}
                  onChange={(e) => setSections((prev) => ({ ...prev, [s.key]: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {s.label}
                </span>
              </label>
            ))}
          </div>

          {/* Generate PDF button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={!audit || exporting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg disabled:opacity-50"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
            }}
          >
            <Download style={{ width: 16, height: 16 }} />
            {exporting ? "Generating..." : "Generate PDF"}
          </button>
          {exportError && (
            <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
              {exportError}
            </p>
          )}
        </div>

        {/* ─── Right panel: A4 preview ─── */}
        <div className="lg:col-span-8 min-w-0">
          <div className="text-xs mb-2 px-1" style={{ color: "var(--text-tertiary)" }}>
            Preview
          </div>

          {auditLocked ? (
            <PlanLockedCard feature="latest_audit_summary" />
          ) : brands.length === 0 ? (
            <div
              className="rounded-lg border p-12 text-center"
              style={{ background: "var(--bg-elevated)" }}
            >
              <p className="text-muted-foreground">
                No brands yet. Add a brand and run an audit to generate a report.
              </p>
            </div>
          ) : latest.status === "error" ? (
            <LoadError
              what={`the latest audit for ${currentBrandName}`}
              detail={latest.detail}
              onRetry={latest.retry}
            />
          ) : latest.status === "loading" ? (
            <div
              className="rounded-lg border p-12 text-center"
              style={{ background: "var(--bg-elevated)" }}
            >
              <p className="text-muted-foreground">Loading audit data...</p>
            </div>
          ) : !audit ? (
            <div
              className="rounded-lg border p-12 text-center"
              style={{ background: "var(--bg-elevated)" }}
            >
              <p className="text-muted-foreground">
                No completed audit for {currentBrandName} yet. Run an audit first to generate a
                report.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border bg-white shadow-lg overflow-hidden">
              {/* PDF Header */}
              <div
                className="p-6 flex items-center justify-between"
                style={{ backgroundColor: branding.primaryColor }}
              >
                {/* 2 Nov: as the export prints it (lib/pdf/render.tsx): the
                    agency's logo and name, or "Powered by" alone. */}
                <div className="flex items-center gap-3">
                  {branding.agencyName && branding.logoUrl && (
                    <img
                      src={branding.logoUrl}
                      alt="Logo"
                      className="h-10 w-auto"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <span className="text-white font-semibold">
                    {branding.agencyName || `Powered by ${PRODUCT_NAME}`}
                  </span>
                </div>
                <span className="text-white/70 text-sm">AI Visibility Report</span>
              </div>

              {/* PDF Body */}
              <div className="p-8 space-y-6">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: branding.secondaryColor }}>
                    Visibility Audit Report
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Prepared for: {currentBrandName}</p>
                  <p className="text-xs text-gray-400">
                    Generated: {new Date().toLocaleDateString("en-AU")}
                  </p>
                </div>

                {/* Executive summary */}
                {sections.executive && execSummary && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Executive Summary</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{execSummary}</p>
                  </div>
                )}

                {/* Visibility scorecard */}
                {sections.scorecard && (
                  <>
                    <div className="border rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Visibility</h3>
                      {/* Vunnara (19 Oct): /api/brands/[brandId]/latest-audit's
                          scoreComposite now carries the live HEADLINE (the
                          Frequency DimensionResult -- mention rate, never a
                          blend), and is null when that headline is
                          insufficient_data ("no_answers": zero successful
                          organic answers) -- show that plainly, not "— / 100". */}
                      {audit.scoreComposite == null ? (
                        <p className="text-sm text-gray-500">
                          Not enough data -- no AI answers were returned for this audit.
                        </p>
                      ) : (
                        <div className="flex items-end gap-3">
                          <span
                            className="text-4xl font-bold"
                            style={{ color: branding.accentColor }}
                          >
                            {auditVisibility(audit).value}
                          </span>
                          <span className="text-sm text-gray-500 mb-1">
                            {auditVisibility(audit).detail} answers
                          </span>
                        </div>
                      )}
                      {audit.scoreComposite != null && (
                        <p className="text-xs text-gray-400 mt-1">
                          Share of AI answers that mention {currentBrandName}
                        </p>
                      )}
                      {audit.scoreConfidenceLow && audit.scoreConfidenceHigh && (
                        <p className="text-xs text-gray-400 mt-2">
                          Confidence interval: {parseFloat(audit.scoreConfidenceLow).toFixed(0)}–
                          {parseFloat(audit.scoreConfidenceHigh).toFixed(0)} (95%)
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {dimensions.map((dim) => (
                        <div key={dim.name} className="border rounded p-3">
                          <p className="text-xs text-gray-500">{dim.name}</p>
                          <p
                            className="text-lg font-semibold"
                            style={{ color: branding.secondaryColor }}
                          >
                            {/* Task #46 Phase 2/3: matches lib/pdf/render.tsx's
                                dimValueText -- an insufficient_data dimension (no
                                mentions to measure) never shows a numeric 0, and a
                                not_measured one (Sentiment, Context -- no real
                                classifier exists) says so distinctly. */}
                            {dim.notMeasured
                              ? "Not yet measured"
                              : dim.insufficient
                                ? "N/A — not mentioned"
                                : dim.value}
                          </p>
                          {"detail" in dim && dim.detail && !dim.insufficient && (
                            <p className="text-xs text-gray-400">{dim.detail}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Per-engine breakdown */}
                {sections.engines && engineStats.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      Per-Engine Breakdown
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {engineStats.map((es) => {
                        // Audit #36: k of n successful everyday answers --
                        // the same split the headline sums.
                        const line = engineAnswerLine(es);
                        return (
                          <div key={es.engine} className="border rounded p-3">
                            <p className="text-xs text-gray-500">
                              {ENGINE_DISPLAY_NAMES[
                                es.engine as keyof typeof ENGINE_DISPLAY_NAMES
                              ] ?? es.engine}
                            </p>
                            <p
                              className="text-lg font-semibold"
                              style={{ color: branding.secondaryColor }}
                            >
                              {line.rate ?? "—"}
                            </p>
                            <p className="text-xs text-gray-400">
                              {line.rate ? `mentioned in ${line.counts} answers` : line.counts}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {sections.engines && engineStats.length === 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Per-Engine Breakdown
                    </h3>
                    <p className="text-sm text-gray-400">
                      Per-engine data not available for this audit.
                    </p>
                  </div>
                )}

                {/* Action plan */}
                {sections.actions && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Action Plan</h3>
                    {actions.length > 0 ? (
                      <ul className="space-y-2">
                        {actions.map((item) => (
                          <li
                            key={item.title}
                            className="flex items-start gap-2 text-sm text-gray-600"
                          >
                            <span
                              className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: branding.accentColor }}
                            />
                            <div>
                              <span className="font-medium">{item.title}</span>
                              {item.action && (
                                <span className="text-gray-400"> — {item.action}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400">No open action items for this brand.</p>
                    )}
                  </div>
                )}

                {/* Methodology appendix */}
                {sections.methodology && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Methodology</h3>
                    <div className="text-xs text-gray-500 space-y-2">
                      <p>
                        This report measures AI visibility by querying multiple large language
                        models (ChatGPT, Claude, Gemini, Perplexity) with real user-intent prompts
                        relevant to the brand&apos;s category and region.
                      </p>
                      {/* Vunnara (19 Oct): the headline is the mention rate
                          alone -- no weighted blend -- so the old "~38.5% /
                          ~38.5% / ~23.1%" weights text was no longer true. */}
                      <p>
                        <strong>Visibility Score:</strong> the share of AI answers that mention the
                        brand (Frequency). It is not a weighted blend of the other dimensions.
                      </p>
                      <p>
                        <strong>When you&apos;re mentioned:</strong> Position (where in the response
                        the brand appears) and Source citation (how often answers that mention you
                        cite a source) are shown as supporting detail, measured only over the
                        answers that mention the brand.
                      </p>
                      {/* Task #46 Phase 3, Part C: Sentiment and Context have
                          no real classifier behind them yet -- say so
                          plainly instead of quoting the old nominal 20%/15%
                          weights, which were never backed by real
                          tone/framing analysis (see
                          lib/scoring/dimension-result.ts). Matches
                          lib/pdf/render.tsx's own Methodology section. */}
                      <p>
                        <strong>Not yet measured:</strong> Sentiment (tone of mentions) and Context
                        (recommended vs. listed) are planned but not yet scored.
                      </p>
                      <p>
                        <strong>Confidence:</strong> Scores include a 95% Wilson confidence interval
                        accounting for sample size and response variance. Multiple runs per prompt
                        reduce uncertainty.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* PDF Footer */}
              <div
                className="p-4 text-xs"
                style={{
                  backgroundColor: branding.secondaryColor,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                <p>{branding.footerText || "Confidential"}</p>
                <p className="mt-1">{branding.contactLine || ""}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
