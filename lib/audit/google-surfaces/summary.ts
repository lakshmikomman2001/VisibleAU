import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { auditGoogleSurfaces, googleSurfaceResults } from "@/db/schema";
import { findDirectoryByDomain } from "@/lib/directories/registry";
import type { GoogleLocation } from "@/lib/google-surfaces/location";
import { GOOGLE_SURFACE_NAMES, type GoogleSurface } from "@/lib/governance/google-surfaces";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import type { CitedLink } from "@/lib/serp/provider";
import type { StoredGoogleSettings } from "./dispatch";

/**
 * Google AI surfaces, Phase 1, part 3 -- what an audit's "Google Search AI" block says, wherever it's shown
 * (the audit page, the running page, both PDFs, the CSV, the client portal, the completion email). One
 * reader, one set of sentences, so they all say the same.
 *
 * Null for an audit that ran without Google: every surface then shows exactly what it showed before
 * (no empty "Google" section). An audit that ran with Google keeps showing it after Google is switched
 * off, labelled with when it ran.
 *
 * Counting (Sri, 8 Nov; docs/research/google-ai-surfaces.md 3.2):
 * - "no AI answer shown" is its own outcome, neither a failure nor "not mentioned";
 * - "mentioned" counts verified mentions only (the same rule as every engine), in everyday questions:
 *   a question that names the business isn't evidence it's found;
 * - questions that couldn't be checked (failed, not completed, skipped) are counted apart, with why;
 * - Google's own links (google.com/searchviewer) are counted, never shown as directory evidence.
 */

export type GoogleOutcome =
  | "pending"
  | "shown"
  | "not_shown"
  | "failed"
  | "not_completed"
  | "skipped";

export interface GoogleQuestionResult {
  promptIndex: number;
  prompt: string;
  isBranded: boolean;
  outcome: GoogleOutcome;
  reason: string | null;
  mentioned: boolean;
  verified: boolean;
  links: number;
  googleLinks: number;
}

export interface GoogleSurfaceRow {
  surface: GoogleSurface;
  name: string;
  /** "google.com.au" for AI Overviews; "google.com, Australia" for AI Mode (it runs on google.com, gl=AU). */
  domainLabel: string;
  questions: number;
  /** Questions Google actually answered for (an answer shown, or none shown): the counts' denominator. */
  checked: number;
  shown: number;
  notShown: number;
  pending: number;
  couldNotCheck: number;
  /** Everyday questions with an answer shown, and how many of those mention the business, verified. */
  everydayShown: number;
  everydayMentioned: number;
  /** Questions that name the business, with an answer shown, and how many mention it, verified. */
  brandedShown: number;
  brandedMentioned: number;
  googleLinks: number;
  directories: string[];
  reasons: string[];
  /** The one line: "AI Overviews: shown for 6 of 13 questions · you were mentioned in 2 of the 5 everyday ones". */
  line: string;
  results: GoogleQuestionResult[];
}

export interface GoogleSurfaceSummary {
  status: "queued" | "collecting" | "complete";
  statusReason: string | null;
  location: GoogleLocation | null;
  device: "desktop" | "mobile";
  /** "2153 NSW · desktop · 11 Nov 2026". */
  labelLine: string;
  /** "Results for Sydney NSW, not your suburb", when the location isn't the business's own. */
  locationNote: string | null;
  countInHeadline: boolean;
  costUsd: number | null;
  provider: string;
  ranAt: string;
  rows: GoogleSurfaceRow[];
}

export const GOOGLE_DOMAIN_LABELS: Record<GoogleSurface, string> = {
  google_ai_overviews: "google.com.au",
  google_ai_mode: "google.com, Australia",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const COULD_NOT_CHECK: readonly GoogleOutcome[] = ["failed", "not_completed", "skipped"];

/**
 * The surface's one line (12 Nov, after audit #44's 26 refused tasks read "shown for 0 of 13"): a check
 * that failed is never a result.
 * - nothing checked: "couldn't be checked this time", with no counts at all;
 * - some checked: the counts are over the questions checked ("shown for 9 of 11 checked"), and the rest
 *   are stated ("2 questions couldn't be checked");
 * - the mention part only when Google showed at least one answer to be mentioned in.
 */
function surfaceLine(
  row: Omit<GoogleSurfaceRow, "line">,
  status: GoogleSurfaceSummary["status"],
): string {
  if (status === "queued") return `${row.name}: starts when the four engines are done`;
  if (status !== "complete" && row.pending > 0) {
    const back = row.questions - row.pending;
    return `${row.name}: checking Google… ${back} of ${row.questions} questions back`;
  }
  if (row.checked === 0) return `${row.name}: couldn't be checked this time`;
  const partial = row.couldNotCheck > 0;
  const answered =
    row.surface === "google_ai_overviews"
      ? `shown for ${row.shown} of ${partial ? `${row.checked} checked` : plural(row.questions, "question")}`
      : `answered ${row.shown} of ${partial ? `${row.checked} checked` : row.questions}`;
  const parts = [`${row.name}: ${answered}`];
  if (row.shown > 0) {
    parts.push(
      row.everydayShown === 0
        ? "no everyday question had an answer to be mentioned in"
        : `you were mentioned in ${row.everydayMentioned} of the ${row.everydayShown} everyday ${row.everydayShown === 1 ? "one" : "ones"}`,
    );
  }
  if (partial) parts.push(`${plural(row.couldNotCheck, "question")} couldn't be checked`);
  return parts.join(" · ");
}

/**
 * One surface's counts and line from its questions' results (pure: the loader below reads them, and the
 * tests build them). `directories` are the directories its shown answers cite, Google's own links left out.
 */
export function summarizeGoogleSurface(input: {
  surface: GoogleSurface;
  results: GoogleQuestionResult[];
  directories: readonly string[];
  status: GoogleSurfaceSummary["status"];
}): GoogleSurfaceRow {
  const { surface, results, status } = input;
  const shown = results.filter((r) => r.outcome === "shown");
  const notShown = results.filter((r) => r.outcome === "not_shown").length;
  const couldNotCheck = results.filter((r) => COULD_NOT_CHECK.includes(r.outcome));
  const base: Omit<GoogleSurfaceRow, "line"> = {
    surface,
    name: GOOGLE_SURFACE_NAMES[surface],
    domainLabel: GOOGLE_DOMAIN_LABELS[surface],
    questions: results.length,
    checked: shown.length + notShown,
    shown: shown.length,
    notShown,
    pending: results.filter((r) => r.outcome === "pending").length,
    couldNotCheck: couldNotCheck.length,
    everydayShown: shown.filter((r) => !r.isBranded).length,
    everydayMentioned: shown.filter((r) => !r.isBranded && r.verified).length,
    brandedShown: shown.filter((r) => r.isBranded).length,
    brandedMentioned: shown.filter((r) => r.isBranded && r.verified).length,
    googleLinks: results.reduce((n, r) => n + r.googleLinks, 0),
    directories: [...input.directories].sort(),
    reasons: [...new Set(couldNotCheck.map((r) => r.reason).filter((x): x is string => !!x))],
    results,
  };
  return { ...base, line: surfaceLine(base, status) };
}

/** True when Google answered (or is still answering) at least one question on some surface. */
export function googleCheckedAnything(summary: GoogleSurfaceSummary): boolean {
  return summary.rows.some((r) => r.checked > 0 || r.pending > 0);
}

export async function loadGoogleSurfaceSummary(
  db: DbClient,
  auditId: string,
): Promise<GoogleSurfaceSummary | null> {
  const [snap] = await db
    .select()
    .from(auditGoogleSurfaces)
    .where(eq(auditGoogleSurfaces.auditId, auditId));
  if (!snap) return null;
  const rows = await db
    .select({
      surface: googleSurfaceResults.surface,
      promptIndex: googleSurfaceResults.promptIndex,
      prompt: googleSurfaceResults.prompt,
      isBranded: googleSurfaceResults.isBrandedPrompt,
      outcome: googleSurfaceResults.outcome,
      reason: googleSurfaceResults.outcomeReason,
      mentioned: googleSurfaceResults.brandMentioned,
      verification: googleSurfaceResults.mentionVerification,
      citedLinks: googleSurfaceResults.citedLinks,
      googleLinks: googleSurfaceResults.googleLinkCount,
    })
    .from(googleSurfaceResults)
    .where(eq(googleSurfaceResults.auditId, auditId))
    .orderBy(googleSurfaceResults.promptIndex);

  const settings = snap.settings as StoredGoogleSettings;
  const location = (snap.location as GoogleLocation | null) ?? null;
  const status = snap.status;
  const surfaceRows: GoogleSurfaceRow[] = (snap.surfaces as GoogleSurface[]).map((surface) => {
    const mine = rows.filter((r) => r.surface === surface);
    const results: GoogleQuestionResult[] = mine.map((r) => {
      const links = (r.citedLinks as CitedLink[] | null) ?? [];
      const verified =
        r.mentioned === true &&
        (r.verification === "verified_domain" || r.verification === "verified_location");
      return {
        promptIndex: r.promptIndex,
        prompt: r.prompt,
        isBranded: r.isBranded,
        outcome: r.outcome,
        reason: r.reason,
        mentioned: r.mentioned === true,
        verified,
        links: links.length,
        googleLinks: r.googleLinks ?? 0,
      };
    });
    const directories = new Set<string>();
    for (const r of mine.filter((x) => x.outcome === "shown")) {
      for (const link of (r.citedLinks as CitedLink[] | null) ?? []) {
        if (link.googleLink) continue;
        const dir = findDirectoryByDomain(link.domain);
        if (dir) directories.add(dir.name);
      }
    }
    return summarizeGoogleSurface({ surface, results, directories: [...directories], status });
  });

  const ranAt = snap.completedAt ?? snap.createdAt;
  const labelParts = [
    location?.label,
    settings.device,
    formatInOrgTimezone(new Date(ranAt), snap.organizationId, "d MMM yyyy"),
  ].filter(Boolean);
  return {
    status,
    statusReason: snap.statusReason,
    location,
    device: settings.device,
    labelLine: labelParts.join(" · "),
    locationNote: location?.note ?? null,
    countInHeadline: settings.countInHeadline === true,
    costUsd: snap.costUsd === null ? null : Number(snap.costUsd),
    provider: settings.provider,
    ranAt: new Date(ranAt).toISOString(),
    rows: surfaceRows,
  };
}

/** The block as plain lines, for the PDFs, the client portal and the email (the same words as the page). */
export interface GoogleSurfaceBlock {
  labelLine: string;
  locationNote: string | null;
  lines: string[];
  note: string;
}

export function googleSurfaceBlock(summary: GoogleSurfaceSummary): GoogleSurfaceBlock {
  // The same rule as the audit page's block: nothing checked and a reason for the whole audit -> that reason.
  const lines =
    summary.rows.length === 0 ||
    summary.rows.every((r) => r.questions === 0 && summary.status === "complete") ||
    (summary.status === "complete" && summary.statusReason && !googleCheckedAnything(summary))
      ? [
          `Google couldn't be checked for this audit${summary.statusReason ? `: ${summary.statusReason}` : "."}`,
        ]
      : summary.rows.map((r) => r.line);
  const counted = summary.countInHeadline
    ? "Counted in the Visibility %, for the questions where Google showed an AI answer."
    : "Not counted in the Visibility %: Google is shown on its own.";
  return {
    labelLine: summary.labelLine,
    locationNote: summary.locationNote,
    lines,
    note: `${counted} Checked logged out, for this place and device; Google's AI answers change with time and place.`,
  };
}

/** One row per surface and question, for the audit's CSV export (only an audit that ran with Google has any). */
export async function loadGoogleSurfaceExportRows(db: DbClient, auditId: string) {
  const rows = await db
    .select({
      surface: googleSurfaceResults.surface,
      prompt: googleSurfaceResults.prompt,
      promptIndex: googleSurfaceResults.promptIndex,
      outcome: googleSurfaceResults.outcome,
      brandMentioned: googleSurfaceResults.brandMentioned,
      position: googleSurfaceResults.position,
      answerText: googleSurfaceResults.answerText,
      citedLinks: googleSurfaceResults.citedLinks,
      provider: googleSurfaceResults.provider,
      costUsd: googleSurfaceResults.costUsd,
      createdAt: googleSurfaceResults.createdAt,
    })
    .from(googleSurfaceResults)
    .where(eq(googleSurfaceResults.auditId, auditId))
    .orderBy(googleSurfaceResults.surface, googleSurfaceResults.promptIndex);
  return rows.map((r) => ({
    ...r,
    // Directory evidence and the CSV leave Google's own links out (they name no business).
    domains: ((r.citedLinks as CitedLink[] | null) ?? [])
      .filter((l) => !l.googleLink)
      .map((l) => l.domain),
  }));
}

/**
 * Of these audits, the ones that counted Google in their headline (off by default). Trends, drift and
 * comparisons compare like with like: an audit that counted Google is never set against one that didn't.
 */
export async function auditsCountingGoogle(
  db: DbClient,
  auditIds: readonly string[],
): Promise<Set<string>> {
  if (auditIds.length === 0) return new Set();
  const rows = await db
    .select({ auditId: auditGoogleSurfaces.auditId })
    .from(auditGoogleSurfaces)
    .where(
      and(
        inArray(auditGoogleSurfaces.auditId, [...auditIds]),
        sql`(${auditGoogleSurfaces.settings}->>'countInHeadline')::boolean IS TRUE`,
      ),
    );
  return new Set(rows.map((r) => r.auditId));
}
