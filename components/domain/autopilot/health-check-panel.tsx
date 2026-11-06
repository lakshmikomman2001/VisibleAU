"use client";

import { ArrowRight, Eye, Globe, MapPin, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { HEADLINE_BAND_LABELS, type HeadlineColorBand } from "@/lib/scoring/headline-color";
import { visibilityColorVar } from "@/lib/scoring/visibility-display";

/**
 * Health Check (7 Nov, Sri's decision 2): three measured checks side by side, each with its own number,
 * method and date, and no combined score. The page used to show a 0-100 "AI Presence" that averaged the
 * Visibility rate, the technical audit's composite and the local trust score -- three different
 * measures, the same problem as the retired composite -- and coloured the Visibility rate with its own
 * 60/30 bands, so 13% was "Critical" here and "developing" on the audit page.
 *
 * - AI presence is the Visibility rate, coloured and named by the Visibility bands
 *   (lib/scoring/headline-color.ts), with its counts and interval.
 * - Site readiness and local authority show their own scores on their own scales, with what each is
 *   built from. Neither has documented colour bands, so neither is coloured.
 * - A check with no result says "Not measured yet", never 0.
 */

export const HEALTH_CHECK_TITLE = "Health Check: AI presence, site readiness and local authority";

export const NOT_MEASURED_YET = "Not measured yet";

/** The technical audit's own description of what it checks (lib/technical-audit/score-aggregator.ts). */
export const SITE_READINESS_METHOD =
  "Eight checks of your site: robots.txt, llms.txt, schema, meta tags, content, brand entity, signals and AI discovery.";

/** What the local trust score is built from (lib/platform/local-ai-trust-scorer.ts). */
export const LOCAL_AUTHORITY_METHOD =
  "Built from your Google Business Profile, directory listings, ABN, name-address-phone consistency and AU directory citations.";

interface TopAction {
  title: string;
  rationale: string;
  expectedImpact: string | null;
  confidenceLabel: string;
  brandId: string;
}

/** The audit's Visibility, as lib/scoring/visibility-display.ts shows it everywhere. */
export interface AiPresenceInput {
  /** "13%", or "—" when the audit had too few answers. */
  value: string;
  /** "2 of 15", or why there's no value. */
  detail: string;
  band: HeadlineColorBand | null;
  /** The 95% interval, when there's a value. */
  ci: { lower: number; upper: number } | null;
}

export interface MeasuredScore {
  score: number;
  max: number;
  /** When it was measured, e.g. "3 Nov". */
  on: string;
}

export interface HealthCheckData {
  brandName: string;
  auditDate: string;
  engineCount: number;
  isSaas: boolean;
  aiPresence: AiPresenceInput;
  /** null: no technical audit yet. */
  siteReadiness: MeasuredScore | null;
  /** null: not scored yet. Never shown for a SaaS brand (not a local business). */
  localAuthority: MeasuredScore | null;
  topAction: TopAction | null;
}

export interface HealthCard {
  key: "ai_presence" | "site_readiness" | "local_authority";
  name: string;
  /** "13%", "64 of 98"; null when not measured. */
  value: string | null;
  /** The counts or the date, or why there's no value. */
  detail: string;
  /** What the number is built from. */
  method: string;
  /** Only AI presence has bands: the Visibility bands. */
  band: { label: string; color: string } | null;
}

function scoreCard(
  key: "site_readiness" | "local_authority",
  name: string,
  method: string,
  measured: MeasuredScore | null,
  verb: string,
): HealthCard {
  return measured
    ? {
        key,
        name,
        value: `${Math.round(measured.score)} of ${measured.max}`,
        detail: `${verb} ${measured.on}`,
        method,
        band: null,
      }
    : { key, name, value: null, detail: NOT_MEASURED_YET, method, band: null };
}

/** The cards, in order. Pure, so the page and its tests build exactly the same thing. */
export function buildHealthCheckCards(data: HealthCheckData): HealthCard[] {
  const presence = data.aiPresence;
  const measured = presence.value !== "—" && presence.band !== null;
  const cards: HealthCard[] = [
    {
      key: "ai_presence",
      name: "AI presence",
      value: measured ? presence.value : null,
      detail: measured
        ? `Named in ${presence.detail} answers to everyday questions` +
          (presence.ci
            ? ` · 95% CI ${presence.ci.lower.toFixed(0)}–${presence.ci.upper.toFixed(0)}%`
            : "")
        : presence.detail,
      method: "Your Visibility in the latest audit: how often AI answers named your business.",
      band:
        measured && presence.band
          ? { label: HEADLINE_BAND_LABELS[presence.band], color: visibilityColorVar(presence.band) }
          : null,
    },
    scoreCard(
      "site_readiness",
      "Site readiness (technical checks)",
      SITE_READINESS_METHOD,
      data.siteReadiness,
      "Checked",
    ),
  ];
  if (!data.isSaas) {
    cards.push(
      scoreCard(
        "local_authority",
        "Local authority",
        LOCAL_AUTHORITY_METHOD,
        data.localAuthority,
        "Scored",
      ),
    );
  }
  return cards;
}

const CARD_ICONS: Record<HealthCard["key"], ReactNode> = {
  ai_presence: <Eye size={13} />,
  site_readiness: <Globe size={13} />,
  local_authority: <MapPin size={13} />,
};

export function HealthCheckPanel({ data }: { data: HealthCheckData }) {
  const { topAction, brandName, auditDate, engineCount } = data;
  const cards = buildHealthCheckCards(data);

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
          <span className="text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
            {HEALTH_CHECK_TITLE}
          </span>
        </div>
        <h1 className="text-3xl font-semibold mb-2" style={{ color: "#fff" }}>
          {brandName}&apos;s Health Check
        </h1>
        <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.7)" }}>
          Each check is measured on its own, with no combined score · latest audit across{" "}
          {engineCount} AI engines · {auditDate}
        </p>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
        {/* The measured checks, side by side */}
        <div
          className={`grid gap-3 mb-8 grid-cols-1 sm:grid-cols-2 ${cards.length === 3 ? "lg:grid-cols-3" : ""}`}
        >
          {cards.map((card) => (
            <div
              key={card.key}
              data-health-card={card.key}
              className="rounded-xl p-4"
              style={{
                background: "var(--bg-elevated)",
                border: card.band
                  ? `1px solid color-mix(in srgb, ${card.band.color} 25%, transparent)`
                  : "1px solid var(--border-default)",
              }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span style={{ color: card.band?.color ?? "var(--text-tertiary)" }}>
                  {CARD_ICONS[card.key]}
                </span>
                <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                  {card.name}
                </span>
              </div>
              <div
                className="text-2xl font-semibold tabular-nums"
                style={{
                  color:
                    card.value === null
                      ? "var(--text-tertiary)"
                      : (card.band?.color ?? "var(--text-primary)"),
                  fontFamily: "var(--font-mono)",
                }}
              >
                {card.value ?? "—"}
              </div>
              {card.band && (
                <div
                  className="text-[11px] font-semibold mt-0.5"
                  style={{ color: card.band.color }}
                >
                  {card.band.label}
                </div>
              )}
              <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                {card.detail}
              </div>
              <div className="text-[10px] mt-2" style={{ color: "var(--text-tertiary)" }}>
                {card.method}
              </div>
            </div>
          ))}
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
              <Sparkles size={16} style={{ color: "var(--accent-blue, #3b82f6)" }} />
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
            <div className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
              {topAction.rationale}
            </div>
            <div className="flex items-center gap-4">
              {topAction.expectedImpact && (
                <div
                  className="flex items-center gap-1.5 text-[13px]"
                  style={{ color: "var(--success)" }}
                >
                  <TrendingUp size={14} />
                  <span className="font-medium">{topAction.expectedImpact}</span>
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
