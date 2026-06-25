"use client";

import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";

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
  scorePosition: string | null;
  scoreSentimentNumeric: string | null;
  scoreContextNumeric: string | null;
  scoreAccuracy: string | null;
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
  total: number;
  mentioned: string;
  avgPosition: string | null;
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
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
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

  const currentBrandName =
    brands.find((b) => b.id === selectedBrand)?.name || "Selected Brand";

  const score = useCallback(
    (v: string | null) => (v != null ? parseFloat(v).toFixed(1) : "—"),
    [],
  );

  const dimensions = useMemo(
    () => [
      { name: "Frequency", value: score(audit?.scoreFrequency ?? null) },
      { name: "Position", value: score(audit?.scorePosition ?? null) },
      { name: "Sentiment", value: score(audit?.scoreSentimentNumeric ?? null) },
      { name: "Accuracy", value: score(audit?.scoreAccuracy ?? null) },
    ],
    [audit, score],
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
      parts.push(`${currentBrandName}'s current AI visibility score is ${composite.toFixed(1)}/100.`);
    }

    const dimScores = [
      { name: "Frequency", val: audit.scoreFrequency },
      { name: "Position", val: audit.scorePosition },
      { name: "Sentiment", val: audit.scoreSentimentNumeric },
      { name: "Accuracy", val: audit.scoreAccuracy },
    ].filter((d) => d.val != null);

    if (dimScores.length > 1) {
      const sorted = [...dimScores].sort((a, b) => parseFloat(b.val!) - parseFloat(a.val!));
      const strongest = sorted[0];
      const weakest = sorted[sorted.length - 1];
      if (parseFloat(strongest.val!) === parseFloat(weakest.val!)) {
        parts.push(`All dimensions scored equally (${parseFloat(strongest.val!).toFixed(1)}).`);
      } else {
        parts.push(
          `Strongest dimension: ${strongest.name} (${parseFloat(strongest.val!).toFixed(1)}). Weakest: ${weakest.name} (${parseFloat(weakest.val!).toFixed(1)}).`,
        );
      }
    }

    if (actions.length > 0) {
      parts.push(`${actions.length} open recommendation${actions.length > 1 ? "s" : ""} identified.`);
    }

    return parts.join(" ");
  }, [audit, priorAudit, actions, currentBrandName]);

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
                  onChange={(e) =>
                    setSections((prev) => ({ ...prev, [s.key]: e.target.checked }))
                  }
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
          <div
            className="text-xs mb-2 px-1"
            style={{ color: "var(--text-tertiary)" }}
          >
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
                  <h2
                    className="text-xl font-bold"
                    style={{ color: branding.secondaryColor }}
                  >
                    Visibility Audit Report
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Prepared for: {currentBrandName}
                  </p>
                  <p className="text-xs text-gray-400">
                    Generated: {new Date().toLocaleDateString("en-AU")}
                  </p>
                </div>

                {/* Executive summary */}
                {sections.executive && execSummary && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Executive Summary
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{execSummary}</p>
                  </div>
                )}

                {/* Visibility scorecard */}
                {sections.scorecard && (
                  <>
                    <div className="border rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">
                        Composite Visibility Score
                      </h3>
                      <div className="flex items-end gap-3">
                        <span
                          className="text-4xl font-bold"
                          style={{ color: branding.accentColor }}
                        >
                          {score(audit.scoreComposite)}
                        </span>
                        <span className="text-sm text-gray-500 mb-1">/ 100</span>
                      </div>
                      {audit.scoreConfidenceLow && audit.scoreConfidenceHigh && (
                        <p className="text-xs text-gray-400 mt-2">
                          Confidence interval: {parseFloat(audit.scoreConfidenceLow).toFixed(0)}–{parseFloat(audit.scoreConfidenceHigh).toFixed(0)} (95%)
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
                            {dim.value}
                          </p>
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
                        const mentionRate =
                          es.total > 0
                            ? ((parseInt(es.mentioned) / es.total) * 100).toFixed(0)
                            : "0";
                        return (
                          <div key={es.engine} className="border rounded p-3">
                            <p className="text-xs text-gray-500 capitalize">
                              {es.engine.replace(/-/g, " ")}
                            </p>
                            <p
                              className="text-lg font-semibold"
                              style={{ color: branding.secondaryColor }}
                            >
                              {mentionRate}%
                            </p>
                            <p className="text-xs text-gray-400">
                              mention rate
                              {es.avgPosition ? ` · avg pos ${es.avgPosition}` : ""}
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
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Action Plan
                    </h3>
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
                      <p className="text-sm text-gray-400">
                        No open action items for this brand.
                      </p>
                    )}
                  </div>
                )}

                {/* Methodology appendix */}
                {sections.methodology && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Methodology
                    </h3>
                    <div className="text-xs text-gray-500 space-y-2">
                      <p>
                        This report measures AI visibility by querying multiple large language models
                        (ChatGPT, Claude, Gemini, Perplexity) with real user-intent prompts relevant
                        to the brand&apos;s category and region.
                      </p>
                      <p>
                        <strong>Scoring dimensions:</strong> Frequency (how often the brand is
                        mentioned, 25%), Position (where in the response, 25%), Sentiment (how
                        positively framed, 20%), Context (recommendation strength, 15%), Accuracy
                        (factual correctness of citations, 15%).
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
