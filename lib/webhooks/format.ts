import { formatAirtable } from "./channels/airtable";
import { formatCustomHttp } from "./channels/custom-http";
import { formatDiscord } from "./channels/discord";
import { formatSheets } from "./channels/sheets";
import { formatSlack } from "./channels/slack";
import { SCORE_BASIS } from "./events";

/** Payload keys that carry a headline-score number (or delta of one). */
const SCORE_KEYS = ["scoreComposite", "currentScore", "previousScore", "scoreDelta"] as const;

/**
 * Vunnara (19 Oct): for the pass-through shapes (custom HTTP's `data`),
 * add `score_basis` next to the existing score field(s) -- only when the
 * payload actually carries one, so score-less events (recommendation,
 * hallucination, ...) aren't given a meaningless field.
 */
function withScoreBasis(p: Record<string, unknown>): Record<string, unknown> {
  return SCORE_KEYS.some((k) => k in p) ? { ...p, score_basis: SCORE_BASIS } : p;
}

export function formatForChannel(channel: string, eventName: string, payload: unknown): unknown {
  const p = payload as Record<string, unknown>;
  switch (channel) {
    case "slack":
      return formatSlack(eventName, p);
    case "discord":
      return formatDiscord(eventName, p);
    case "sheets":
      return formatSheets(eventName, p);
    case "airtable":
      return formatAirtable(eventName, p);
    case "email": {
      const score = p.scoreComposite ?? p.currentScore;
      const scoreText =
        score == null ? "not enough data yet" : `mentioned in ${Number(score).toFixed(1)}% of AI answers`;
      return {
        to: p.url ?? "",
        subject: `VisibleAU: ${eventName}`,
        html: `<p>${p.brandName ?? "Brand"} — ${scoreText}</p><a href="${p.url ?? ""}">View audit</a>`,
        score_basis: SCORE_BASIS,
      };
    }
    case "custom":
      return formatCustomHttp(eventName, p && typeof p === "object" ? withScoreBasis(p) : payload);
    default:
      return payload;
  }
}
