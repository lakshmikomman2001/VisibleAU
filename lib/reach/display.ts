import { and, eq, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, brandQuestionSetItems, type QuestionReach } from "@/db/schema";
import { marketFor } from "@/lib/markets";
import { reachHeadlineLabel } from "./labels";
import { type BrandPlaceFields, placeForReach, reachLabel } from "./places";
import { loadAuditReachResults } from "./results";
import { isSmallSample } from "./split";

export { andList, reachHeadlineLabel, reachShortName, reachTileTooltip } from "./labels";

/**
 * S04 part 7 (LLD 8.4.6; contract P07.score, P07.reachRow, P09.reachRow): an audit's reaches as the audit page, the
 * client portal and the PDF show them, from audit_reach_results.
 * - The headline's label: "Local · Sydney" for an audit with one reach (the number is today's); "across Local, NSW and
 *   Australia" otherwise (D-QI9).
 * - One tile per reach, in reach order, only when the audit has more than one: "{label} {pct}%, {m} of {n} answers,
 *   95% CI"; a small sample under 5 questions.
 */

export interface ReachTile {
  reach: QuestionReach;
  label: string;
  everydayAnswers: number;
  mentioned: number;
  /** Mentioned of answered, in percent; null with no answers. */
  pct: number | null;
  /** The 95% interval in percent; null with no answers. */
  ciLow: number | null;
  ciHigh: number | null;
  /** The reach's everyday questions in the audit's set; null for an audit from the stored pack. */
  questions: number | null;
  smallSample: boolean;
}

export interface AuditReachView {
  headlineLabel: string;
  /** Empty for an audit with one reach (no reach row). */
  tiles: ReachTile[];
}

type Brand = BrandPlaceFields & { region: string };

export async function loadAuditReachView(
  db: DbClient,
  input: { auditId: string; brand: Brand },
): Promise<AuditReachView> {
  const market = marketFor(input.brand.region);
  const labelOf = (reach: QuestionReach) =>
    reachLabel(reach, placeForReach(reach, input.brand, market) ?? {}, market);
  const results = await loadAuditReachResults(db, input.auditId);
  const counts = await db
    .select({
      reach: brandQuestionSetItems.reach,
      n: sql<number>`count(*)::int`,
    })
    .from(brandQuestionSetItems)
    .innerJoin(audits, eq(audits.questionSetId, brandQuestionSetItems.setId))
    .where(and(eq(audits.id, input.auditId), eq(brandQuestionSetItems.kind, "everyday")))
    .groupBy(brandQuestionSetItems.reach);
  const questionsIn = new Map(counts.map((c) => [c.reach, Number(c.n)]));
  const tiles: ReachTile[] = results.map((r) => {
    const questions = questionsIn.get(r.reach) ?? null;
    return {
      reach: r.reach,
      label: labelOf(r.reach),
      everydayAnswers: r.everydayAnswers,
      mentioned: r.mentioned,
      pct: r.everydayAnswers > 0 ? (r.mentioned / r.everydayAnswers) * 100 : null,
      ciLow: r.ciLow === null ? null : r.ciLow * 100,
      ciHigh: r.ciHigh === null ? null : r.ciHigh * 100,
      questions,
      smallSample: questions !== null && isSmallSample(questions),
    };
  });
  return {
    headlineLabel: reachHeadlineLabel(tiles, labelOf("local")),
    tiles: tiles.length > 1 ? tiles : [],
  };
}
