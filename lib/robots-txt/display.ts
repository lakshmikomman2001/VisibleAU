import { getAllBots } from "./ai-bots";
import type { RobotsBotVerdict, RobotsFindings } from "./analyze";

/**
 * 17 Nov, part 3: what the robots.txt page shows for each AI crawler, from the stored findings alone.
 *
 * Before, only the 5 tier-1 crawlers were looked at (by a regex), and every other one showed a green tick and
 * "Default", so a tier read "All allowed 9/9" with nothing checked. Now a crawler shows a verdict only when the
 * audit evaluated it (findings.robots.botVerdicts, lib/robots-txt/evaluate.ts); otherwise "Not checked".
 */
export type BotRow = { checked: true; verdict: RobotsBotVerdict } | { checked: false };

export type MatrixState =
  | { evaluated: true }
  /** "legacy": an audit from before every crawler was evaluated; "unreadable": robots.txt didn't answer. */
  | { evaluated: false; reason: "legacy" | "unreadable" | "no_findings" };

export function robotsMatrixState(robots: Partial<RobotsFindings> | undefined): MatrixState {
  if (!robots) return { evaluated: false, reason: "no_findings" };
  if (robots.fetchStatus === "unreachable") return { evaluated: false, reason: "unreadable" };
  if (!Array.isArray(robots.botVerdicts)) return { evaluated: false, reason: "legacy" };
  return { evaluated: true };
}

export function botRow(robots: Partial<RobotsFindings> | undefined, userAgent: string): BotRow {
  if (robotsMatrixState(robots).evaluated !== true) return { checked: false };
  const verdict = robots?.botVerdicts?.find((v) => v.userAgent === userAgent);
  return verdict ? { checked: true, verdict } : { checked: false };
}

export const NOT_CHECKED_BOT = "Not checked";

/** The badge beside a crawler: what robots.txt says, and from which of its rules. */
export function botStatusLabel(row: BotRow): string {
  if (!row.checked) return NOT_CHECKED_BOT;
  const { verdict, basis } = row.verdict;
  if (verdict === "blocked") {
    return basis === "wildcard-group" ? "Blocked (rules for every crawler)" : "Blocked";
  }
  switch (basis) {
    case "agent-group":
      return "Allowed";
    case "wildcard-group":
      return "Allowed (rules for every crawler)";
    case "no-matching-group":
      return "Allowed (no rule for it)";
    case "no-robots-txt":
      return "Allowed (no robots.txt)";
  }
}

/** Why the matrix has no verdicts, in the customer's words. */
export function matrixNotCheckedSentence(state: MatrixState): string | null {
  if (state.evaluated) return null;
  switch (state.reason) {
    case "unreadable":
      return "We couldn't read your robots.txt on this audit, so no crawler below was checked.";
    case "legacy":
      return "This audit ran before we checked every crawler against your robots.txt. Run the audit again to see each one.";
    case "no_findings":
      return "This audit has no robots.txt result, so no crawler below was checked.";
  }
}

/** A tier's header: "7 of 9 allowed", or "Not checked" when nothing in it was evaluated. */
export function tierSummary(
  robots: Partial<RobotsFindings> | undefined,
  userAgents: readonly string[],
): { checked: false } | { checked: true; allowed: number; blocked: number; total: number } {
  const rows = userAgents.map((ua) => botRow(robots, ua));
  if (rows.some((r) => !r.checked)) return { checked: false };
  const blocked = rows.filter((r) => r.checked && r.verdict.verdict === "blocked").length;
  return { checked: true, allowed: rows.length - blocked, blocked, total: rows.length };
}

/**
 * The crawlers the suggested robots.txt allows: the ones the registry recommends allowing (defaultAllow), less
 * any the site's own robots.txt blocks in a group of its own (a choice the owner made on purpose). It used to be
 * "every crawler not in the blocked list", which was all 27 when only 5 had been checked.
 */
export function snippetAgents(robots: Partial<RobotsFindings> | undefined): string[] {
  const deliberateBlocks = new Set(
    robotsMatrixState(robots).evaluated
      ? (robots?.botVerdicts ?? [])
          .filter((v) => v.verdict === "blocked" && v.basis === "agent-group")
          .map((v) => v.userAgent)
      : [],
  );
  return getAllBots()
    .filter((b) => b.defaultAllow && !deliberateBlocks.has(b.userAgent))
    .map((b) => b.userAgent);
}
