import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import {
  brandQuestionSetItems,
  brandQuestionSets,
  brandQuestions,
  brands,
  type QuestionKind,
  type QuestionReach,
} from "@/db/schema";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { computeQuestionSetHash } from "./hash";

/**
 * S02 part 3 (LLD 8.2.1): a brand's current question set, as the audit runners read it, and the one place a stored
 * question pack becomes a new set version.
 *
 * Why the second: from S02 audits ask the current set (lib/audit/get-audit-prompts.ts), but the pack is still rewritten
 * by lib/prompts/regenerate-prompt-pack.ts (a rename, a location change, a newer generator), and today's audits then
 * ask the new pack. Writing each new pack as the next set version keeps the set equal to the pack, so an audit asks
 * exactly what it asked before S02 (N1) -- a renamed brand never keeps asking questions with its old name (which
 * would also type them everyday and count them, N4).
 */

/** The current set's questions in position order; null when the brand has no current set. */
export interface CurrentQuestionSet {
  setId: string;
  version: number;
  items: Array<{ questionId: string; text: string; kind: QuestionKind; reach: QuestionReach }>;
}

export async function loadCurrentQuestionSet(
  db: DbClient,
  brandId: string,
): Promise<CurrentQuestionSet | null> {
  const rows = await db
    .select({
      setId: brandQuestionSets.id,
      version: brandQuestionSets.version,
      questionId: brandQuestions.id,
      text: brandQuestions.text,
      kind: brandQuestionSetItems.kind,
      reach: brandQuestionSetItems.reach,
    })
    .from(brandQuestionSets)
    .innerJoin(brandQuestionSetItems, eq(brandQuestionSetItems.setId, brandQuestionSets.id))
    .innerJoin(brandQuestions, eq(brandQuestions.id, brandQuestionSetItems.questionId))
    .where(and(eq(brandQuestionSets.brandId, brandId), eq(brandQuestionSets.isCurrent, true)))
    .orderBy(asc(brandQuestionSetItems.position));
  const first = rows[0];
  if (!first) return null;
  return {
    setId: first.setId,
    version: first.version,
    items: rows.map((r) => ({
      questionId: r.questionId,
      text: r.text,
      kind: r.kind,
      reach: r.reach,
    })),
  };
}

/** brand_questions' CHECK (migration 0155). */
const QUESTION_LENGTH = { min: 10, max: 200 } as const;

export type PackSetResult =
  | { written: true; setId: string; version: number }
  | { written: false; reason: "empty_pack" | "question_length" | "duplicate_question" };

/**
 * Writes `pack` (the brand's new stored pack, in order) as the brand's next set version, current: each question from
 * the library when a live row has exactly its text and kind, otherwise a new library row (source 'original', reach
 * 'local', kind by isBrandedPrompt, as the backfill typed them), a live row with the same compared text but other
 * words or kind archived first (one live row per compared text). Run inside the transaction that stores the pack.
 *
 * A pack the library can't hold (a question outside 10-200 characters) leaves the brand with no current set, so its
 * audits fall back to asking the stored pack, exactly as before S02.
 */
export async function writeSetFromPack(
  tx: DbClient,
  input: { brandId: string; pack: readonly string[]; note: string },
): Promise<PackSetResult> {
  // The brand row, locked, so two writes for one brand take turns over the version number.
  const [brand] = await tx
    .select({
      organizationId: brands.organizationId,
      name: brands.name,
      domain: brands.domain,
      aliases: brands.aliases,
    })
    .from(brands)
    .where(eq(brands.id, input.brandId))
    .for("update");
  if (!brand || input.pack.length === 0) return { written: false, reason: "empty_pack" };

  const clearCurrent = () =>
    tx
      .update(brandQuestionSets)
      .set({ isCurrent: false })
      .where(
        and(eq(brandQuestionSets.brandId, input.brandId), eq(brandQuestionSets.isCurrent, true)),
      );

  if (input.pack.some((q) => q.length < QUESTION_LENGTH.min || q.length > QUESTION_LENGTH.max)) {
    await clearCurrent();
    console.warn(
      JSON.stringify({
        event: "question_set_not_written",
        brandId: input.brandId,
        reason: "question_length",
      }),
    );
    return { written: false, reason: "question_length" };
  }

  const kindOf = (text: string): QuestionKind =>
    isBrandedPrompt(text, brand) ? "branded" : "everyday";

  // Each pack question's compared text, by Postgres's own question_text_key (migration 0152).
  const texts = sql.join(
    input.pack.map((t) => sql`${t}::text`),
    sql`, `,
  );
  const keys = await tx.execute<{ text: string; key: string }>(
    sql`SELECT t AS text, question_text_key(t) AS key FROM unnest(ARRAY[${texts}]) AS t`,
  );
  const keyOf = new Map([...keys].map((k) => [k.text, k.key]));
  // Two questions that differ only in punctuation or case would be one library row: a set can't hold both.
  if (new Set(keyOf.values()).size !== input.pack.length) {
    await clearCurrent();
    console.warn(
      JSON.stringify({
        event: "question_set_not_written",
        brandId: input.brandId,
        reason: "duplicate_question",
      }),
    );
    return { written: false, reason: "duplicate_question" };
  }
  const live = await tx
    .select({
      id: brandQuestions.id,
      text: brandQuestions.text,
      textKey: brandQuestions.textKey,
      kind: brandQuestions.kind,
      reach: brandQuestions.reach,
      source: brandQuestions.source,
    })
    .from(brandQuestions)
    .where(
      and(
        eq(brandQuestions.brandId, input.brandId),
        isNull(brandQuestions.archivedAt),
        inArray(brandQuestions.textKey, [...new Set(keyOf.values())]),
      ),
    );
  const byKey = new Map(live.map((q) => [q.textKey, q]));

  const chosen: Array<{ id: string; kind: QuestionKind; reach: QuestionReach; source: string }> =
    [];
  for (const text of input.pack) {
    const key = keyOf.get(text) as string;
    const kind = kindOf(text);
    const existing = byKey.get(key);
    if (existing && existing.text === text && existing.kind === kind) {
      chosen.push(existing);
      continue;
    }
    if (existing) {
      await tx
        .update(brandQuestions)
        .set({ archivedAt: new Date(), status: "archived" })
        .where(eq(brandQuestions.id, existing.id));
    }
    const [row] = await tx
      .insert(brandQuestions)
      .values({
        organizationId: brand.organizationId,
        brandId: input.brandId,
        text,
        textKey: sql`question_text_key(${text})`,
        kind,
        source: "original",
        reach: "local",
        status: "ready",
      })
      .returning({
        id: brandQuestions.id,
        kind: brandQuestions.kind,
        reach: brandQuestions.reach,
        source: brandQuestions.source,
      });
    byKey.set(key, { ...row, text, textKey: key });
    chosen.push(row);
  }

  const [{ latest }] = await tx
    .select({ latest: max(brandQuestionSets.version) })
    .from(brandQuestionSets)
    .where(eq(brandQuestionSets.brandId, input.brandId));
  const version = (latest ?? 0) + 1;
  await clearCurrent();
  const everyday = input.pack.filter((text) => kindOf(text) === "everyday");
  const [set] = await tx
    .insert(brandQuestionSets)
    .values({
      organizationId: brand.organizationId,
      brandId: input.brandId,
      version,
      isCurrent: true,
      comparisonHash: computeQuestionSetHash(everyday) ?? "",
      note: input.note,
    })
    .returning({ id: brandQuestionSets.id });
  await tx.insert(brandQuestionSetItems).values(
    chosen.map((q, position) => ({
      setId: set.id,
      organizationId: brand.organizationId,
      questionId: q.id,
      position,
      kind: q.kind,
      reach: q.reach,
      source: q.source as "original",
    })),
  );
  return { written: true, setId: set.id, version };
}
