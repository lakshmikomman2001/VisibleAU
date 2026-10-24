"use client";

import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { engineAnswerLine, positionCard, sourceCitationCard } from "@/lib/scoring/measured-display";

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

export default function PdfBuilderPage() {
  const [branding, setBranding] = useState<BrandingData>({
    logoUrl: "",
    primaryColor: "#0066CC",
    secondaryColor: "#1A1A1A",
    accentColor: "#FF6B35",
    footerText: "",
    contactLine: "",
    agencyName: "",
  });
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [engineStats, setEngineStats] = useState<EngineStat[]>([]);
  const [priorAudit, setPriorAudit] = useState<PriorAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sections, setSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_SECTIONS.map((s) => [s.key, s.default])),
  );

  useEffect(() => {
    Promise.all([
      fetch("/api/agency/branding").then((r) => r.json()),
      fetch("/api/brands").then((r) => r.json()),
    ])
      .then(([brandingData, brandsData]) => {
        if (brandingData?.branding) {
          const b = brandingData.branding;
          setBranding({
            logoUrl: b.logoUrl ?? "",
            primaryColor: b.primaryColor ?? "#0066CC",
            secondaryColor: b.secondaryColor ?? "#1A1A1A",
            accentColor: b.accentColor ?? "#FF6B35",
            footerText: b.footerText ?? "",
            contactLine: b.contactLine ?? "",
            agencyName: b.agencyName ?? "",
          });
        }
        const brandList = Array.isArray(brandsData) ? brandsData : brandsData.brands || [];
        setBrands(brandList);
        if (brandList.length > 0) {
          setSelectedBrand(brandList[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const fetchAudit = useCallback((brandId: string) => {
    if (!brandId) return;
    setAuditLoading(true);
    fetch(`/api/brands/${brandId}/latest-audit`)
      .then((r) => r.json())
      .then((data) => {
        setAudit(data.audit ?? null);
        setActions(data.actionItems ?? []);
        setEngineStats(data.engineStats ?? []);
        setPriorAudit(data.priorAudit ?? null);
      })
      .catch(() => {
        setAudit(null);
        setActions([]);
        setEngineStats([]);
        setPriorAudit(null);
      })
      .finally(() => setAuditLoading(false));
  }, []);

  useEffect(() => {
    if (selectedBrand) fetchAudit(selectedBrand);
  }, [selectedBrand, fetchAudit]);

  const handleExport = async () => {
    if (!audit) return;
    setExporting(true);
    try {
      const sectionKeys = Object.entries(sections)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(",");
      const res = await fetch(`/api/audits/${audit.id}/export?format=pdf&sections=${sectionKeys}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-report-${audit.auditNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
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
  const insufficientData = Number(audit?.scoreFrequency ?? 0) === 0;

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
        value: score(audit?.scoreFrequency ?? null),
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

    if (priorAudit?.scoreComposite) {
      const prior = parseFloat(priorAudit.scoreComposite);
      const delta = composite - prior;
      const direction = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";
      const abs = Math.abs(delta).toFixed(1);
      parts.push(
        `${currentBrandName}'s AI visibility is ${composite.toFixed(1)}/100, ${direction} ${abs} points since ${formatDate(priorAudit.completedAt)}.`,
      );
    } else {
      parts.push(
        `${currentBrandName}'s current AI visibility score is ${composite.toFixed(1)}/100.`,
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

  const breadcrumbs = useMemo(() => ["Agency", "Reports", "PDF Builder"], []);

  if (loading) {
    return (
      <div className="p-8">
        <SetBreadcrumbs crumbs={breadcrumbs} />
        <p className="text-muted-foreground">Loading PDF builder...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <SetBreadcrumbs crumbs={breadcrumbs} />

      <h1 className="text-2xl font-semibold">White-Label Report Builder</h1>

      <div className="grid grid-cols-12 gap-4">
        {/* ─── Left panel: controls ─── */}
        <div className="col-span-4 space-y-4">
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

          {/* Branding inputs */}
          <div
            className="rounded-lg border p-4 space-y-3"
            style={{ background: "var(--bg-elevated)" }}
          >
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Branding
            </h2>
            <label className="block">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Agency name
              </span>
              <input
                type="text"
                value={branding.agencyName}
                onChange={(e) => setBranding((b) => ({ ...b, agencyName: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  borderColor: "var(--border-default)",
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Logo URL
              </span>
              <input
                type="text"
                value={branding.logoUrl}
                onChange={(e) => setBranding((b) => ({ ...b, logoUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  borderColor: "var(--border-default)",
                }}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Primary colour
              </span>
              <input
                type="color"
                value={branding.primaryColor}
                onChange={(e) => setBranding((b) => ({ ...b, primaryColor: e.target.value }))}
                className="w-8 h-8 rounded border-0 cursor-pointer"
              />
            </label>
            <label className="block">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Footer contact
              </span>
              <input
                type="text"
                value={branding.contactLine}
                onChange={(e) => setBranding((b) => ({ ...b, contactLine: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  borderColor: "var(--border-default)",
                }}
              />
            </label>
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
        </div>

        {/* ─── Right panel: A4 preview ─── */}
        <div className="col-span-8">
          <div className="text-xs mb-2 px-1" style={{ color: "var(--text-tertiary)" }}>
            Preview
          </div>

          {auditLoading ? (
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
                <div className="flex items-center gap-3">
                  {branding.logoUrl ? (
                    <img
                      src={branding.logoUrl}
                      alt="Logo"
                      className="h-10 w-auto"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-white/20" />
                  )}
                  <span className="text-white font-semibold">
                    {branding.agencyName || currentBrandName}
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
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Visibility Score</h3>
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
                            {score(audit.scoreComposite)}
                          </span>
                          <span className="text-sm text-gray-500 mb-1">/ 100</span>
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
