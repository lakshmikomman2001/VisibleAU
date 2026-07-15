"use client";

import {
  ThumbsUp,
  Eye,
  Globe,
  MapPin,
  Sparkles,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export type HealthStatus = "green" | "amber" | "red" | "unmeasured";

interface HealthDimension {
  name: string;
  score: number;
  status: HealthStatus;
  icon: React.ReactNode;
  label: string;
  pending?: boolean;
}

interface TopAction {
  title: string;
  rationale: string;
  expectedImpact: string | null;
  confidenceLabel: string;
  brandId: string;
}

interface HealthCheckData {
  overallScore: number;
  overallStatus: HealthStatus;
  overallLabel: string;
  dimensions: HealthDimension[];
  topAction: TopAction | null;
  brandName: string;
  auditDate: string;
  engineCount: number;
  isSaas: boolean;
}

const STATUS_COLORS: Record<HealthStatus, string> = {
  green: "var(--health-great, var(--success))",
  amber: "var(--health-moderate, var(--warning))",
  red: "var(--health-poor, var(--danger))",
  unmeasured: "var(--text-tertiary)",
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  green: "Good",
  amber: "Needs work",
  red: "Critical",
  unmeasured: "Not yet measured",
};

export function classifyScore(
  score: number | null | undefined,
  thresholds: { green: number; amber: number },
): HealthStatus {
  if (score == null || Number.isNaN(score)) return "unmeasured";
  if (score >= thresholds.green) return "green";
  if (score >= thresholds.amber) return "amber";
  return "red";
}

export function buildDimensions(
  sentimentScore: number | null,
  frequencyScore: number | null,
  siteReadinessScore: number | null,
  localAuthorityScore: number | null,
  isSaas: boolean,
): HealthDimension[] {
  const raw: { name: string; score: number | null; thresholds: { green: number; amber: number }; icon: React.ReactNode }[] = [
    { name: "AI Sentiment", score: sentimentScore, thresholds: { green: 70, amber: 40 }, icon: <ThumbsUp size={13} /> },
    { name: "AI Presence", score: frequencyScore, thresholds: { green: 60, amber: 30 }, icon: <Eye size={13} /> },
    { name: "Site Readiness", score: siteReadinessScore, thresholds: { green: 75, amber: 45 }, icon: <Globe size={13} /> },
  ];

  if (!isSaas) {
    raw.push({ name: "Local Authority", score: localAuthorityScore, thresholds: { green: 70, amber: 40 }, icon: <MapPin size={13} /> });
  }

  return raw.map((d) => {
    const status = classifyScore(d.score != null ? Number(d.score) : null, d.thresholds);
    const pending = status === "unmeasured";
    return {
      name: d.name,
      score: Number(d.score ?? 0),
      status,
      icon: d.icon,
      label: pending ? "Not yet measured" : STATUS_LABELS[status],
      pending,
    };
  });
}

export function HealthCheckPanel({ data }: { data: HealthCheckData }) {
  const { dimensions, topAction, brandName, auditDate, engineCount, overallScore, overallStatus, overallLabel } =
    data;

  const statusColor = STATUS_COLORS[overallStatus];

  return (
    <div>
      {/* Hero banner */}
      <div
        className="px-8 py-10 text-center motion-safe:animate-gradient-shift"
        style={{
          background:
            "var(--autopilot-gradient, linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa))",
          backgroundSize: "200% auto",
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <Eye size={20} style={{ color: "rgba(255,255,255,0.8)" }} />
          <span
            className="text-[13px] font-medium"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            AI Visibility Health Check
          </span>
        </div>
        <h1 className="text-3xl font-semibold mb-2" style={{ color: "#fff" }}>
          {brandName}&apos;s AI Presence
        </h1>
        <p
          className="text-[14px]"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          Based on your latest audit across {engineCount} AI engines · {auditDate}
        </p>

        <div className="flex flex-col items-center mt-8">
          <div
            className="w-24 h-24 rounded-full flex flex-col items-center justify-center"
            style={{
              border: "3px solid rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.1)",
            }}
          >
            <span
              className="text-3xl font-semibold tabular-nums"
              style={{ color: "#fff", fontFamily: "var(--font-mono)" }}
            >
              {Math.round(overallScore)}
            </span>
            <span
              className="text-[10px]"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              /100
            </span>
          </div>
          <span
            className="mt-3 text-[12px] font-medium px-3 py-1 rounded-full"
            style={{
              background:
                overallStatus === "red"
                  ? "rgba(239,68,68,0.2)"
                  : overallStatus === "amber"
                    ? "rgba(245,158,11,0.2)"
                    : "rgba(34,197,94,0.2)",
              color:
                overallStatus === "red"
                  ? "#fca5a5"
                  : overallStatus === "amber"
                    ? "#fcd34d"
                    : "#86efac",
            }}
          >
            {overallLabel}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
        {/* Dimension cards */}
        <div
          className="grid gap-3 mb-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        >
          {dimensions.map((d) => {
            const color = STATUS_COLORS[d.status];
            if (d.pending) {
              return (
                <div
                  key={d.name}
                  className="rounded-xl p-4 text-center"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-muted, rgba(128,128,128,0.15))",
                    opacity: 0.7,
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <span style={{ color: "var(--text-tertiary)" }}>{d.icon}</span>
                  </div>
                  <div
                    className="text-[12px] font-medium mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {d.name}
                  </div>
                  <div
                    className="text-lg font-medium"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    &mdash;
                  </div>
                  <div
                    className="text-[10px] mt-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {d.label}
                  </div>
                </div>
              );
            }
            return (
              <div
                key={d.name}
                className="rounded-xl p-4 text-center"
                style={{
                  background: "var(--bg-elevated)",
                  border: `1px solid color-mix(in srgb, ${color} 19%, transparent)`,
                }}
              >
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: color }}
                  />
                  <span style={{ color }}>{d.icon}</span>
                </div>
                <div
                  className="text-[12px] font-medium mb-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  {d.name}
                </div>
                <div
                  className="text-2xl font-semibold tabular-nums"
                  style={{ color, fontFamily: "var(--font-mono)" }}
                >
                  {Math.round(d.score)}
                </div>
                <div
                  className="text-[10px] mt-1"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {d.label}
                </div>
                <div
                  className="h-1 rounded-full mt-2 overflow-hidden"
                  style={{ background: "var(--bg-hover)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(d.score, 100)}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* #1 recommended action */}
        {topAction && (
          <div
            className="rounded-xl p-6 mb-6"
            style={{
              border: "2px solid var(--accent-blue, #3b82f6)",
              background: "var(--bg-elevated)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles
                size={16}
                style={{ color: "var(--accent-blue, #3b82f6)" }}
              />
              <span
                className="text-[12px] font-semibold"
                style={{ color: "var(--accent-blue, #3b82f6)" }}
              >
                Your #1 recommended action
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: "var(--accent-muted)",
                  color: "var(--text-tertiary)",
                }}
              >
                {topAction.confidenceLabel}
              </span>
            </div>
            <div
              className="text-base font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              {topAction.title}
            </div>
            <div
              className="text-[13px] mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              {topAction.rationale}
            </div>
            <div className="flex items-center gap-4">
              {topAction.expectedImpact && (
                <div
                  className="flex items-center gap-1.5 text-[13px]"
                  style={{ color: "var(--success)" }}
                >
                  <TrendingUp size={14} />
                  <span className="font-medium">
                    {topAction.expectedImpact}
                  </span>
                </div>
              )}
            </div>
            <Link
              href={`/brands/${topAction.brandId}/autopilot`}
              className="inline-flex items-center gap-1 mt-4 text-[13px] font-medium"
              style={{ color: "var(--accent-blue, #3b82f6)" }}
            >
              Start this action <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* CTA */}
        <div className="flex gap-3 flex-wrap">
          <Link
            href={topAction ? `/brands/${topAction.brandId}/autopilot` : "#"}
            className="h-10 px-6 text-[14px] font-medium rounded-lg flex items-center gap-2"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
            }}
          >
            Start improving
          </Link>
        </div>
      </div>
    </div>
  );
}
