import {
  Circle,
  Defs,
  Document,
  G,
  Image,
  Line,
  LinearGradient,
  Page,
  Path,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { engineNameList } from "@/lib/audit/engine-failure";
import { BRAND_MARK } from "@/lib/brand";
import { directoryProfileStatus } from "@/lib/directories/profile-status";
import { DIRECTORY_KIND_LABELS } from "@/lib/directories/registry";
import { modelDriftNote } from "@/lib/llm/model-drift";
import { PRODUCT_NAME } from "@/lib/product";
import { HEADLINE_COLOR_THRESHOLDS, shownHeadlineBand } from "@/lib/scoring/headline-color";
import { engineRowDisplay, positionCard, sourceCitationCard } from "@/lib/scoring/measured-display";
import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";
import { EVIDENCE_ARCHIVE_SENTENCE } from "@/lib/trust/evidence-archiver";
import { formatSharePercent } from "@/lib/visibility/share-of-voice-display";
import { type AgencyLogo, agencyInitials } from "../agency-branding";
import {
  BEYOND_FOOTER,
  type BeyondAiAnswers,
  type BeyondTileView,
  type BeyondTone,
  beyondTileViews,
  directoriesLines,
  formatCheckDate,
} from "../beyond-ai";
import { orderOtherActions, type WhatToDoNext } from "../report-contents";
import type { ReportData, ReportMatrixRow, ReportTrendPoint } from "../report-data";
import {
  type EvidenceTone,
  type Finding,
  reportFindings,
  shownFindings,
  withAction,
} from "../report-findings";
import {
  answeringEngineNames,
  basisReasonText,
  citedDirectories,
  coverageLine,
  excludedAuditsMethodItem,
  googlePlaceLine,
  headlineFigures,
  locationText,
  periodFull,
  periodTitle,
  plural,
  trendComparisonLine,
  trendNoteLines,
  trendPointHollow,
  trendPointLabel,
} from "../report-format";
import { countWord, reportNarrative } from "../report-narrative";
import { reportDate, reportDateTime, reportShortDate } from "../report-period";
import { questionMixLine, type ReportDataV2 } from "../report-snapshot";
import { BAND, C, COVER_BAND, ENGINE_DOT, FONT, PAGE, px } from "./tokens";

/**
 * DEMO-BLOCKER (1 Nov), part 4 -- the report PDF, implementing the
 * approved prototype (docs/design/report-pdf-prototype.html) in react-pdf:
 * 1 Cover, 2 Executive summary, 3 Engine by engine, 4 Where AI looks,
 * 5 Diagnosis, 6 Over time + Recommended next, 7 Method and notes. Every
 * figure comes from ReportData (the audit page's resolvers), every
 * sentence from lib/reports/report-format.ts, report-findings.ts and the
 * grounded narrative. Components are plain functions of their props.
 */

export const MATRIX_ROWS_PER_PAGE = 15;
const MATRIX_ROWS_CONTINUED = 30;
const CONTENT_W = 794 - 112; // px between the page's side paddings

// ---------------------------------------------------------------- helpers

function ls(fontSizePx: number, em: number): number {
  return px(fontSizePx) * em;
}

/** A label with its first letter capitalised (the Method line: methodologyLabel's text). */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "2m 55s" from the audit's start and completion. */
function duration(startedAt: string | null, completedAt: string): string | null {
  if (!startedAt) return null;
  const seconds = Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** The product's own address for the cover, when it's a real https one. */
function productHost(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (!base) return null;
  try {
    const url = new URL(base);
    return url.protocol === "https:" ? url.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** "**bold** text" -> runs, for the narrative's emphasis. */
function Rich({ text, bold }: { text: string; bold: Record<string, string | number> }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sentence's runs
          <Text key={i} style={bold}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          part
        ),
      )}
    </>
  );
}

// ----------------------------------------------------------------- styles

const s = {
  page: {
    paddingTop: PAGE.padTop,
    paddingHorizontal: PAGE.padX,
    paddingBottom: PAGE.padBottom,
    fontFamily: FONT.body,
    fontSize: px(12),
    color: C.ink,
    backgroundColor: C.white,
  },
  eyebrow: {
    fontSize: px(9.5),
    fontWeight: 600,
    letterSpacing: ls(9.5, 0.14),
    textTransform: "uppercase" as const,
    color: C.brand,
  },
  h2: {
    fontFamily: FONT.display,
    fontSize: px(22),
    lineHeight: 28 / 22,
    fontWeight: 600,
    letterSpacing: ls(22, -0.015),
    color: C.navy900,
    marginTop: px(6),
  },
  h3: { fontSize: px(13), lineHeight: 18 / 13, fontWeight: 600, color: C.navy900 },
  lede: {
    fontSize: px(12),
    lineHeight: 19 / 12,
    color: C.ink2,
    marginTop: px(8),
    maxWidth: px(560),
  },
  cap: { fontSize: px(9), lineHeight: 13 / 9, color: C.ink3 },
  rule: { height: 0.75, backgroundColor: C.line, marginVertical: px(22) },
  tile: {
    backgroundColor: C.surface,
    borderWidth: 0.75,
    borderColor: C.line,
    borderStyle: "solid" as const,
    borderRadius: px(12),
    padding: px(14),
  },
  tileK: {
    fontSize: px(9),
    fontWeight: 600,
    letterSpacing: ls(9, 0.08),
    textTransform: "uppercase" as const,
    color: C.ink3,
  },
  tileV: {
    fontFamily: FONT.display,
    fontSize: px(26),
    lineHeight: 32 / 26,
    fontWeight: 700,
    letterSpacing: ls(26, -0.02),
    color: C.navy900,
    marginTop: px(6),
  },
  tileSmall: { fontSize: px(13), fontWeight: 600, color: C.ink3, letterSpacing: 0 },
  tileD: { fontSize: px(9.5), lineHeight: 13 / 9.5, color: C.ink2, marginTop: px(4) },
  bar: {
    height: px(12),
    borderRadius: px(6),
    backgroundColor: C.surface2,
    overflow: "hidden" as const,
  },
  pill: {
    fontSize: px(9),
    fontWeight: 600,
    borderRadius: 999,
    paddingVertical: px(3),
    paddingHorizontal: px(8),
    textAlign: "center" as const,
  },
};

// ------------------------------------------------------------ shared parts

/** The mark (lib/brand.ts): the same square and letter as the app, the icons and the emails. */
function Mark({ size }: { size: number }) {
  const box = BRAND_MARK.viewBox;
  return (
    <Svg width={px(size)} height={px(size)} viewBox={`0 0 ${box} ${box}`}>
      <Rect x={0} y={0} width={box} height={box} rx={BRAND_MARK.radius} fill={C.brand} />
      <Path d={BRAND_MARK.glyphPath} fill={C.white} />
    </Svg>
  );
}

function RunningHeader({ title }: { title: string }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: px(40),
        paddingHorizontal: PAGE.padX,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 0.75,
        borderBottomColor: C.line,
        borderBottomStyle: "solid",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: px(8) }}>
        <Mark size={18} />
        <Text
          style={{ fontSize: px(11), fontWeight: 700, color: C.ink, letterSpacing: ls(11, 0.02) }}
        >
          {PRODUCT_NAME}
        </Text>
      </View>
      {/* 14 Nov, part 4: a long brand name narrows the title to one line, never past the page edge. */}
      <Text
        style={{
          flexShrink: 1,
          marginLeft: px(16),
          maxLines: 1,
          textOverflow: "ellipsis",
          textAlign: "right",
          fontSize: px(9),
          letterSpacing: ls(9, 0.08),
          textTransform: "uppercase",
          color: C.ink3,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

export function RunningFooter({ left }: { left: string }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: px(44),
        paddingHorizontal: PAGE.padX,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderTopWidth: 0.75,
        borderTopColor: C.line,
        borderTopStyle: "solid",
      }}
    >
      <Text style={{ fontSize: px(8.5), color: C.ink3, maxWidth: px(560) }}>{left}</Text>
      <Text
        style={{ fontSize: px(8.5), color: C.ink3 }}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

type IconName = "grid" | "search" | "trend" | "check" | "list";
const ICON_PATHS: Record<IconName, string[]> = {
  grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  search: ["M18 11a7 7 0 1 1-14 0a7 7 0 0 1 14 0z", "M21 21l-4.3-4.3"],
  trend: ["M3 17l6-6 4 4 8-8"],
  check: ["M9 11l3 3 8-8", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
};

function SectionLabel({
  icon,
  eyebrow,
  provenance,
}: {
  icon: IconName | null;
  eyebrow: string;
  provenance: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: px(8) }}>
      {icon && (
        <View
          style={{
            width: px(22),
            height: px(22),
            borderRadius: px(6),
            backgroundColor: C.brandSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg width={px(12)} height={px(12)} viewBox="0 0 24 24">
            {ICON_PATHS[icon].map((d) => (
              <Path key={d} d={d} fill="none" stroke={C.brand} strokeWidth={2} />
            ))}
          </Svg>
        </View>
      )}
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text
        style={{
          marginLeft: "auto",
          fontSize: px(8),
          fontWeight: 700,
          letterSpacing: ls(8, 0.08),
          textTransform: "uppercase",
          borderRadius: px(4),
          paddingVertical: px(3),
          paddingHorizontal: px(7),
          backgroundColor: C.provBg,
          color: C.provText,
          borderWidth: 0.75,
          borderColor: C.provBorder,
          borderStyle: "solid",
        }}
      >
        {provenance}
      </Text>
    </View>
  );
}

/** A hatched bar for an answer that errored: the prototype's 135deg stripes. */
function Hatch({ width, height, stripe }: { width: number; height: number; stripe: number }) {
  const lines: ReactNode[] = [];
  for (let x = -height; x < width + height; x += stripe * 2) {
    lines.push(
      <Line
        key={x}
        x1={x}
        y1={height}
        x2={x + height}
        y2={0}
        stroke={C.lowStripe}
        strokeWidth={stripe * 0.7}
      />,
    );
  }
  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill={C.lowSoft} />
      {lines}
    </Svg>
  );
}

// ------------------------------------------------------------------ plan

export interface ReportPlan {
  summary: string;
  engines: string;
  /** 14 Nov, part 3: "03 · Google Search AI" when the basis audit ran with Google. */
  google: string | null;
  directories: string;
  diagnosis: string | null;
  /** S01 part 7: "Why, and what to do next" (Standard and Enhanced; replaces diagnosis). */
  next: string | null;
  /** S01 part 7: "Beyond AI answers" (Enhanced). */
  beyond: string | null;
  trend: string | null;
  recommended: string | null;
  method: string | null;
}

/** Section numbers ("01"...) for the sections this report includes. */
export function reportPlan(data: ReportDataV2, findings: Finding[]): ReportPlan {
  let n = 0;
  const next = () => String(++n).padStart(2, "0");
  // S01 part 7 (LLD 8.1.7, appendix D): the tier's page set, derived on the server (report-tiers.ts pagesForTier).
  // Without report v2 contents, today's pages.
  const pages = data.v2?.sections ?? null;
  const has = (key: string) => pages === null || pages.includes(key as never);
  const summary = next();
  const engines = next();
  const google = data.google ? next() : null;
  const directories = next();
  const diagnosis = data.sections.diagnosis && has("diagnosis") ? next() : null;
  const nextSteps = pages?.includes("next") ? next() : null;
  // S01C part 3c (LLD amendment 62; contract v1.6 P09): Over time, then Beyond AI answers (Enhanced), then Method and
  // notes. Beyond first left the real Enhanced report with a page holding only the over-time chart.
  const trend = data.sections.trend ? next() : null;
  const beyond = pages?.includes("beyond_ai") && data.v2?.beyondAi ? next() : null;
  // S01C part 2b: only findings with an action are listed (an engine that cited no directory has none).
  const recommended =
    data.sections.recommended_next && withAction(findings).length > 0 && has("recommended")
      ? next()
      : null;
  const method = data.sections.method ? next() : null;
  return {
    summary,
    engines,
    google,
    directories,
    diagnosis,
    next: nextSteps,
    beyond,
    trend,
    recommended,
    method,
  };
}

interface Ctx {
  data: ReportDataV2;
  findings: Finding[];
  plan: ReportPlan;
  basisProv: string;
  runningTitle: string;
  footerLeft: string;
  generated: string;
}

// ------------------------------------------------------------------ cover

/**
 * The cover's top bar: the agency's logo (or initials tile) and name --
 * only when there's an agency name -- and "Powered by Vunnara". 2 Nov:
 * also drawn by Account -> Report branding's preview
 * (BrandingPreviewDocument), so what's previewed is this component.
 */
export function CoverTopBar({
  agencyName,
  logo,
}: {
  agencyName: string | null;
  logo: AgencyLogo | null;
}) {
  return (
    <View
      style={{
        position: "absolute",
        top: px(48),
        left: PAGE.padX,
        right: PAGE.padX,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        color: C.white,
        fontFamily: FONT.body,
      }}
    >
      {agencyName ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: px(10) }}>
          {logo ? (
            <Image
              src={{ data: logo.data, format: logo.format }}
              style={{ width: px(30), height: px(30), borderRadius: px(8), objectFit: "contain" }}
            />
          ) : (
            <View style={{ width: px(30), height: px(30) }}>
              <Svg width={px(30)} height={px(30)} style={{ position: "absolute", top: 0, left: 0 }}>
                <Defs>
                  <LinearGradient id="agency" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#A855F7" />
                    <Stop offset="1" stopColor="#EC4899" />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={px(30)} height={px(30)} rx={px(8)} fill="url(#agency)" />
              </Svg>
              <Text
                style={{
                  position: "absolute",
                  top: px(8),
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  fontSize: px(12),
                  fontWeight: 700,
                }}
              >
                {agencyInitials(agencyName)}
              </Text>
            </View>
          )}
          <Text style={{ fontSize: px(13), fontWeight: 600 }}>{agencyName}</Text>
        </View>
      ) : (
        <View />
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: px(6) }}>
        <Text style={{ fontSize: px(9.5), color: C.coverMuted }}>Powered by</Text>
        <Mark size={16} />
        <Text style={{ fontSize: px(9.5), fontWeight: 700 }}>{PRODUCT_NAME}</Text>
      </View>
    </View>
  );
}

function Cover({ ctx, logo }: { ctx: Ctx; logo: AgencyLogo | null }) {
  const { data } = ctx;
  const h = headlineFigures(data);
  const partial = data.coverage.label !== null;
  const meta = [locationText(data), data.brand.vertical, periodFull(data)].filter(
    (p): p is string => !!p,
  );
  const host = productHost();
  const W = 794;
  const H = 1123;
  const gridLines: ReactNode[] = [];
  for (let x = 40; x < W; x += 40) {
    gridLines.push(
      <Line
        key={`v${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={H}
        stroke="#FFFFFF"
        strokeOpacity={0.055}
        strokeWidth={1}
      />,
    );
  }
  for (let y = 40; y < H; y += 40) {
    gridLines.push(
      <Line
        key={`h${y}`}
        x1={0}
        y1={y}
        x2={W}
        y2={y}
        stroke="#FFFFFF"
        strokeOpacity={0.055}
        strokeWidth={1}
      />,
    );
  }
  return (
    <Page size="A4" style={{ backgroundColor: C.navy900, fontFamily: FONT.body, color: C.white }}>
      <Svg
        fixed
        style={{ position: "absolute", top: 0, left: 0 }}
        width={PAGE.width}
        height={PAGE.height - 1}
        viewBox={`0 0 ${W} ${H}`}
      >
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={C.brand} stopOpacity={0.55} />
            <Stop offset="0.65" stopColor={C.brand} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <G>{gridLines}</G>
        <Circle cx={W + 180 - 310} cy={180 + 310} r={310} fill="url(#glow)" />
      </Svg>

      <CoverTopBar agencyName={data.agency.name} logo={logo} />

      <View style={{ position: "absolute", left: PAGE.padX, right: PAGE.padX, top: px(250) }}>
        {data.v2?.coverTierName ? (
          // S01 part 10 (P09.cover, D-RT3): the report type's name, Agency and up only, from the report's own contents
          // (its snapshot), so a later rename never changes it. JetBrains Mono NL at the weight the PDF has (500).
          <Text
            style={{
              fontFamily: FONT.mono,
              fontSize: px(8.5),
              lineHeight: 12 / 8.5,
              fontWeight: 500,
              letterSpacing: ls(8.5, 0.14),
              color: C.coverTier,
              marginBottom: px(8),
            }}
          >
            {data.v2.coverTierName.toUpperCase()}
          </Text>
        ) : null}
        <Text style={{ ...s.eyebrow, color: C.coverEyebrow }}>AI Visibility Report</Text>
        <Text
          style={{
            fontFamily: FONT.display,
            fontSize: px(44),
            lineHeight: 50 / 44,
            fontWeight: 700,
            letterSpacing: ls(44, -0.015),
            marginTop: px(14),
          }}
        >
          {data.brand.name}
        </Text>
        <Text style={{ fontSize: px(16), color: C.coverSoft, marginTop: px(12) }}>
          How often AI assistants recommend your business to local customers
        </Text>
        <Text style={{ fontSize: px(12), color: C.coverMuted, marginTop: px(6) }}>
          {meta.join(" · ")}
        </Text>
      </View>

      <View
        style={{
          position: "absolute",
          left: PAGE.padX,
          top: px(520),
          flexDirection: "row",
          alignItems: "center",
          gap: px(28),
        }}
      >
        {h.percent && h.band ? (
          <Text
            style={{
              fontFamily: FONT.display,
              fontSize: px(96),
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: ls(96, -0.04),
              color: COVER_BAND[h.band],
            }}
          >
            {h.percent}
          </Text>
        ) : (
          <Text
            style={{
              fontFamily: FONT.display,
              fontSize: px(40),
              fontWeight: 700,
              color: C.coverSoft,
            }}
          >
            Not enough answers
          </Text>
        )}
        <Text
          style={{ fontSize: px(12), lineHeight: 18 / 12, color: C.coverSoft, maxWidth: px(220) }}
        >
          {h.percent ? (
            <>
              <Text style={{ color: C.white, fontWeight: 600 }}>Visibility.</Text> Mentioned in{" "}
              <Text style={{ color: C.white, fontWeight: 600 }}>{h.kOfN}</Text> answers to everyday
              customer questions across {answeringEngineNames(data)}.
            </>
          ) : (
            h.noFigureReason
          )}
        </Text>
      </View>

      <View
        style={{
          position: "absolute",
          left: PAGE.padX,
          right: PAGE.padX,
          top: px(680),
          flexDirection: "row",
          // 14 Nov, part 4: a chip that doesn't fit goes to the next line, never past the page edge.
          flexWrap: "wrap",
          gap: px(8),
        }}
      >
        {[
          {
            text: `Based on Audit #${data.basis.auditNumber} · ${reportDate(new Date(data.basis.completedAt), data.organizationId)}`,
            warn: false,
          },
          {
            text: `${data.coverage.enginesAnswered} of ${data.coverage.enginesPlanned} engines answered`,
            warn: partial,
          },
          ...(h.ci ? [{ text: `95% CI ${h.ci}`, warn: false }] : []),
        ].map((chip) => (
          <Text
            key={chip.text}
            style={{
              fontSize: px(9.5),
              fontWeight: 600,
              borderRadius: 999,
              paddingVertical: px(5),
              paddingHorizontal: px(10),
              borderWidth: 0.75,
              borderStyle: "solid",
              borderColor: chip.warn ? C.coverWarnBorder : C.coverChipBorder,
              color: chip.warn ? C.coverWarn : C.coverChip,
              backgroundColor: chip.warn ? C.coverWarnBg : C.coverChipBg,
            }}
          >
            {chip.text}
          </Text>
        ))}
      </View>

      <View
        style={{
          position: "absolute",
          left: PAGE.padX,
          right: PAGE.padX,
          bottom: px(48),
          flexDirection: "row",
          justifyContent: "space-between",
          borderTopWidth: 0.75,
          borderTopStyle: "solid",
          borderTopColor: C.coverRule,
          paddingTop: px(14),
        }}
      >
        <Text
          style={{ flexShrink: 1, paddingRight: px(12), fontSize: px(9.5), color: C.coverMuted }}
        >
          Generated {ctx.generated} · {data.agency.footerText ?? "Confidential"}
        </Text>
        {host ? <Text style={{ fontSize: px(9.5), color: C.coverMuted }}>{host}</Text> : null}
      </View>
    </Page>
  );
}

// ------------------------------------------------------- executive summary

function CiChart({
  value,
  lower,
  upper,
  band,
}: {
  value: number;
  lower: number;
  upper: number;
  band: string;
}) {
  const W = 424;
  const x = (v: number) => (Math.max(0, Math.min(100, v)) / 100) * W;
  const lo = Math.round(lower);
  const hi = Math.round(upper);
  const near = (a: number, b: number) => Math.abs(x(a) - x(b)) < 24;
  return (
    <Svg width={px(W)} height={px(78)} viewBox={`0 0 ${W} 78`}>
      <Rect
        x={0}
        y={30}
        width={x(HEADLINE_COLOR_THRESHOLDS.developing)}
        height={14}
        fill={C.lowSoft}
      />
      <Rect
        x={x(HEADLINE_COLOR_THRESHOLDS.developing)}
        y={30}
        width={x(HEADLINE_COLOR_THRESHOLDS.strong) - x(HEADLINE_COLOR_THRESHOLDS.developing)}
        height={14}
        fill={C.midSoft}
      />
      <Rect
        x={x(HEADLINE_COLOR_THRESHOLDS.strong)}
        y={30}
        width={W - x(HEADLINE_COLOR_THRESHOLDS.strong)}
        height={14}
        fill={C.goodSoft}
      />
      <Rect
        x={x(lower)}
        y={26}
        width={Math.max(2, x(upper) - x(lower))}
        height={22}
        rx={4}
        fill="none"
        stroke={C.ink}
        strokeWidth={1.5}
      />
      <Circle cx={x(value)} cy={37} r={7} fill={band} stroke={C.white} strokeWidth={2} />
      <Text
        x={x(value)}
        y={18}
        textAnchor="middle"
        fill={C.ink}
        style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT.body }}
      >
        {formatVisibilityPercent(value)}
      </Text>
      <Text
        x={x(lower)}
        y={64}
        textAnchor="middle"
        fill={C.ink3}
        style={{ fontSize: 8.5, fontFamily: FONT.body }}
      >
        {`${lo}%`}
      </Text>
      <Text
        x={x(upper)}
        y={64}
        textAnchor="middle"
        fill={C.ink3}
        style={{ fontSize: 8.5, fontFamily: FONT.body }}
      >
        {`${hi}%`}
      </Text>
      {!near(0, lower) && (
        <Text x={0} y={64} fill={C.ink3} style={{ fontSize: 8.5, fontFamily: FONT.body }}>
          0
        </Text>
      )}
      {!near(100, upper) && (
        <Text
          x={W}
          y={64}
          textAnchor="end"
          fill={C.ink3}
          style={{ fontSize: 8.5, fontFamily: FONT.body }}
        >
          100%
        </Text>
      )}
    </Svg>
  );
}

function Tile({
  k,
  v,
  small,
  d,
  bad,
  compact,
}: {
  k: string;
  v: string;
  small?: string;
  d: string;
  bad?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={{ ...s.tile, flex: 1 }}>
      <Text style={s.tileK}>{k}</Text>
      <Text
        style={{
          ...s.tileV,
          ...(compact ? { fontSize: px(17), lineHeight: 32 / 17 } : {}),
          color: bad ? C.low : C.navy900,
        }}
      >
        {v}
        {small ? <Text style={s.tileSmall}>{` ${small}`}</Text> : null}
      </Text>
      <Text style={s.tileD}>{d}</Text>
    </View>
  );
}

/** The directory-profile tile, by what's linked (part 5 point 3). */
function profileTile(data: ReportData): {
  v: string;
  small?: string;
  d: string;
  bad: boolean;
  compact: boolean;
} {
  const cited = citedDirectories(data);
  const total = cited.reduce((sum, r) => sum + r.citedCount, 0);
  if (cited.length === 0) {
    return { v: "None", d: "No directory was cited this audit", bad: false, compact: true };
  }
  const linked = cited.filter((r) => r.ownerProfileLinked);
  const own = linked.reduce((sum, r) => sum + r.ownerProfileCitedCount, 0);
  if (linked.length === 0) {
    return {
      v: "Not checked",
      d: "Add your directory profile links in brand settings so we can match them with what AI cites",
      bad: false,
      compact: true,
    };
  }
  return {
    v: String(own),
    small: `of ${total}`,
    d:
      linked.length === cited.length
        ? "directory citations by AI"
        : `directory citations; ${cited.length - linked.length} of the directories aren't linked yet`,
    bad: own === 0,
    compact: false,
  };
}

function SummaryPage({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const h = headlineFigures(data);
  const band = h.band ? BAND[h.band] : { text: C.ink3, soft: C.surface2, fill: C.neutralFill };
  // S01 part 7: in Standard and Enhanced the findings are in "Why, and what to do next", so the pointer follows them.
  const narrative = reportNarrative(data, {
    diagnosisSection: ctx.plan.diagnosis ?? ctx.plan.next,
  });
  const detail = {
    mentionedCount: data.mentionedCount,
    rankedCount: data.rankedCount,
    medianPosition: data.medianPosition,
    sourcedCount: data.sourcedCount,
  };
  const position = positionCard(detail);
  const source = sourceCitationCard(detail);
  const failed = data.engines.filter((e) => e.fullyFailed);
  const failedNames = engineNameList(failed.map((e) => e.engine));
  const profile = profileTile(data);
  const reason = failed[0]?.failureReason?.split(" (")[0] ?? "every call failed";
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader title={ctx.runningTitle} />
      <View style={{ marginTop: px(28) }}>
        <SectionLabel
          icon="grid"
          eyebrow={`${ctx.plan.summary} · Executive summary`}
          provenance={ctx.basisProv}
        />
        <Text style={s.h2}>{narrative.headline}</Text>
        <Text style={s.lede}>
          We asked AI engines the questions local customers ask, without naming your business, and
          counted how often you were recommended.
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: px(28), marginTop: px(22) }}>
        <View
          style={{
            width: px(230),
            borderRadius: px(14),
            backgroundColor: band.soft,
            paddingVertical: px(20),
            paddingHorizontal: px(22),
          }}
        >
          <Text
            style={{
              fontSize: px(10),
              fontWeight: 600,
              letterSpacing: ls(10, 0.1),
              textTransform: "uppercase",
              color: band.text,
            }}
          >
            Visibility
          </Text>
          <Text
            style={{
              fontFamily: FONT.display,
              fontSize: h.percent ? px(64) : px(26),
              lineHeight: h.percent ? 68 / 64 : 1.3,
              fontWeight: 700,
              letterSpacing: ls(64, -0.015),
              color: band.text,
              marginTop: px(4),
            }}
          >
            {h.percent ?? "Not enough answers"}
          </Text>
          <Text style={{ fontSize: px(11), lineHeight: 16 / 11, color: C.ink2 }}>
            Mentioned in <Text style={{ fontWeight: 600, color: C.ink }}>{h.kOfN}</Text> answers
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          {h.value !== null && data.headline.status === "scored" ? (
            <>
              <CiChart
                value={h.value}
                lower={data.headline.ci.lower}
                upper={data.headline.ci.upper}
                band={band.text}
              />
              <View
                style={{ flexDirection: "row", justifyContent: "space-between", marginTop: px(6) }}
              >
                {[
                  { c: C.low, t: `Low <${HEADLINE_COLOR_THRESHOLDS.developing}%` },
                  {
                    c: C.mid,
                    t: `Developing ${HEADLINE_COLOR_THRESHOLDS.developing}–${HEADLINE_COLOR_THRESHOLDS.strong - 1}%`,
                  },
                  { c: C.good, t: `Strong ≥${HEADLINE_COLOR_THRESHOLDS.strong}%` },
                ].map((b) => (
                  <View
                    key={b.t}
                    style={{ flexDirection: "row", alignItems: "center", gap: px(4) }}
                  >
                    <View style={{ width: px(7), height: px(7), backgroundColor: b.c }} />
                    <Text style={{ fontSize: px(8.5), color: C.ink3 }}>{b.t}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ ...s.cap, marginTop: px(6) }}>
                The box shows the 95% confidence interval ({h.ci}): with {data.sampleCount} answers,
                the true rate is very likely in this range.
              </Text>
            </>
          ) : (
            <Text style={s.cap}>{h.noFigureReason}</Text>
          )}
        </View>
      </View>

      {/* S04 part 7 (contract P09.reachRow): each reach's Visibility, only when the basis audit had more than one
          (visibility_reach on at generation; every tier). */}
      {data.v2?.reaches && data.v2.reaches.length > 1 ? (
        <View wrap={false} style={{ flexDirection: "row", gap: px(10), marginTop: px(18) }}>
          {data.v2.reaches.map((r) => (
            <View
              key={r.reach}
              style={{
                flex: 1,
                borderWidth: 0.75,
                borderStyle: "solid",
                borderColor: C.line,
                borderRadius: px(10),
                paddingVertical: px(10),
                paddingHorizontal: px(12),
                backgroundColor: C.surface,
              }}
            >
              <Text style={{ fontSize: px(9.5), fontWeight: 600, color: C.ink2 }}>{r.label}</Text>
              <Text
                style={{
                  fontFamily: FONT.display,
                  fontSize: px(20),
                  fontWeight: 700,
                  color: C.ink,
                  marginTop: px(2),
                }}
              >
                {r.answers > 0 ? formatVisibilityPercent((r.mentioned / r.answers) * 100) : "—"}
              </Text>
              <Text style={{ fontSize: px(9), color: C.ink3 }}>
                {r.mentioned} of {r.answers}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {failed.length > 0 && (
        <View
          wrap={false}
          style={{
            flexDirection: "row",
            gap: px(12),
            borderWidth: 0.75,
            borderStyle: "solid",
            borderColor: C.warnBorder,
            backgroundColor: C.warnBg,
            borderRadius: px(10),
            paddingVertical: px(12),
            paddingHorizontal: px(14),
            marginTop: px(20),
          }}
        >
          <View
            style={{
              width: px(20),
              height: px(20),
              borderRadius: px(10),
              backgroundColor: C.midFill,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: C.white, fontSize: px(12), fontWeight: 700 }}>!</Text>
          </View>
          <Text style={{ flex: 1, fontSize: px(10.5), lineHeight: 15 / 10.5, color: C.warnText }}>
            <Text style={{ fontWeight: 700 }}>
              This audit is based on {data.coverage.enginesAnswered} of{" "}
              {data.coverage.enginesPlanned} engines.
            </Text>{" "}
            {failedNames} returned an error for all{" "}
            {data.questions.perEngine ?? failed[0].failedCount} questions (
            {reason.charAt(0).toLowerCase() + reason.slice(1)}), so{" "}
            {failed.length === 1 ? "its" : "their"} answers aren't counted. Visibility uses the{" "}
            {data.sampleCount} answers from {answeringEngineNames(data)}.
          </Text>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: px(12), marginTop: px(22) }}>
        <Tile
          k="Engines answered"
          v={String(data.coverage.enginesAnswered)}
          small={`of ${data.coverage.enginesPlanned}`}
          d={failed.length > 0 ? `${failedNames} unavailable this audit` : "Every engine answered"}
        />
        <Tile
          k="Typical position"
          v={
            position.kind === "measured"
              ? position.value
              : position.kind === "not_ranked"
                ? "Not ranked"
                : "None"
          }
          d={
            position.kind === "measured"
              ? position.detail
              : position.kind === "not_ranked"
                ? "Never inside a ranked list"
                : "Not mentioned in any answer"
          }
          compact={position.kind !== "measured"}
        />
        <Tile
          k="Source cited"
          v={source.kind === "measured" ? String(data.sourcedCount) : "None"}
          small={source.kind === "measured" ? `of ${data.mentionedCount}` : undefined}
          d={
            source.kind === "measured"
              ? `${plural(data.mentionedCount, "mention")} linked a source`
              : "Not mentioned in any answer"
          }
          compact={source.kind !== "measured"}
        />
        <Tile
          k="Your directory profiles cited"
          v={profile.v}
          small={profile.small}
          d={profile.d}
          bad={profile.bad}
          compact={profile.compact}
        />
      </View>

      {narrative.paragraphs.length > 0 && (
        <View wrap={false} style={{ marginTop: px(24) }}>
          <Text style={s.h3}>The picture, in plain English</Text>
          <View
            style={{
              marginTop: px(12),
              paddingVertical: px(18),
              paddingHorizontal: px(20),
              borderLeftWidth: px(3),
              borderLeftStyle: "solid",
              borderLeftColor: C.brand,
              backgroundColor: C.surface,
            }}
          >
            {narrative.paragraphs.map((p, i) => (
              <Text
                key={p}
                style={{
                  fontFamily: FONT.display,
                  fontSize: px(12.5),
                  lineHeight: 20 / 12.5,
                  color: C.narrative,
                  marginBottom: i === narrative.paragraphs.length - 1 ? 0 : px(9),
                }}
              >
                <Rich text={p} bold={{ fontWeight: 600, color: C.ink }} />
              </Text>
            ))}
          </View>
          <Text style={{ ...s.cap, marginTop: px(6) }}>
            Every sentence is built from the measured figures on this page; no numbers are
            estimated.
          </Text>
        </View>
      )}
      <RunningFooter left={ctx.footerLeft} />
    </Page>
  );
}

// ---------------------------------------------------------- engine by engine

function EngineRows({ data }: { data: ReportData }) {
  return (
    <View style={{ marginTop: px(18) }}>
      {data.engines.map((e, i) => {
        // 9 Nov, part 6: a bar only for an engine that answered (lib/scoring/measured-display.ts, as the brand
        // page); one with no answers draws no track and says why when its calls failed.
        const row = engineRowDisplay({
          sampleCount: e.sampleCount,
          mentionedCount: e.mentionedCount,
          noAnswerReason:
            e.failedCount > 0 ? `${e.failedCount} ${plural(e.failedCount, "error")}` : null,
        });
        const rate = row.kind === "answered" ? row.ratePct : 0;
        // D-BAND (S01 part 0): the band of the figure printed below (`${Math.round(rate)}%`).
        const fill = BAND[shownHeadlineBand(rate)].fill;
        const last = i === data.engines.length - 1;
        const answeredErrors = !e.fullyFailed && e.failedEverydayCount > 0;
        return (
          <View
            key={e.engine}
            wrap={false}
            style={{
              paddingVertical: px(13),
              borderBottomWidth: last ? 0 : 0.75,
              borderBottomStyle: "solid",
              borderBottomColor: C.line,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: px(14) }}>
              <View
                style={{ width: px(120), flexDirection: "row", alignItems: "center", gap: px(8) }}
              >
                <View
                  style={{
                    width: px(10),
                    height: px(10),
                    borderRadius: px(3),
                    backgroundColor: ENGINE_DOT[e.engine] ?? C.ink3,
                  }}
                />
                <Text style={{ fontSize: px(12), fontWeight: 600 }}>{e.name}</Text>
              </View>
              <View style={{ flex: 1, ...(e.fullyFailed || row.kind === "answered" ? s.bar : {}) }}>
                {e.fullyFailed ? (
                  <Hatch width={px(CONTENT_W - 120 - 92 - 28)} height={px(12)} stripe={px(6)} />
                ) : row.kind === "answered" ? (
                  <View
                    style={{
                      width: `${rate}%`,
                      height: px(12),
                      borderRadius: px(6),
                      backgroundColor: fill,
                    }}
                  />
                ) : null}
              </View>
              <View style={{ width: px(92), alignItems: "flex-end" }}>
                {e.fullyFailed ? (
                  <>
                    <Text style={{ fontSize: px(12), fontWeight: 600, color: C.low }}>
                      Not counted
                    </Text>
                    <Text style={{ fontSize: px(9), fontWeight: 500, color: C.ink3 }}>
                      {e.failedCount} {plural(e.failedCount, "error")}
                    </Text>
                  </>
                ) : row.kind === "no_answers" ? (
                  <>
                    <Text style={{ fontSize: px(12), fontWeight: 600, color: C.ink3 }}>
                      {row.label}
                    </Text>
                    {row.reason && (
                      <Text style={{ fontSize: px(9), fontWeight: 500, color: C.ink3 }}>
                        {row.reason}
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    <Text
                      style={{
                        fontSize: px(12),
                        fontWeight: 600,
                        color: rate === 0 ? C.low : C.ink,
                      }}
                    >
                      {`${Math.round(rate)}%`}
                    </Text>
                    <Text style={{ fontSize: px(9), fontWeight: 500, color: C.ink3 }}>
                      {e.mentionedCount} of {e.sampleCount}
                      {answeredErrors
                        ? ` · ${e.failedEverydayCount} ${plural(e.failedEverydayCount, "error")}`
                        : ""}
                    </Text>
                  </>
                )}
              </View>
            </View>
            {e.fullyFailed && e.failureReason && (
              <Text
                style={{ marginLeft: px(134), marginTop: px(4), fontSize: px(9.5), color: C.low }}
              >
                {/* S01C part 1 (LLD amendment 58): the customer's reason, "a problem on our side". */}
                Didn't answer: {e.failureReason}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const MATRIX_Q_W = 238;

function MatrixCell({ outcome }: { outcome: "mentioned" | "not_mentioned" | "error" }) {
  const base = {
    flex: 1,
    height: px(22),
    borderRadius: px(5),
    marginHorizontal: px(2),
    overflow: "hidden" as const,
  };
  if (outcome === "mentioned") {
    return (
      <View
        style={{ ...base, backgroundColor: C.good, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: C.white, fontSize: px(10), fontWeight: 700 }}>✓</Text>
      </View>
    );
  }
  if (outcome === "error") {
    return (
      <View style={base}>
        <Hatch width={px(110)} height={px(22)} stripe={px(4)} />
      </View>
    );
  }
  return (
    <View
      style={{
        ...base,
        backgroundColor: C.surface2,
        borderWidth: 0.75,
        borderStyle: "solid",
        borderColor: C.line,
      }}
    />
  );
}

function Matrix({ data, rows }: { data: ReportData; rows: ReportMatrixRow[] }) {
  return (
    <View style={{ marginTop: px(10) }}>
      <View style={{ flexDirection: "row", marginBottom: px(4) }}>
        <Text
          style={{
            width: px(MATRIX_Q_W),
            fontSize: px(9),
            fontWeight: 600,
            color: C.ink3,
            letterSpacing: ls(9, 0.04),
          }}
        >
          Everyday question
        </Text>
        {data.engines.map((e) => (
          <Text
            key={e.engine}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: px(9),
              fontWeight: 600,
              color: C.ink3,
              letterSpacing: ls(9, 0.04),
            }}
          >
            {e.name}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View
          key={row.index}
          wrap={false}
          style={{ flexDirection: "row", alignItems: "center", marginBottom: px(4) }}
        >
          <View style={{ width: px(MATRIX_Q_W), flexDirection: "row", paddingRight: px(8) }}>
            <Text style={{ fontSize: px(10), fontWeight: 600, color: C.ink3, width: px(26) }}>
              Q{row.index}
            </Text>
            <Text
              style={{
                flex: 1,
                fontSize: px(10),
                color: C.ink2,
                maxLines: 1,
                textOverflow: "ellipsis",
              }}
            >
              {row.question}
            </Text>
          </View>
          {data.engines.map((e) => (
            <MatrixCell key={e.engine} outcome={row.cells[e.engine] ?? "error"} />
          ))}
        </View>
      ))}
    </View>
  );
}

function MatrixLegend() {
  return (
    <View style={{ flexDirection: "row", gap: px(16), marginTop: px(8) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: px(6) }}>
        <View
          style={{
            width: px(12),
            height: px(12),
            borderRadius: px(3),
            backgroundColor: C.good,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: C.white, fontSize: px(8), fontWeight: 700 }}>✓</Text>
        </View>
        <Text style={{ fontSize: px(9), color: C.ink2 }}>Mentioned</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: px(6) }}>
        <View
          style={{
            width: px(12),
            height: px(12),
            borderRadius: px(3),
            backgroundColor: C.surface2,
            borderWidth: 0.75,
            borderStyle: "solid",
            borderColor: C.line,
          }}
        />
        <Text style={{ fontSize: px(9), color: C.ink2 }}>Not mentioned</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: px(6) }}>
        <View style={{ width: px(12), height: px(12), borderRadius: px(3), overflow: "hidden" }}>
          <Hatch width={px(12)} height={px(12)} stripe={px(3)} />
        </View>
        <Text style={{ fontSize: px(9), color: C.ink2 }}>Error, not counted</Text>
      </View>
    </View>
  );
}

function EnginesPages({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const first = data.matrix.slice(0, MATRIX_ROWS_PER_PAGE);
  const rest: ReportMatrixRow[][] = [];
  for (let i = MATRIX_ROWS_PER_PAGE; i < data.matrix.length; i += MATRIX_ROWS_CONTINUED) {
    rest.push(data.matrix.slice(i, i + MATRIX_ROWS_CONTINUED));
  }
  return (
    <>
      <Page size="A4" style={s.page}>
        <RunningHeader title={ctx.runningTitle} />
        <View style={{ marginTop: px(28) }}>
          <SectionLabel
            icon="grid"
            eyebrow={`${ctx.plan.engines} · Engine by engine`}
            provenance={ctx.basisProv}
          />
          <Text style={s.h2}>Which AI engines recommend you</Text>
          <Text style={s.lede}>
            Mentions in successful answers to the {data.questions.everyday} everyday questions.
            Failed answers are shown but never counted.
          </Text>
        </View>
        <EngineRows data={data} />
        <View style={s.rule} />
        <Text style={s.h3}>Question by question</Text>
        <Text style={{ ...s.cap, marginTop: px(2) }}>
          Each square is one AI answer to an everyday question
          {rest.length > 0
            ? `; questions ${MATRIX_ROWS_PER_PAGE + 1}–${data.matrix.length} continue on the next page.`
            : "."}
        </Text>
        <Matrix data={data} rows={first} />
        <MatrixLegend />
        <RunningFooter left={ctx.footerLeft} />
      </Page>
      {rest.map((rows) => (
        <Page key={rows[0].index} size="A4" style={s.page}>
          <RunningHeader title={ctx.runningTitle} />
          <View style={{ marginTop: px(28) }}>
            <SectionLabel
              icon="grid"
              eyebrow={`${ctx.plan.engines} · Engine by engine`}
              provenance={ctx.basisProv}
            />
            <Text style={s.h2}>Question by question (continued)</Text>
          </View>
          <Matrix data={data} rows={rows} />
          <MatrixLegend />
          <RunningFooter left={ctx.footerLeft} />
        </Page>
      ))}
    </>
  );
}

// ------------------------------------------------------------ Google Search AI

/**
 * 14 Nov, part 3 (Sri's review of audit #48): page 4 was two lines on a near-empty page with no section number.
 * Now a numbered section with what the audit page's block shows (components/domain/audit/google-search-ai-section.tsx,
 * from the same words in lib/audit/google-surfaces/summary.ts): each surface's line and detail (the questions naming
 * you), the directories Google cited, and each question's outcome. It starts the directories page and flows into
 * that section, so it never leaves a page nearly empty. When Google answered nothing, the one line saying why.
 */
function GoogleSection({ ctx }: { ctx: Ctx }) {
  const google = ctx.data.google;
  if (!google || !ctx.plan.google) return null;
  const col = { outcome: px(118) };
  return (
    <View style={{ marginTop: px(28) }}>
      <SectionLabel
        icon="grid"
        eyebrow={`${ctx.plan.google} · Google Search AI`}
        provenance={ctx.basisProv}
      />
      <Text style={s.h2}>Google AI Overviews and AI Mode</Text>
      <Text style={s.lede}>{googlePlaceLine(google, ctx.data.brand)}</Text>
      {google.locationNote && (
        <Text style={{ ...s.cap, marginTop: px(4) }}>{google.locationNote}</Text>
      )}
      {google.rows.length === 0 ? (
        google.lines.map((line) => (
          <Text key={line} style={{ ...s.h3, marginTop: px(12) }}>
            {line}
          </Text>
        ))
      ) : (
        <View style={{ marginTop: px(12) }}>
          {google.rows.map((row) => (
            <View key={row.surface} wrap={false} style={{ marginBottom: px(8) }}>
              <Text style={s.h3}>{row.line}</Text>
              <Text style={{ ...s.cap, marginTop: px(2) }}>{row.detail}</Text>
              {row.directories.length > 0 && (
                <Text style={{ ...s.cap, marginTop: px(2) }}>
                  Directories cited: {row.directories.join(", ")}
                </Text>
              )}
            </View>
          ))}
          {google.reasons.map((reason) => (
            <Text key={reason} style={{ ...s.cap, marginTop: px(2) }}>
              {reason}
            </Text>
          ))}
        </View>
      )}
      <Text style={{ ...s.cap, marginTop: px(8) }}>{google.note}</Text>
      {google.questions.length > 0 && (
        <View style={{ marginTop: px(12) }}>
          <View
            wrap={false}
            style={{
              flexDirection: "row",
              borderBottomWidth: 0.75,
              borderBottomColor: C.line,
              paddingBottom: px(4),
            }}
          >
            <Text style={{ ...s.cap, flex: 1, fontWeight: 600, color: C.ink }}>Question</Text>
            {google.rows.map((row) => (
              <Text
                key={row.surface}
                style={{ ...s.cap, width: col.outcome, fontWeight: 600, color: C.ink }}
              >
                {row.name}
              </Text>
            ))}
          </View>
          {google.questions.map((q) => (
            <View
              key={q.prompt}
              wrap={false}
              style={{
                flexDirection: "row",
                paddingVertical: px(3),
                borderBottomWidth: 0.5,
                borderBottomColor: C.line,
              }}
            >
              <Text style={{ ...s.cap, flex: 1, paddingRight: px(8) }}>
                {q.prompt}
                {q.namesYou ? " (names you)" : ""}
              </Text>
              {q.outcomes.map((outcome, i) => (
                <Text
                  key={google.rows[i]?.surface ?? outcome}
                  style={{ ...s.cap, width: col.outcome }}
                >
                  {outcome}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
      <View style={s.rule} />
    </View>
  );
}

// ------------------------------------------------------------ where AI looks

function Callout({ tone, children }: { tone: "info" | "warn"; children: ReactNode }) {
  const info = tone === "info";
  return (
    <View
      wrap={false}
      style={{
        flexDirection: "row",
        gap: px(12),
        borderWidth: 0.75,
        borderStyle: "solid",
        borderColor: info ? C.infoBorder : C.warnBorder,
        backgroundColor: info ? C.infoBg : C.warnBg,
        borderRadius: px(10),
        paddingVertical: px(12),
        paddingHorizontal: px(14),
        marginTop: px(22),
      }}
    >
      <View
        style={{
          width: px(20),
          height: px(20),
          borderRadius: px(10),
          backgroundColor: info ? C.brand : C.midFill,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: C.white, fontSize: px(12), fontWeight: 700 }}>
          {info ? "i" : "!"}
        </Text>
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: px(10.5),
          lineHeight: 15 / 10.5,
          color: info ? C.infoText : C.warnText,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function DirectoriesPage({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const n = data.directories.totalAnswers;
  const cited = citedDirectories(data);
  const total = cited.reduce((sum, r) => sum + r.citedCount, 0);
  const linked = cited.filter((r) => r.ownerProfileLinked);
  const own = linked.reduce((sum, r) => sum + r.ownerProfileCitedCount, 0);
  const top = cited.slice(0, 3);
  const topSum = top.reduce((sum, r) => sum + r.citedCount, 0);
  const topNames = top.map((r) => r.name);
  const topList =
    topNames.length <= 1
      ? topNames.join("")
      : `${topNames.slice(0, -1).join(", ")} and ${topNames[topNames.length - 1]}`;
  const these = top.length === 1 ? "this one" : `these ${countWord(top.length)}`;
  // One Share of Voice (7 Nov): every count and share from the one counter (lib/visibility/share-of-voice.ts).
  const sov = data.competitors;
  const competitors = [
    {
      name: data.brand.name,
      mentions: sov.brandMentions,
      sharePct: sov.brandSharePct,
      isYou: true,
    },
    ...sov.rows.map((c) => ({ ...c, isYou: false })),
  ].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
  const sovMeasured = sov.state === "measured" || sov.state === "no_mentions";
  // S01C part 3e (amendment 64): wide enough that no registry name wraps (the widest, "Google Business Profile", is
  // 99 pt in Inter 600 at this size; tests/integration/report-layout-s01c checks every name).
  const col = { name: DIRECTORY_NAME_COLUMN, count: px(64), profile: px(92) };
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader title={ctx.runningTitle} />
      <GoogleSection ctx={ctx} />
      <View style={{ marginTop: ctx.plan.google ? 0 : px(28) }}>
        <SectionLabel
          icon="grid"
          eyebrow={`${ctx.plan.directories} · Where AI looks`}
          provenance={ctx.basisProv}
        />
        <Text style={s.h2}>The directories AI trusts, and whether it found you there</Text>
        <Text style={s.lede}>
          Out of {n} answers to everyday customer questions. A directory counts once per answer that
          cites it.
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: px(12), marginTop: px(20) }}>
        <View style={{ ...s.tile, flex: 1 }}>
          <Text style={s.tileK}>Directory citations by AI</Text>
          <Text style={{ ...s.tileV, fontSize: px(34), lineHeight: 40 / 34 }}>{total}</Text>
          <Text style={s.tileD}>
            across {cited.length} {plural(cited.length, "directory", "directories")} in {n} answers
          </Text>
        </View>
        <View style={{ ...s.tile, flex: 1 }}>
          <Text style={s.tileK}>Citations of your profile</Text>
          {cited.length > 0 && linked.length === 0 ? (
            <>
              <Text style={{ ...s.tileV, fontSize: px(22), lineHeight: 40 / 22 }}>Not checked</Text>
              <Text style={s.tileD}>
                Add your directory profile links in brand settings so we can match them with what AI
                cites
              </Text>
            </>
          ) : (
            <>
              <Text
                style={{
                  ...s.tileV,
                  fontSize: px(34),
                  lineHeight: 40 / 34,
                  color: own === 0 && total > 0 ? C.low : C.navy900,
                }}
              >
                {own}
              </Text>
              <Text style={s.tileD}>
                {total === 0
                  ? "No directory was cited in these answers"
                  : own === 0
                    ? linked.length === cited.length
                      ? "AI didn't link any of your directory listings"
                      : `None on your linked listings; ${cited.length - linked.length} cited ${plural(cited.length - linked.length, "directory isn't", "directories aren't")} linked yet`
                    : `of ${total} directory citations linked your own profile`}
              </Text>
            </>
          )}
        </View>
      </View>

      {cited.length > 0 && (
        <>
          {/* S01C part 3e (amendment 64): the rows in one View with the header row `fixed` inside it, so react-pdf
              repeats the header when the table continues on the next page (a fixed child is copied into both halves
              of a split View) and nowhere else. */}
          <View style={{ marginTop: px(22) }}>
            <View
              fixed
              style={{
                flexDirection: "row",
                gap: px(12),
                paddingBottom: px(6),
                borderBottomWidth: 0.75,
                borderBottomStyle: "solid",
                borderBottomColor: C.line,
              }}
            >
              {[
                { t: "Directory", w: col.name, a: "left" as const },
                { t: "Cited in answers", w: undefined, a: "left" as const },
                { t: "Count", w: col.count, a: "right" as const },
                { t: "Your profile", w: col.profile, a: "center" as const },
              ].map((h) => (
                <Text
                  key={h.t}
                  style={{
                    ...(h.w ? { width: h.w } : { flex: 1 }),
                    textAlign: h.a,
                    fontSize: px(8.5),
                    fontWeight: 600,
                    letterSpacing: ls(8.5, 0.08),
                    textTransform: "uppercase",
                    color: C.ink3,
                  }}
                >
                  {h.t}
                </Text>
              ))}
            </View>
            {cited.map((r, i) => {
              const status = directoryProfileStatus(r);
              const pill =
                status.kind === "not_linked"
                  ? { bg: C.surface2, fg: C.ink2 }
                  : status.cited === 0
                    ? { bg: C.lowSoft, fg: C.low }
                    : { bg: C.goodSoft, fg: C.good };
              return (
                <View
                  key={r.key}
                  wrap={false}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: px(12),
                    paddingVertical: px(10),
                    borderBottomWidth: i === cited.length - 1 ? 0 : 0.75,
                    borderBottomStyle: "solid",
                    borderBottomColor: C.line,
                  }}
                >
                  <View style={{ width: col.name }}>
                    <Text style={{ fontSize: px(11.5), fontWeight: 600 }}>{r.name}</Text>
                    {/* S00 part 5: a directory shown only because this audit cited it says what it is. S01C part 3e
                      (amendment 64): on its own muted line, so the name never wraps. */}
                    {r.relevantToBrand === false && r.kind ? (
                      <Text style={{ fontSize: px(9), color: C.ink3, marginTop: px(1) }}>
                        {DIRECTORY_KIND_LABELS[r.kind]}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ flex: 1, ...s.bar }}>
                    <View
                      style={{
                        width: `${n > 0 ? (r.citedCount / n) * 100 : 0}%`,
                        height: px(12),
                        borderRadius: px(6),
                        backgroundColor: C.brand,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      width: col.count,
                      textAlign: "right",
                      fontSize: px(11),
                      fontWeight: 600,
                    }}
                  >
                    {r.citedCount} of {n}
                  </Text>
                  <View style={{ width: col.profile, alignItems: "center" }}>
                    <Text style={{ ...s.pill, backgroundColor: pill.bg, color: pill.fg }}>
                      {status.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          <Callout tone="info">
            AI engines cited {topList} in{" "}
            <Text style={{ fontWeight: 700 }}>
              {topSum} of {total}
            </Text>{" "}
            directory citations. A complete, active profile on {these} is the most direct way to be
            the listing AI links to.
          </Callout>
        </>
      )}
      {cited.length === 0 && (
        <View style={{ ...s.tile, marginTop: px(22) }}>
          <Text style={{ fontSize: px(10.5), color: C.ink2 }}>
            None of your relevant directories was cited in these {n} answers.
          </Text>
        </View>
      )}

      {data.sections.competitors && (
        <View wrap={false} style={{ marginTop: px(28) }}>
          <Text style={s.h3}>Competitors</Text>
          {data.competitors.configured && !sovMeasured ? (
            <View style={{ ...s.tile, marginTop: px(8) }}>
              <Text style={{ fontSize: px(10.5), color: C.ink2 }}>
                Share of voice isn&apos;t shown in this audit: {sov.stateDetail}.
              </Text>
            </View>
          ) : data.competitors.configured ? (
            <View style={{ marginTop: px(8) }}>
              {competitors.map((c) => (
                <View
                  key={c.name}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: px(12),
                    paddingVertical: px(7),
                    borderBottomWidth: 0.75,
                    borderBottomStyle: "solid",
                    borderBottomColor: C.line,
                  }}
                >
                  <Text
                    style={{ width: px(160), fontSize: px(11), fontWeight: c.isYou ? 700 : 600 }}
                  >
                    {c.name}
                    {c.isYou ? " (you)" : ""}
                  </Text>
                  <View style={{ flex: 1, ...s.bar }}>
                    <View
                      style={{
                        width: c.sharePct === null ? "0%" : formatSharePercent(c.sharePct),
                        height: px(12),
                        borderRadius: px(6),
                        backgroundColor: c.isYou ? C.brand : C.neutralFill,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      width: px(96),
                      textAlign: "right",
                      fontSize: px(11),
                      fontWeight: 600,
                    }}
                  >
                    {c.sharePct === null ? "—" : formatSharePercent(c.sharePct)} · {c.mentions} of{" "}
                    {sov.totalMentions}
                  </Text>
                </View>
              ))}
              <Text style={{ ...s.cap, marginTop: px(6) }}>
                Share of voice: each business&apos;s verified mentions as a share of all{" "}
                {sov.totalMentions} verified mentions of you and your competitors in the same{" "}
                {data.sampleCount} everyday answers{sov.smallSample ? " (a small sample)" : ""}.
                Yours are verified as in Visibility; a competitor&apos;s when its own website is
                among the sources the answer cited.
              </Text>
              {sov.note && <Text style={{ ...s.cap, marginTop: px(3) }}>{sov.note}.</Text>}
            </View>
          ) : (
            <View style={{ ...s.tile, marginTop: px(8) }}>
              <Text style={{ fontSize: px(10.5), color: C.ink2 }}>
                No competitors were configured for this brand, so share of voice isn't shown.
              </Text>
              <Text style={{ ...s.cap, marginTop: px(3) }}>
                When competitors are added, this section ranks you against them using the same
                answers.
              </Text>
            </View>
          )}
        </View>
      )}
      <RunningFooter left={ctx.footerLeft} />
    </Page>
  );
}

// ---------------------------------------------------------------- diagnosis

const DICON: Record<Finding["icon"], string[]> = {
  directory: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6M9 13h6M9 17h3",
  ],
  silent: ["M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z", "M8 12h8"],
  failed: [
    "M12 9v4M12 17h.01",
    "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  ],
  strength: ["M20 6 9 17l-5-5"],
  competitor: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M13 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0z",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  forum: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
};

const KIND_COLOURS = {
  risk: { bg: C.lowSoft, fg: C.low },
  watch: { bg: C.midSoft, fg: C.mid },
  strength: { bg: C.goodSoft, fg: C.good },
} as const;
const SEV_COLOURS = {
  high: { bg: C.lowSoft, fg: C.low },
  med: { bg: C.midSoft, fg: C.mid },
  str: { bg: C.goodSoft, fg: C.good },
} as const;
const EV_COLOUR: Record<EvidenceTone, string> = {
  pos: C.evPos,
  cmp: C.evCmp,
  abs: C.evAbs,
  plain: C.evText,
};

/**
 * S01B part 4c (LLD amendment 52; contract P09.next): in Standard and Enhanced a finding's card carries its Action
 * Center item -- the priority and status pills in place of the impact label, and the agency's note under the fix -- so
 * the finding isn't shown again as an action. Basic's cards (and a finding whose action the agency hid) are today's.
 */
export interface FindingCardAction {
  priority: string;
  status: string | null;
  note: string | null;
  agencyName: string | null;
}

function FindingCard({ finding, action }: { finding: Finding; action?: FindingCardAction | null }) {
  const kind = KIND_COLOURS[finding.kind];
  const sev = SEV_COLOURS[finding.severity.tone];
  // S01B part 6c (amendment 52, contract v1.5 P09.next): a strength card shows only its STRENGTH label, never its
  // item's priority or status (Bluegum's printed "STRENGTH · OPEN").
  const strength = finding.kind === "strength";
  const pill = action
    ? strength
      ? PRIORITY_PILL.strength
      : (PRIORITY_PILL[action.priority] ?? PRIORITY_PILL.medium)
    : null;
  return (
    <View
      wrap={false}
      style={{
        borderWidth: 0.75,
        borderStyle: "solid",
        borderColor: C.line,
        borderRadius: px(12),
        backgroundColor: C.white,
        marginTop: px(12),
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: px(12),
          paddingTop: px(14),
          paddingHorizontal: px(16),
          paddingBottom: px(10),
        }}
      >
        <View
          style={{
            width: px(34),
            height: px(34),
            borderRadius: px(9),
            backgroundColor: kind.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg width={px(16)} height={px(16)} viewBox="0 0 24 24">
            {DICON[finding.icon].map((d) => (
              <Path
                key={d}
                d={d}
                fill="none"
                stroke={kind.fg}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: px(12.5), fontWeight: 600, color: C.navy900 }}>
            {finding.title}
          </Text>
          <Text
            style={{ fontSize: px(10), lineHeight: 14.5 / 10, color: C.ink2, marginTop: px(3) }}
          >
            {finding.explanation}
          </Text>
        </View>
        {action && pill ? (
          <View style={{ alignSelf: "flex-start", flexDirection: "row", gap: px(6) }}>
            <SmallPill text={pill.label} bg={pill.bg} fg={pill.fg} />
            {action.status && !strength ? (
              <SmallPill text={STATUS_LABEL[action.status] ?? "OPEN"} bg={C.surface2} fg={C.ink2} />
            ) : null}
          </View>
        ) : (
          <Text
            style={{
              alignSelf: "flex-start",
              fontSize: px(8.5),
              fontWeight: 700,
              letterSpacing: ls(8.5, 0.06),
              textTransform: "uppercase",
              borderRadius: 999,
              paddingVertical: px(4),
              paddingHorizontal: px(9),
              backgroundColor: sev.bg,
              color: sev.fg,
            }}
          >
            {finding.severity.label}
          </Text>
        )}
      </View>
      <View
        style={{
          marginHorizontal: px(16),
          paddingVertical: px(10),
          paddingHorizontal: px(12),
          backgroundColor: C.evidence,
          borderRadius: px(8),
        }}
      >
        <Text
          style={{
            fontFamily: FONT.mono,
            fontSize: px(7.5),
            letterSpacing: ls(7.5, 0.12),
            textTransform: "uppercase",
            color: C.evLabel,
            marginBottom: px(4),
          }}
        >
          {finding.evidenceLabel}
        </Text>
        {finding.evidence.map((line) => (
          <Text
            key={line.map((p) => p.text).join("")}
            style={{ fontFamily: FONT.mono, fontSize: px(9), lineHeight: 15 / 9, color: C.evText }}
          >
            {line.map((part) => (
              <Text key={part.text} style={{ color: EV_COLOUR[part.tone] }}>
                {part.text}
              </Text>
            ))}
          </Text>
        ))}
      </View>
      {/* S01C part 2b (LLD amendment 60): no action line when the audit measured nothing to act on. */}
      {finding.fix ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: px(8),
            paddingTop: px(10),
            paddingHorizontal: px(16),
            paddingBottom: px(12),
          }}
        >
          <Svg width={px(13)} height={px(13)} viewBox="0 0 24 24">
            <Path d="M20 6 9 17l-5-5" fill="none" stroke={C.brand} strokeWidth={2.2} />
          </Svg>
          {/* 14 Nov, part 4: flex 1, so the action wraps beside the tick (it ran off the page edge). */}
          <Text style={{ flex: 1, fontSize: px(10), fontWeight: 600, color: C.ink }}>
            {finding.fix}
          </Text>
        </View>
      ) : (
        <View style={{ height: px(12) }} />
      )}
      {action?.note ? (
        <Text
          style={{
            fontSize: px(9.5),
            color: AGENCY.fg,
            backgroundColor: AGENCY.bg,
            borderRadius: px(6),
            marginHorizontal: px(16),
            marginBottom: px(12),
            paddingVertical: px(6),
            paddingHorizontal: px(10),
          }}
        >
          {action.agencyName ? `Note from ${action.agencyName}: ` : "Note: "}
          {action.note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * S01 part 3 (LLD 8.1.2, 8.1.5; N15): with report_v2 on, a page with no finding says what was checked, never "No
 * finding rule matched this audit" (a 0% audit has findings g or h whenever its answers support them).
 */
export const FINDINGS_CHECKED =
  "Checked for this audit: directories AI cited, engines that didn't name you or couldn't answer, competitors named more often, Reddit threads, other providers' sites AI cited, answers that couldn't find your business, directories beyond your type, and your ABN and Google Business Profile. None of them showed a problem to fix.";

function DiagnosisPage({ ctx }: { ctx: Ctx }) {
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader title={ctx.runningTitle} />
      <View style={{ marginTop: px(28) }}>
        <SectionLabel
          icon="search"
          eyebrow={`${ctx.plan.diagnosis} · Diagnosis`}
          provenance={ctx.basisProv}
        />
        <Text style={s.h2}>Why AI isn't recommending you more, and what's working</Text>
        <Text style={s.lede}>Each finding shows the evidence from this audit, then the fix.</Text>
      </View>
      {ctx.findings.length > 0 ? (
        ctx.findings.map((f) => <FindingCard key={f.rule} finding={f} />)
      ) : (
        <View style={{ ...s.tile, marginTop: px(12) }}>
          <Text style={{ fontSize: px(10.5), color: C.ink2 }}>
            {ctx.data.lowVisibility ? FINDINGS_CHECKED : "No finding rule matched this audit."}
          </Text>
        </View>
      )}
      <RunningFooter left={ctx.footerLeft} />
    </Page>
  );
}

// ------------------------------------------- S01 part 7: why, and what to do next

/** P09: agency violet on its soft fill (7.65:1), and the action card's pills. */
const AGENCY = { fg: "#5B21B6", bg: "#EDE9FE" } as const;
const PRIORITY_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  high: { label: "HIGH", bg: C.lowSoft, fg: C.low },
  medium: { label: "MEDIUM", bg: C.midSoft, fg: C.mid },
  low: { label: "LOW", bg: C.surface2, fg: C.ink2 },
  strength: { label: "STRENGTH", bg: C.goodSoft, fg: C.good },
};
const STATUS_LABEL: Record<string, string> = {
  open: "OPEN",
  in_progress: "IN PROGRESS",
  done: "DONE",
};

function SmallPill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <Text
      style={{
        fontSize: px(7.5),
        fontWeight: 700,
        letterSpacing: ls(7.5, 0.08),
        color: fg,
        backgroundColor: bg,
        borderRadius: 999,
        paddingVertical: px(2.5),
        paddingHorizontal: px(7),
      }}
    >
      {text}
    </Text>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: px(8),
        fontWeight: 700,
        letterSpacing: ls(8, 0.12),
        color: C.ink3,
        marginTop: px(18),
        marginBottom: px(6),
      }}
    >
      {children}
    </Text>
  );
}

/** " · audit #54" at the end of a measured action's evidence (lib/reports/what-to-do-next.ts). */
const AUDIT_TAG = / · audit #\d+$/;

function ActionCard({
  priority,
  status,
  title,
  evidence,
  note,
  agencyName,
  agency,
  evidenceInBody,
}: {
  priority: string;
  status: string | null;
  title: string;
  evidence: string | null;
  note: string | null;
  agencyName: string | null;
  agency?: boolean;
  /**
   * S01C part 3b (LLD amendment 61; contract v1.6 P09): the evidence in Inter, with only its "· audit #{n}" tag in
   * mono (OTHER ACTIONS FROM THIS AUDIT). The real reports printed those sentences in the code font.
   */
  evidenceInBody?: boolean;
}) {
  const tag = evidenceInBody ? (evidence?.match(AUDIT_TAG)?.[0] ?? null) : null;
  const sentence = tag && evidence ? evidence.slice(0, -tag.length) : evidence;
  const pill = PRIORITY_PILL[priority] ?? PRIORITY_PILL.medium;
  return (
    <View
      wrap={false}
      style={{
        borderWidth: 0.75,
        borderStyle: "solid",
        borderColor: C.line,
        borderRadius: px(6),
        padding: px(10),
        marginBottom: px(6),
      }}
    >
      <View style={{ flexDirection: "row", gap: px(6), marginBottom: px(4) }}>
        <SmallPill text={pill.label} bg={pill.bg} fg={pill.fg} />
        {status ? (
          <SmallPill text={STATUS_LABEL[status] ?? "OPEN"} bg={C.surface2} fg={C.ink2} />
        ) : null}
        {agency ? <SmallPill text="AGENCY" bg={AGENCY.bg} fg={AGENCY.fg} /> : null}
      </View>
      <Text style={{ fontSize: px(11), fontWeight: 600, color: C.ink }}>{title}</Text>
      {evidence && evidenceInBody ? (
        <Text style={{ fontSize: px(9.5), lineHeight: 14 / 9.5, color: C.ink2, marginTop: px(3) }}>
          {sentence}
          {tag ? (
            <Text style={{ fontFamily: FONT.mono, fontSize: px(8.5), color: C.ink3 }}>{tag}</Text>
          ) : null}
        </Text>
      ) : evidence ? (
        <Text style={{ fontFamily: FONT.mono, fontSize: px(8.5), color: C.ink2, marginTop: px(3) }}>
          {evidence}
        </Text>
      ) : null}
      {note ? (
        <Text style={{ fontSize: px(9.5), color: AGENCY.fg, marginTop: px(4) }}>
          {agencyName ? `Note from ${agencyName}: ` : "Note: "}
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * S01B part 4e (LLD amendment 52; contract P09 layout): from "Why, and what to do next" onwards, Standard and Enhanced
 * flow instead of starting each section on a new page. A section starts on the current page when at least a third of
 * the page's content area is left, otherwise on the next (react-pdf's minPresenceAhead on a marker before it: it moves
 * to the next page only when less than this is left and what follows doesn't fit). A heading is held with its first
 * item (one unbreakable block) and a card never splits. Basic keeps today's pages and page breaks (N15).
 */
export const PAGE_THIRD = (PAGE.height - PAGE.padTop - PAGE.padBottom) / 3;

/** S01C part 3e: the directory table's name column, wide enough that no registry directory's name wraps. */
export const DIRECTORY_NAME_COLUMN = px(140);

function SectionStart() {
  return <View minPresenceAhead={PAGE_THIRD} />;
}

/** A group's label held with its first item; the rest follow as their own blocks, so the group may cross a page. */
function Group({ label, items }: { label: string; items: ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <View wrap={false}>
        <GroupLabel>{label}</GroupLabel>
        {items[0]}
      </View>
      {items.slice(1)}
    </>
  );
}

/** OTHER ACTIONS FROM THIS AUDIT's own order; it lives with the data now (S02 part 0B), kept here for its importers. */
export { compareOtherActions } from "../report-contents";

/** The measured action a shown finding carries (its card's pills and note), when the agency didn't hide it. */
function actionForFinding(
  finding: Finding,
  next: WhatToDoNext | null,
): WhatToDoNext["measured"][number] | null {
  const items = (next?.measured ?? []).filter((m) => m.included);
  return (
    items.find((m) =>
      m.findingRule ? m.findingRule === finding.rule : m.title === finding.recommendation.title,
    ) ?? null
  );
}

/**
 * P09.next (Standard and Enhanced): each finding once (S01B part 4c, amendment 52) -- at most 3 problems and 1
 * strength (shownFindings), each card carrying its Action Center item's priority and status and the agency's note --
 * then OTHER ACTIONS FROM THIS AUDIT (measured items not shown as a finding, findings beyond the limit included),
 * RECOMMENDED BY {AGENCY}, DONE SINCE THE LAST REPORT and GENERAL ADVICE, NOT DRAWN FROM THIS AUDIT (each only when
 * non-empty and switched on). Never "No finding rule matched".
 */
function NextSection({ ctx }: { ctx: Ctx }) {
  const v2 = ctx.data.v2;
  const next = v2?.whatToDoNext ?? null;
  const agencyName = v2?.agencyName ?? null;
  const shownRules = new Set(ctx.findings.map((f) => f.rule));
  const shownTitles = new Set(withAction(ctx.findings).map((f) => f.recommendation.title));
  // S01C part 3b (LLD amendment 61): High, Medium, Low, then newest first (the real reports had LOW before MEDIUM);
  // S02 part 0B (amendment 68): unless the agency saved an order for the group in the report contents panel.
  const others = orderOtherActions(
    (next?.measured ?? []).filter(
      (m) =>
        m.included && (m.findingRule ? !shownRules.has(m.findingRule) : !shownTitles.has(m.title)),
    ),
  );
  const agency = next?.agencyActions ?? [];
  const agencyLabelled =
    agency.length > 0 || (next?.measured ?? []).some((m) => m.included && !!m.note?.trim());
  const done = next?.includeDoneSinceLast ? next.doneSinceLast : [];
  const advice = next?.includeGeneralAdvice ? next.generalAdvice : [];
  const findingCards: ReactNode[] =
    ctx.findings.length > 0
      ? ctx.findings.map((f) => {
          const action = actionForFinding(f, next);
          return (
            <FindingCard
              key={f.rule}
              finding={f}
              action={
                action
                  ? {
                      priority: action.priority,
                      status: action.status,
                      note: action.note,
                      agencyName,
                    }
                  : null
              }
            />
          );
        })
      : [
          <View key="checked" style={{ ...s.tile, marginTop: px(12) }}>
            <Text style={{ fontSize: px(10.5), color: C.ink2 }}>{FINDINGS_CHECKED}</Text>
          </View>,
        ];
  return (
    <>
      <SectionStart />
      <View wrap={false}>
        <View style={{ marginTop: px(28) }}>
          <SectionLabel
            icon="search"
            eyebrow={`${ctx.plan.next} · Why, and what to do next`}
            provenance={`Measured · Audit #${ctx.data.basis.auditNumber}`}
          />
          <Text style={s.h2}>What we found, and what to do next</Text>
          <Text style={s.lede}>
            {/* S01C part 2c (LLD amendment 61): the agency sentence only when the report has its note or action. */}
            {agencyName && agencyLabelled
              ? `Each action shows the evidence from this audit. Notes and actions from ${agencyName} are labelled.`
              : "Each action shows the evidence from this audit."}
          </Text>
        </View>
        {findingCards[0]}
      </View>
      {findingCards.slice(1)}
      <Group
        label="OTHER ACTIONS FROM THIS AUDIT"
        items={others.map((m) => (
          <ActionCard
            key={m.key}
            priority={m.priority}
            status={m.status}
            title={m.title}
            evidence={m.evidence}
            note={m.note}
            agencyName={agencyName}
            evidenceInBody
          />
        ))}
      />
      <Group
        label={`RECOMMENDED BY ${(agencyName ?? "your agency").toUpperCase()}`}
        items={agency.map((a) => (
          <ActionCard
            key={a.id}
            priority={a.priority}
            status={a.status}
            title={a.title}
            evidence={a.detail}
            note={null}
            agencyName={agencyName}
            agency
          />
        ))}
      />
      <Group
        label="DONE SINCE THE LAST REPORT"
        items={done.map((d) => (
          <Text
            key={`${d.title}-${d.doneAt}`}
            style={{ fontSize: px(10), color: C.ink2, marginBottom: px(3) }}
          >
            ✓ {d.title} · {reportDate(new Date(d.doneAt), ctx.data.organizationId)}
          </Text>
        ))}
      />
      <Group
        label="GENERAL ADVICE, NOT DRAWN FROM THIS AUDIT"
        items={advice.map((a) => (
          <ActionCard
            key={a.title}
            priority="low"
            status={null}
            title={a.title}
            evidence={a.evidence}
            note={null}
            agencyName={agencyName}
          />
        ))}
      />
    </>
  );
}

// ---------------------------------------------- S01 part 7: beyond AI answers

const BEYOND_TONE: Record<BeyondTone, { bg: string; fg: string }> = {
  good: { bg: C.goodSoft, fg: C.good },
  warn: { bg: C.midSoft, fg: C.mid },
  bad: { bg: C.lowSoft, fg: C.low },
  neutral: { bg: C.surface2, fg: C.ink2 },
};

function BeyondTile({ view }: { view: BeyondTileView }) {
  return (
    <View wrap={false} style={{ ...s.tile, flex: 1, minHeight: px(96) }}>
      <Text style={s.tileK}>{view.label}</Text>
      {view.value ? (
        <Text style={s.tileV}>
          {view.value.main} <Text style={s.tileSmall}>{view.value.of}</Text>
        </Text>
      ) : null}
      {view.pill ? (
        <View style={{ flexDirection: "row", marginTop: px(4) }}>
          <SmallPill
            text={view.pill.text}
            bg={BEYOND_TONE[view.pill.tone].bg}
            fg={BEYOND_TONE[view.pill.tone].fg}
          />
        </View>
      ) : null}
      {view.lines.map((l) => (
        <Text
          key={l.text}
          style={{
            fontFamily: FONT.mono,
            fontSize: px(8.5),
            color: l.tone === "warn" ? C.mid : C.ink2,
            marginTop: px(3),
          }}
        >
          {l.text}
        </Text>
      ))}
      {view.action ? (
        <Text
          style={{ fontSize: px(8.5), color: C.ink3, marginTop: px(3) }}
        >{`Next step: ${view.action.text}`}</Text>
      ) : null}
    </View>
  );
}

/**
 * P09.beyond (Enhanced): 2 x 2 tiles, then "Your directory profiles" across both columns; the footer sentence. Since
 * S01B part 4e a section of the flowing pages: its heading held with the first row of tiles, each row unbreakable.
 */
function BeyondSection({ ctx }: { ctx: Ctx }) {
  const answers = ctx.data.v2?.beyondAi;
  if (!answers) return null;
  const views = beyondTileViews(answers, ctx.data.brand.id);
  const dir = answers.directories;
  return (
    <>
      <SectionStart />
      <View wrap={false}>
        <View style={{ marginTop: px(28) }}>
          <SectionLabel
            icon="list"
            eyebrow={`${ctx.plan.beyond} · Beyond AI answers`}
            provenance="Separate checks · own dates"
          />
          {/* S01C part 4 (LLD amendment 63): the earlier heading was a mild version of the claim amendment 56
              removed (what AI engines read). The audit page card keeps its title, "Beyond AI answers". */}
          <Text style={s.h2}>What else we checked about your business</Text>
          <Text style={s.lede}>{BEYOND_FOOTER}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: px(10), marginTop: px(12) }}>
          <BeyondTile view={views[0]} />
          <BeyondTile view={views[1]} />
        </View>
      </View>
      <View wrap={false} style={{ flexDirection: "row", gap: px(10), marginTop: px(10) }}>
        <BeyondTile view={views[2]} />
        <BeyondTile view={views[3]} />
      </View>
      {dir ? (
        <View wrap={false} style={{ ...s.tile, marginTop: px(10) }}>
          <Text style={s.tileK}>Your directory profiles</Text>
          <Text
            style={{
              fontSize: px(8),
              fontWeight: 700,
              letterSpacing: ls(8, 0.08),
              color: C.ink3,
              marginTop: px(2),
            }}
          >
            {`FROM AUDIT #${ctx.data.basis.auditNumber} · ${reportDate(new Date(ctx.data.basis.completedAt), ctx.data.organizationId).toUpperCase()}`}
          </Text>
          {directoriesLines(dir, ctx.plan.directories).map((line, i) => (
            <Text
              key={line}
              style={{
                fontSize: px(i === 0 ? 10 : 9.5),
                fontWeight: i === 0 ? 600 : 400,
                color: i === 0 ? C.ink : C.ink2,
                marginTop: px(i === 0 ? 6 : 3),
              }}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

// --------------------------------------------------- over time + next steps

/**
 * The runs of plotted points the chart joins with a line.
 *
 * 15 Nov, part 2: split where the everyday questions changed (a point with questionsChange starts a new run), so
 * the chart never draws a line between two question sets (Wren's #48 at 25% and #50 at 33% read as a rise).
 *
 * 15 Nov (rebrand), part 2: and an audit that isn't compared is never joined, on either side -- Wren's #47,
 * captioned "used 3 of 4 engines ... shown but not compared", was joined to #48. A point joins the run before it
 * only when it and the point before it are both comparable with the basis audit (every engine answered, the same
 * questions, methodology, models and Google basis, no model drift, a measured headline); anything else starts its
 * own run, and a run of one draws no line. A point without a value isn't plotted, so its neighbours stay joined.
 */
export function trendSegments<T extends { p: ReportTrendPoint }>(plotted: T[]): T[][] {
  const segments: T[][] = [];
  let previous: T | null = null;
  for (const point of plotted) {
    const joins =
      previous?.p.comparable === true && point.p.comparable && point.p.questionsChange === null;
    if (joins) segments[segments.length - 1].push(point);
    else segments.push([point]);
    previous = point;
  }
  return segments;
}

function TrendChart({ data }: { data: ReportData }) {
  const points = data.trend.points;
  const W = 682;
  const H = 190;
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const top = Math.min(100, Math.max(40, Math.ceil((Math.max(0, ...values) + 5) / 10) * 10));
  const step = top > 50 ? 20 : 10;
  const y = (v: number) => 180 - (v / top) * 160;
  const x = (i: number) => 40 + (632 / points.length) * (i + 0.5);
  const grid: number[] = [];
  for (let v = 0; v <= top; v += step) grid.push(v);
  const plotted = points.map((p, i) => ({ p, i })).filter(({ p }) => p.value !== null);
  return (
    <Svg width={px(W)} height={px(H)} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: px(14) }}>
      {grid.map((v) => (
        <G key={v}>
          <Line
            x1={40}
            y1={y(v)}
            x2={672}
            y2={y(v)}
            stroke={v === 0 ? "#94A3B8" : C.line}
            strokeWidth={1}
          />
          <Text
            x={32}
            y={y(v) + 3}
            textAnchor="end"
            fill={C.ink3}
            style={{ fontSize: 9, fontFamily: FONT.body }}
          >
            {v === 0 ? "0" : `${v}%`}
          </Text>
        </G>
      ))}
      {/* One line per run of compared audits: none across a change of questions, none to an audit not compared. */}
      {trendSegments(plotted).map((segment) =>
        segment.length > 1 ? (
          <Polyline
            key={`segment-${segment[0].p.auditId}`}
            points={segment.map(({ p, i }) => `${x(i)},${y(p.value as number)}`).join(" ")}
            fill="none"
            stroke={C.brand}
            strokeWidth={2.5}
          />
        ) : null,
      )}
      {plotted.map(({ p, i }) => (
        <G key={p.auditId}>
          <Circle
            cx={x(i)}
            cy={y(p.value as number)}
            r={6}
            fill={trendPointHollow(p) ? C.white : C.brand}
            stroke={C.brand}
            strokeWidth={trendPointHollow(p) ? 2.5 : 0}
          />
          <Text
            x={x(i)}
            y={y(p.value as number) - 14}
            textAnchor="middle"
            fill={C.ink}
            style={{ fontSize: 11, fontWeight: 700, fontFamily: FONT.body }}
          >
            {formatVisibilityPercent(p.value as number)}
          </Text>
        </G>
      ))}
    </Svg>
  );
}

/** Basic's Over time page, as today: the trend, then the prioritised list (S01B: its two blocks are shared). */
function TrendAndNextPage({ ctx }: { ctx: Ctx }) {
  const { plan } = ctx;
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader title={ctx.runningTitle} />
      {plan.trend && <TrendBlock ctx={ctx} />}
      {plan.trend && plan.recommended && <View style={s.rule} />}
      {plan.recommended && <RecommendedBlock ctx={ctx} />}
      <RunningFooter left={ctx.footerLeft} />
    </Page>
  );
}

/** "Over time": the trend chart with its caption, one unbreakable block (its heading included). */
function TrendBlock({ ctx }: { ctx: Ctx }) {
  const { data, plan } = ctx;
  const points = data.trend.points;
  const numbers = points.map((p) => p.auditNumber);
  const trendProv =
    numbers.length > 1
      ? `Measured · Audits #${numbers[0]}–#${numbers[numbers.length - 1]}`
      : `Measured · Audit #${numbers[0] ?? data.basis.auditNumber}`;
  // 2 Nov follow-up, item 2: each hollow point's own line ("Audit #37 used
  // 3 of 4 engines (Claude: …), so it's shown but not compared."), any
  // earlier audits left out, then the comparison -- like-for-like audits only.
  // 15 Nov, part 3: the notes are trendNoteLines, the same as trendLines, so an
  // audit excluded from trends is named here too (it never was).
  const caption = [
    ...trendNoteLines(data),
    data.trend.comparableCount < data.trend.minimum
      ? `Not enough comparable audits for a trend yet (minimum ${data.trend.minimum}); figures are shown as measured, without a trend claim.`
      : trendComparisonLine(data),
  ].filter((line): line is string => !!line);
  return (
    <View wrap={false} style={{ marginTop: px(28) }}>
      <SectionLabel icon="trend" eyebrow={`${plan.trend} · Over time`} provenance={trendProv} />
      <Text style={s.h2}>Visibility across recent audits</Text>
      <TrendChart data={data} />
      <View style={{ flexDirection: "row", paddingLeft: px(40) }}>
        {points.map((p) => (
          <View key={p.auditId} style={{ flex: 1, alignItems: "center" }}>
            {/* "Audit #32 · 23 Oct" fits a column up to 6 points; past
                    that, the date goes on its own line instead of wrapping. */}
            {points.length > 6 ? (
              <>
                <Text style={{ fontSize: px(9.5), fontWeight: 700, color: C.ink }}>
                  Audit #{p.auditNumber}
                </Text>
                <Text style={{ fontSize: px(9.5), color: C.ink2 }}>
                  {reportShortDate(new Date(p.completedAt), data.organizationId)}
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: px(9.5), color: C.ink2 }}>
                <Text style={{ fontWeight: 700, color: C.ink }}>Audit #{p.auditNumber}</Text> ·{" "}
                {reportShortDate(new Date(p.completedAt), data.organizationId)}
              </Text>
            )}
            <Text
              style={{
                fontSize: px(9.5),
                color: trendPointHollow(p) ? C.mid : C.ink2,
              }}
            >
              {/* S01C part 3e (amendment 64): why the point isn't compared ("○ 3 of 4 engines", "○ questions
                  changed"); the real report printed "○ 4 of 4 engines" under the audit whose questions changed. */}
              {trendPointLabel(p)}
              {p.value === null ? " · not enough answers" : ""}
            </Text>
          </View>
        ))}
      </View>
      <Text style={{ ...s.cap, marginTop: px(10) }}>{caption.join(" ")}</Text>
    </View>
  );
}

/** Basic's "Recommended next": the findings, prioritised by impact, one unbreakable block. */
function RecommendedBlock({ ctx }: { ctx: Ctx }) {
  const { plan } = ctx;
  // S01C part 2b: a finding with no action (an engine that cited no directory) isn't an item here.
  const findings = withAction(ctx.findings);
  return (
    <View wrap={false} style={{ marginTop: plan.trend ? 0 : px(28) }}>
      <SectionLabel
        icon="check"
        eyebrow={`${plan.recommended} · Recommended next`}
        provenance={
          plan.diagnosis
            ? `From findings in section ${plan.diagnosis}`
            : "From this audit's findings"
        }
      />
      <Text style={s.h2}>Prioritised by impact</Text>
      <Text style={{ ...s.cap, marginTop: px(4) }}>
        We don't project score gains: AI answers vary, and we only report what we measure. Progress
        shows up in your next audits.
      </Text>
      <View style={{ marginTop: px(8) }}>
        {findings.map((f, i) => (
          <View
            key={f.rule}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: px(12),
              paddingVertical: px(11),
              borderBottomWidth: i === findings.length - 1 ? 0 : 0.75,
              borderBottomStyle: "solid",
              borderBottomColor: C.line,
            }}
          >
            <Text
              style={{
                width: px(26),
                fontFamily: FONT.display,
                fontWeight: 600,
                fontSize: px(17),
                color: C.brand,
              }}
            >
              {i + 1}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: px(11.5), fontWeight: 600 }}>{f.recommendation.title}</Text>
              <Text style={{ fontSize: px(9.5), color: C.ink2, marginTop: px(2) }}>
                {f.recommendation.detail}
              </Text>
            </View>
            <Text
              style={{
                fontSize: px(8.5),
                fontWeight: 600,
                color: C.brandOnSoft,
                backgroundColor: C.brandSoft,
                borderRadius: 999,
                paddingVertical: px(4),
                paddingHorizontal: px(9),
              }}
            >
              {/* The finding's own number on the Diagnosis page: a finding with no action is left out here. */}
              {plan.diagnosis
                ? `Finding ${ctx.findings.indexOf(f) + 1} · ${f.severity.short}`
                : f.severity.short}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** S01B part 4e: "Over time" in the flowing pages (Standard and Enhanced drop the prioritised list, LLD 8.1.2). */
function TrendSection({ ctx }: { ctx: Ctx }) {
  const { plan } = ctx;
  if (!plan.trend && !plan.recommended) return null;
  return (
    <>
      <SectionStart />
      {plan.trend && <TrendBlock ctx={ctx} />}
      {plan.trend && plan.recommended && <View style={s.rule} />}
      {plan.recommended && <RecommendedBlock ctx={ctx} />}
    </>
  );
}

// ------------------------------------------------------------------- method

/** P09.method: "identity {date} · YouTube {date} · crawlers {date} · technical {date}". */
function checksOutsideLine(a: BeyondAiAnswers): string {
  const when = (checkedAt: string | null, missing: string) =>
    checkedAt ? formatCheckDate(checkedAt) : missing;
  return [
    `identity ${when(a.identity.checkedAt, "not checked")}`,
    `YouTube ${when(a.youtube.checkedAt, a.youtube.state === "not_linked" ? "not linked" : "not checked")}`,
    `crawlers ${when(a.crawlers.checkedAt, "not checked")}`,
    // S01C part 4 (LLD amendment 63; contract v1.6 P09.method): the scoring version is printed here, not on the tile.
    `technical ${when(a.technical.checkedAt, "not checked")}${a.technical.checkedAt && a.technical.scoringVersion ? `, v${a.technical.scoringVersion} scoring` : ""}`,
  ].join(" · ");
}

/**
 * The method page's content: heading, the two columns, the rule and the closing line. Basic's page holds it alone, as
 * today; in the flowing pages it is kept whole (S01B part 6b).
 */
function MethodContent({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const h = headlineFigures(data);
  const location = locationText(data);
  const time = duration(data.basis.startedAt, data.basis.completedAt);
  const auditLine = [
    `#${data.basis.auditNumber}`,
    reportDate(new Date(data.basis.completedAt), data.organizationId),
    ...(time ? [time] : []),
  ].join(" · ");
  const p = { fontSize: px(10), lineHeight: 15 / 10, color: C.ink2 };
  const kv: Array<[string, string]> = [
    ["Audit", auditLine],
    ["Why this audit", basisReasonText(data)],
    ["Method", capitalise(data.basis.methodology)],
    ["Engines answered", coverageLine(data)],
    [
      "Answers",
      [
        ...(data.answers.planned !== null ? [`${data.answers.planned} planned`] : []),
        `${data.answers.answered} answered`,
        `${data.answers.failed} failed`,
      ].join(" · "),
    ],
    [
      "Engines",
      data.engines
        .map((e) =>
          e.models.length > 0 ? `${e.name} (${e.models.join(", ")})` : `${e.name} (no answers)`,
        )
        .join(", "),
    ],
    // Sri's decision 6 (7 Nov): a provider answered with a different model than the one asked for.
    ...(data.modelDrift.length > 0
      ? [["Model note", data.modelDrift.map(modelDriftNote).join("; ")] as [string, string]]
      : []),
    ...(location ? [["Location", location] as [string, string]] : []),
    // S01 part 7 (LLD 8.1.2, P09.method, appendix E): the question mix; the checks outside AI answers in Enhanced.
    ...(data.v2
      ? [["Questions asked", questionMixLine(data.v2.questionMix)] as [string, string]]
      : []),
    ...(data.v2?.beyondAi
      ? [["Checks outside AI answers", checksOutsideLine(data.v2.beyondAi)] as [string, string]]
      : []),
  ];
  const glossary: Array<[string, string]> = [
    [
      "Visibility",
      `The share of everyday answers that mention you.${h.percent ? ` ${h.percent} = ${h.kOfN}.` : ""}`,
    ],
    [
      "95% confidence interval",
      "The range the true rate very likely falls in, given how many answers we have. More answers give a narrower range.",
    ],
    ["Typical position", "Your median rank when an answer lists several businesses."],
    ["Source cited", "How many of your mentions linked to a web page as their source."],
    [
      "Directory citation",
      // 16 Nov, part 3: the example is one of this brand's own directories ("e.g. Yellow Pages" for a café), never
      // hipages for everyone; none when the brand has no directory list (software).
      `An answer that links a directory page${data.directories.rows[0] ? ` (e.g. ${data.directories.rows[0].name})` : ""}. "Your profile" means the link goes to your own listing, which we can only check once you add your profile links.`,
    ],
  ];
  return (
    <>
      <View style={{ marginTop: px(28) }}>
        <SectionLabel
          icon={null}
          eyebrow={`${ctx.plan.method} · Method and notes`}
          provenance={ctx.basisProv}
        />
        <Text style={s.h2}>How these numbers were measured</Text>
      </View>
      <View style={{ flexDirection: "row", gap: px(28), marginTop: px(18) }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...s.h3, marginBottom: px(6) }}>What we asked</Text>
          <Text style={p}>
            {data.questions.perEngine !== null
              ? `${data.questions.perEngine} questions per engine: `
              : ""}
            {data.questions.everyday} everyday questions a local customer would ask (they don't name
            your business) and {data.questions.branded} branded questions.{" "}
            <Text style={{ fontWeight: 600, color: C.ink }}>
              Visibility uses the everyday questions only.
            </Text>
          </Text>
          <Text style={{ ...s.h3, marginTop: px(16), marginBottom: px(6) }}>
            What counts as a mention
          </Text>
          <Text style={p}>
            Your business is named in the answer and verified against your business details. Similar
            names that don't match aren't counted.
          </Text>
          <Text style={{ ...s.h3, marginTop: px(16), marginBottom: px(6) }}>What's excluded</Text>
          {[
            "Answers that failed (errors are shown, never counted)",
            "Branded questions, from the headline",
            "Engines that failed every question, from comparisons over time",
            // 15 Nov, part 3: audits Vunnara excluded from trends, with the reason.
            excludedAuditsMethodItem(data),
          ].map((item) => (
            <View
              key={item}
              style={{ flexDirection: "row", marginBottom: px(4), paddingLeft: px(4) }}
            >
              <Text style={{ ...p, width: px(10) }}>•</Text>
              <Text style={{ ...p, flex: 1 }}>{item}</Text>
            </View>
          ))}
          <Text style={{ ...s.h3, marginTop: px(16), marginBottom: px(6) }}>Audit details</Text>
          {kv.map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", marginBottom: px(5) }}>
              <Text style={{ ...p, width: px(120), color: C.ink3 }}>{k}</Text>
              <Text style={{ ...p, flex: 1, color: C.ink }}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...s.h3, marginBottom: px(6) }}>Glossary</Text>
          {glossary.map(([dt, dd]) => (
            <View key={dt} style={{ marginTop: px(8) }}>
              <Text style={{ fontSize: px(10), fontWeight: 600, color: C.ink }}>{dt}</Text>
              <Text style={p}>{dd}</Text>
            </View>
          ))}
          <Text style={{ ...s.h3, marginTop: px(16), marginBottom: px(6) }}>Good to know</Text>
          <Text style={p}>
            AI answers change over time and by location. A single audit is a snapshot; regular
            audits show the direction.
          </Text>
          <Text style={{ ...p, marginTop: px(6) }}>{EVIDENCE_ARCHIVE_SENTENCE}</Text>
          <Text style={{ ...s.h3, marginTop: px(16), marginBottom: px(6) }}>Data residency</Text>
          <Text style={p}>
            Your account data is stored in {data.residency.accountData}. This report is stored in{" "}
            {data.residency.reportStorage}.
          </Text>
        </View>
      </View>
      <View style={{ ...s.rule, marginTop: px(28) }} />
      <Text style={s.cap}>
        Generated {ctx.generated} by {PRODUCT_NAME}
        {data.agency.name ? ` for ${data.agency.name}` : ""}. Figures come from the audit records
        listed above and match the {PRODUCT_NAME} dashboard.
      </Text>
    </>
  );
}

function MethodPage({ ctx }: { ctx: Ctx }) {
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader title={ctx.runningTitle} />
      <MethodContent ctx={ctx} />
      <RunningFooter left={ctx.footerLeft} />
    </Page>
  );
}

/**
 * S01B part 4e (LLD amendment 52; contract P09 layout): Standard and Enhanced from "Why, and what to do next" onwards,
 * one flowing run of pages -- Why and what to do next, Beyond AI answers (Enhanced), Over time, Method and notes -- with
 * the running header and footer on each page.
 */
function FlowingPages({ ctx }: { ctx: Ctx }) {
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader title={ctx.runningTitle} />
      {ctx.plan.next && <NextSection ctx={ctx} />}
      {/* S01C part 3c (amendment 62): Over time before Beyond AI answers. */}
      <TrendSection ctx={ctx} />
      {ctx.plan.beyond && <BeyondSection ctx={ctx} />}
      {/* S01B part 6b (amendment 52, contract v1.5 P09 layout): Method and notes is kept whole -- one unbreakable
          block, so it starts on a new page when it doesn't fit in the space left. Both Standard seeds ended with a
          page 7 holding only Method's last lines. (Basic's own Method page holds it alone, so it fits on one.) */}
      {ctx.plan.method && (
        <View wrap={false}>
          <MethodContent ctx={ctx} />
        </View>
      )}
      <RunningFooter left={ctx.footerLeft} />
    </Page>
  );
}

// ----------------------------------------------------------------- document

/** The agency fields the cover's top bar and the page footer print. */
export interface FooterAgency {
  name: string | null;
  footerText: string | null;
  contactLine: string | null;
}

/** Every page's footer, left side: "Confidential · Prepared for Example Plumbing by Harbour Agency · 02 5550 0000". */
export function footerLeftText(agency: FooterAgency, brandName: string): string {
  const prepared = agency.name
    ? `Prepared for ${brandName} by ${agency.name}`
    : `Prepared for ${brandName}`;
  return [
    agency.footerText ?? "Confidential",
    prepared,
    ...(agency.contactLine ? [agency.contactLine] : []),
  ].join(" · ");
}

export function reportContext(data: ReportDataV2): Ctx {
  // S01B part 4d (LLD amendment 52): today's limit in every tier -- at most 3 problems and 1 strength (shownFindings).
  const findings = shownFindings(reportFindings(data));
  const plan = reportPlan(data, findings);
  return {
    data,
    findings,
    plan,
    basisProv: `Measured · Audit #${data.basis.auditNumber}`,
    runningTitle: `AI Visibility Report · ${data.brand.name} · ${periodTitle(data)}`,
    footerLeft: footerLeftText(data.agency, data.brand.name),
    generated: reportDateTime(new Date(data.generatedAt), data.organizationId),
  };
}

export interface BrandingPreviewProps {
  agency: FooterAgency;
  /** Whose report: "Prepared for <brandName> by <agency>". */
  brandName: string;
  logo: AgencyLogo | null;
}

/**
 * 2 Nov -- Account -> Report branding's live preview, as a one-page PDF:
 * the cover's top bar (CoverTopBar, on the cover's navy) and the footer of
 * every later page (RunningFooter) -- the report's own components, with the
 * values being edited. No audit figures: there are none to show.
 */
export function BrandingPreviewDocument({ agency, brandName, logo }: BrandingPreviewProps) {
  return (
    <Document
      title="Report branding preview"
      author={agency.name ?? PRODUCT_NAME}
      creator={PRODUCT_NAME}
      producer={PRODUCT_NAME}
    >
      <Page
        size={[PAGE.width, px(300)]}
        style={{ backgroundColor: C.white, fontFamily: FONT.body, color: C.ink }}
      >
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: px(126),
            backgroundColor: C.navy900,
          }}
        />
        <CoverTopBar agencyName={agency.name} logo={logo} />
        <Text
          style={{
            position: "absolute",
            top: px(150),
            left: PAGE.padX,
            right: PAGE.padX,
            fontSize: px(10),
            color: C.ink3,
          }}
        >
          Above: the top of the report's cover. Below: the footer on every page after it.
        </Text>
        <RunningFooter left={footerLeftText(agency, brandName)} />
      </Page>
    </Document>
  );
}

export function ReportDocument({
  data,
  logo = null,
}: {
  data: ReportDataV2;
  logo?: AgencyLogo | null;
}) {
  const ctx = reportContext(data);
  return (
    <Document
      title={`AI Visibility Report · ${data.brand.name} · ${periodTitle(data)}`}
      author={data.agency.name ?? PRODUCT_NAME}
      creator={PRODUCT_NAME}
      producer={PRODUCT_NAME}
    >
      <Cover ctx={ctx} logo={logo} />
      <SummaryPage ctx={ctx} />
      <EnginesPages ctx={ctx} />
      <DirectoriesPage ctx={ctx} />
      {ctx.plan.diagnosis && <DiagnosisPage ctx={ctx} />}
      {ctx.plan.next ? (
        // S01B part 4e: Standard and Enhanced flow from "Why, and what to do next" onwards.
        <FlowingPages ctx={ctx} />
      ) : (
        <>
          {(ctx.plan.trend || ctx.plan.recommended) && <TrendAndNextPage ctx={ctx} />}
          {ctx.plan.method && <MethodPage ctx={ctx} />}
        </>
      )}
    </Document>
  );
}
