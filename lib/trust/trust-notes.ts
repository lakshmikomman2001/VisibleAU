import { displayDate } from "./display-dates";
import type { TrustSummary } from "./trust-scorer";

type CheckFacts = Pick<
  TrustSummary,
  | "entityScore"
  | "entityCheckedAt"
  | "youtubePresenceScore"
  | "youtubeCheckStatus"
  | "youtubeCheckedAt"
>;

/**
 * 17 Nov, part 3 -- what the Overall Trust Score card says under the score: when each check behind it last
 * ran, and why a check that ran isn't in the score. The card named no dates, and a YouTube check that found no
 * channel it could confirm was averaged in as a measured 0 (lib/trust/trust-scorer.ts counts only a confirmed
 * channel now). Where each check is run from is true to the code: the Entity check runs with each audit
 * started from the app (lib/audit/run-technical-audit-inline.ts, from app/api/audits/route.ts); the YouTube
 * check runs each month (inngest/functions/audit-youtube-presence.ts) and from Refresh on its page.
 */
export function trustScoreNotes(facts: CheckFacts): string[] {
  const notes: string[] = [];

  if (facts.entityCheckedAt === null) {
    notes.push("Entity check: not run yet. It runs with each audit you start.");
  } else if (facts.entityScore === null) {
    notes.push(
      `Entity check: ${displayDate(facts.entityCheckedAt)}. None of its facts could be checked, so it isn't in the score.`,
    );
  } else {
    notes.push(`Entity check: ${displayDate(facts.entityCheckedAt)}.`);
  }

  const youtubeDate = facts.youtubeCheckedAt === null ? null : displayDate(facts.youtubeCheckedAt);
  if (youtubeDate === null) {
    notes.push(
      "YouTube check: not run yet. It runs each month, or from Refresh on the YouTube Presence page.",
    );
  } else if (facts.youtubePresenceScore !== null) {
    notes.push(`YouTube check: ${youtubeDate}.`);
  } else if (facts.youtubeCheckStatus === "not_found") {
    notes.push(
      `YouTube check: ${youtubeDate}. It found no channel we could confirm as this business's, so YouTube isn't in the score.`,
    );
  } else if (facts.youtubeCheckStatus === "unconfirmed") {
    notes.push(
      `YouTube check: ${youtubeDate}. It found a channel that might be this business's; YouTube is left out of the score until you confirm it on the YouTube Presence page.`,
    );
  } else if (facts.youtubeCheckStatus === "unavailable") {
    notes.push(`YouTube check: ${youtubeDate}. It couldn't run, so YouTube isn't in the score.`);
  } else {
    notes.push(
      `YouTube check: ${youtubeDate}. It has no confirmed result, so YouTube isn't in the score.`,
    );
  }

  return notes;
}
