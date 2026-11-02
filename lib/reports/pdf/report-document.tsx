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
import { directoryProfileStatus } from "@/lib/directories/profile-status";
import { PRODUCT_NAME } from "@/lib/product";
import { HEADLINE_COLOR_THRESHOLDS, headlineColorBand } from "@/lib/scoring/headline-color";
import { positionCard, sourceCitationCard } from "@/lib/scoring/measured-display";
import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";
import { EVIDENCE_ARCHIVE_SENTENCE } from "@/lib/trust/evidence-archiver";
import { type AgencyLogo, agencyInitials } from "../agency-branding";
import type { ReportData, ReportMatrixRow } from "../report-data";
import { type EvidenceTone, type Finding, reportFindings } from "../report-findings";
import {
  answeringEngineNames,
  basisReasonText,
  citedDirectories,
  coverageLine,
  headlineFigures,
  locationText,
  partialTrendLine,
  periodFull,
  periodTitle,
  plural,
  trendComparisonLine,
  trendLeftOutLine,
} from "../report-format";
import { countWord, reportNarrative } from "../report-narrative";
import { reportDate, reportDateTime, reportShortDate } from "../report-period";
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

/** "Web-grounded (v2)" from "web-grounded (v2)". */
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

function Mark({ size, font }: { size: number; font: number }) {
  return (
    <View
      style={{
        width: px(size),
        height: px(size),
        borderRadius: px(size * 0.28),
        backgroundColor: C.brand,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: C.white, fontSize: px(font), fontWeight: 700 }}>V</Text>
    </View>
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
        <Mark size={18} font={11} />
        <Text
          style={{ fontSize: px(11), fontWeight: 700, color: C.ink, letterSpacing: ls(11, 0.02) }}
        >
          {PRODUCT_NAME}
        </Text>
      </View>
      <Text
        style={{
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
  directories: string;
  diagnosis: string | null;
  trend: string | null;
  recommended: string | null;
  method: string | null;
}

/** Section numbers ("01"...) for the sections this report includes. */
export function reportPlan(data: ReportData, findings: Finding[]): ReportPlan {
  let n = 0;
  const next = () => String(++n).padStart(2, "0");
  const summary = next();
  const engines = next();
  const directories = next();
  const diagnosis = data.sections.diagnosis ? next() : null;
  const trend = data.sections.trend ? next() : null;
  const recommended = data.sections.recommended_next && findings.length > 0 ? next() : null;
  const method = data.sections.method ? next() : null;
  return { summary, engines, directories, diagnosis, trend, recommended, method };
}

interface Ctx {
  data: ReportData;
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
 * also drawn by Settings -> Report branding's preview
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
        <Mark size={16} font={10} />
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
          top: px(680),
          flexDirection: "row",
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
        <Text style={{ fontSize: px(9.5), color: C.coverMuted }}>
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
      d: "Add your directory listings in brand settings so we can match them",
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
  const narrative = reportNarrative(data, { diagnosisSection: ctx.plan.diagnosis });
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
        const rate = e.sampleCount > 0 ? (e.mentionedCount / e.sampleCount) * 100 : 0;
        const fill = BAND[headlineColorBand(rate)].fill;
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
              <View style={{ flex: 1, ...s.bar }}>
                {e.fullyFailed ? (
                  <Hatch width={px(CONTENT_W - 120 - 92 - 28)} height={px(12)} stripe={px(6)} />
                ) : (
                  <View
                    style={{
                      width: `${rate}%`,
                      height: px(12),
                      borderRadius: px(6),
                      backgroundColor: fill,
                    }}
                  />
                )}
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
                ) : e.sampleCount === 0 ? (
                  <Text style={{ fontSize: px(12), fontWeight: 600, color: C.ink3 }}>
                    No answers
                  </Text>
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
                {e.failureReason}
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
  const competitors = [
    { name: data.brand.name, mentions: data.mentionedCount, isYou: true },
    ...data.competitors.rows.map((c) => ({ ...c, isYou: false })),
  ].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
  const col = { name: px(120), count: px(64), profile: px(92) };
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader title={ctx.runningTitle} />
      <View style={{ marginTop: px(28) }}>
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
                Add your directory listings in brand settings so we can match them
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
          <View
            style={{
              flexDirection: "row",
              gap: px(12),
              marginTop: px(22),
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
                <Text style={{ width: col.name, fontSize: px(11.5), fontWeight: 600 }}>
                  {r.name}
                </Text>
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
          {data.competitors.configured ? (
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
                        width: `${data.sampleCount > 0 ? (c.mentions / data.sampleCount) * 100 : 0}%`,
                        height: px(12),
                        borderRadius: px(6),
                        backgroundColor: c.isYou ? C.brand : C.neutralFill,
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
                    {c.mentions} of {data.sampleCount}
                  </Text>
                </View>
              ))}
              <Text style={{ ...s.cap, marginTop: px(6) }}>
                Share of voice: how many of the same {data.sampleCount} everyday answers named each
                business.
              </Text>
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

function FindingCard({ finding }: { finding: Finding }) {
  const kind = KIND_COLOURS[finding.kind];
  const sev = SEV_COLOURS[finding.severity.tone];
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
        <Text style={{ fontSize: px(10), fontWeight: 600, color: C.ink }}>{finding.fix}</Text>
      </View>
    </View>
  );
}

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
            No finding rule matched this audit.
          </Text>
        </View>
      )}
      <RunningFooter left={ctx.footerLeft} />
    </Page>
  );
}

// --------------------------------------------------- over time + next steps

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
      {plotted.length > 1 && (
        <Polyline
          points={plotted.map(({ p, i }) => `${x(i)},${y(p.value as number)}`).join(" ")}
          fill="none"
          stroke={C.brand}
          strokeWidth={2.5}
        />
      )}
      {plotted.map(({ p, i }) => (
        <G key={p.auditId}>
          <Circle
            cx={x(i)}
            cy={y(p.value as number)}
            r={6}
            fill={p.partial ? C.white : C.brand}
            stroke={C.brand}
            strokeWidth={p.partial ? 2.5 : 0}
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

function TrendAndNextPage({ ctx }: { ctx: Ctx }) {
  const { data, plan, findings } = ctx;
  const points = data.trend.points;
  const numbers = points.map((p) => p.auditNumber);
  const trendProv =
    numbers.length > 1
      ? `Measured · Audits #${numbers[0]}–#${numbers[numbers.length - 1]}`
      : `Measured · Audit #${numbers[0] ?? data.basis.auditNumber}`;
  // 2 Nov follow-up, item 2: each hollow point's own line ("Audit #37 used
  // 3 of 4 engines (Claude: …), so it's shown but not compared."), any
  // earlier audits left out, then the comparison -- like-for-like audits only.
  const caption = [
    ...points.filter((p) => p.partial).map(partialTrendLine),
    trendLeftOutLine(data),
    data.trend.comparableCount < data.trend.minimum
      ? `Not enough comparable audits for a trend yet (minimum ${data.trend.minimum}); figures are shown as measured, without a trend claim.`
      : trendComparisonLine(data),
  ].filter((line): line is string => !!line);
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader title={ctx.runningTitle} />
      {plan.trend && (
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
                <Text style={{ fontSize: px(9.5), color: p.partial ? C.mid : C.ink2 }}>
                  {p.partial ? "○ " : ""}
                  {p.enginesAnswered} of {p.enginesPlanned} engines
                  {p.value === null ? " · not enough answers" : ""}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ ...s.cap, marginTop: px(10) }}>{caption.join(" ")}</Text>
        </View>
      )}
      {plan.trend && plan.recommended && <View style={s.rule} />}
      {plan.recommended && (
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
            We don't project score gains: AI answers vary, and we only report what we measure.
            Progress shows up in your next audits.
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
                  <Text style={{ fontSize: px(11.5), fontWeight: 600 }}>
                    {f.recommendation.title}
                  </Text>
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
                  {plan.diagnosis ? `Finding ${i + 1} · ${f.severity.short}` : f.severity.short}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <RunningFooter left={ctx.footerLeft} />
    </Page>
  );
}

// ------------------------------------------------------------------- method

function MethodPage({ ctx }: { ctx: Ctx }) {
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
    ...(location ? [["Location", location] as [string, string]] : []),
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
      'An answer that links a directory page (e.g. hipages). "Your profile" means the link goes to your own listing, which we can only check once you add your profile links.',
    ],
  ];
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader title={ctx.runningTitle} />
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

/** Every page's footer, left side: "Confidential · Prepared for Omega Services by Splice Marketing · 02 9000 0000". */
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

export function reportContext(data: ReportData): Ctx {
  const findings = reportFindings(data);
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
 * 2 Nov -- Settings -> Report branding's live preview, as a one-page PDF:
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
  data: ReportData;
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
      {(ctx.plan.trend || ctx.plan.recommended) && <TrendAndNextPage ctx={ctx} />}
      {ctx.plan.method && <MethodPage ctx={ctx} />}
    </Document>
  );
}
