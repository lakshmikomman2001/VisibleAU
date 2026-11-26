import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandQuestionSetItems, brandQuestionSets, brandQuestions, brands } from "@/db/schema";
import type { QuestionKind, QuestionReach, QuestionSource } from "@/db/schema/questions";
import { computeQuestionSetHash, questionTextKey } from "@/lib/questions/hash";
import {
  getQuestionLimits,
  MIN_EVERYDAY_QUESTIONS,
  questionLimitBody,
  questionLimitError,
} from "@/lib/questions/limits";
import { loadCurrentQuestionSet } from "@/lib/questions/question-set-store";
import { CHECK_COPY, type QuestionCheck, validateQuestion } from "@/lib/questions/validate";
import { brandPlaces } from "@/lib/questions/validation-context";

/**
 * S03 part 3 (LLD 8.3.1, 8.3.7; contract P04): applying a brand's new question set, from the next audit, in one
 * transaction. The brand row is locked (as writeSetFromPack locks it), so two applies -- or an apply and a pack
 * regeneration -- take turns: the second finds the version it was based on is no longer current and gets 409.
 * Everything is checked again here, whatever the browser checked: questions typed in (lib/questions/validate.ts),
 * questions that name the business (at most 5), the plan (writing your own is Growth and up: 403 plan_required, by the
 * route; more everyday questions than allowed: 402), and at least 5 everyday questions.
 *
 * A typed question is a new library row (source 'agency', created_by the user); a suggestion taken into the set becomes
 * ready; a reworded question (`replaces`) archives the old row, so each answer stays tied to the words asked. A question
 * any set used is archived, never deleted. The new set is version max+1 with the existing comparison hash
 * (computeQuestionSetHash, equal to audits.question_set_hash's SQL), and becomes current; an audit already running keeps
 * the set it recorded when it started.
 */

export interface ApplyItem {
  /** A question already in the brand's library (its original set, a suggestion, an earlier one). */
  questionId?: string;
  /** A question typed in. */
  text?: string;
  /** The library question a typed one rewords: archived when the set is applied. */
  replaces?: string;
  reach: QuestionReach;
  position: number;
}

export interface ApplyInput {
  organizationId: string;
  brandId: string;
  userId: string;
  baseVersion: number;
  items: readonly ApplyItem[];
  /** The everyday count the draft showed; when sent, it must match the items. */
  count?: number;
}

export interface ItemProblem {
  position: number;
  message: string;
  checks?: QuestionCheck[];
}

export const CONFLICT_COPY = "Someone else changed these questions. Reload to see their version.";
export const CHECKS_FAILED_COPY =
  "Some questions didn't pass the checks. Fix them in your draft and try again.";
export const TOO_FEW_COPY = `Keep at least ${MIN_EVERYDAY_QUESTIONS} everyday questions.`;

export type ApplyResult =
  | {
      ok: true;
      setId: string;
      version: number;
      fromVersion: number;
      comparisonHash: string;
      added: number;
      removed: number;
    }
  | {
      ok: false;
      status: 409;
      body: { error: "stale_version"; message: string; currentVersion: number };
    }
  | { ok: false; status: 403; requiredTier: "growth" }
  | { ok: false; status: 402; body: ReturnType<typeof questionLimitBody> }
  | {
      ok: false;
      status: 422;
      body: { error: "invalid_questions"; message: string; problems: ItemProblem[] };
    };

const invalid = (problems: ItemProblem[], message = CHECKS_FAILED_COPY): ApplyResult => ({
  ok: false,
  status: 422,
  body: { error: "invalid_questions", message, problems },
});

export async function applyQuestionSet(tx: DbClient, input: ApplyInput): Promise<ApplyResult> {
  // The brand row, locked: applies and pack regenerations for one brand take turns over the version number.
  const [brand] = await tx
    .select({
      name: brands.name,
      domain: brands.domain,
      aliases: brands.aliases,
      competitors: brands.competitors,
      suburb: brands.suburb,
      city: brands.city,
      state: brands.state,
      primaryRegions: brands.primaryRegions,
      region: brands.region,
    })
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, input.organizationId)))
    .for("update");
  if (!brand) return invalid([], CHECKS_FAILED_COPY);

  const current = await loadCurrentQuestionSet(tx, input.brandId);
  const currentVersion = current?.version ?? 0;
  if (currentVersion !== input.baseVersion) {
    return {
      ok: false,
      status: 409,
      body: { error: "stale_version", message: CONFLICT_COPY, currentVersion },
    };
  }

  const limits = await getQuestionLimits(tx, input.organizationId, input.brandId);
  const typed = input.items.filter((i) => typeof i.text === "string");
  if (typed.length > 0 && !limits.canWriteQuestions) {
    return { ok: false, status: 403, requiredTier: "growth" };
  }

  const problems: ItemProblem[] = [];
  const positions = input.items.map((i) => i.position);
  if (new Set(positions).size !== positions.length) {
    problems.push({ position: -1, message: "Two questions share a position." });
  }
  for (const item of input.items) {
    // Visibility reach arrives in S04: until then every question is Local.
    if (item.reach !== "local")
      problems.push({ position: item.position, message: "Only Local questions for now." });
    if ((item.questionId ? 1 : 0) + (typeof item.text === "string" ? 1 : 0) !== 1)
      problems.push({
        position: item.position,
        message: "Each question is either a library question or a typed one.",
      });
  }

  // The brand's live library: what the set may take, and what a typed question mustn't repeat.
  const library = await tx
    .select({
      id: brandQuestions.id,
      text: brandQuestions.text,
      textKey: brandQuestions.textKey,
      kind: brandQuestions.kind,
      source: brandQuestions.source,
      status: brandQuestions.status,
    })
    .from(brandQuestions)
    .where(and(eq(brandQuestions.brandId, input.brandId), isNull(brandQuestions.archivedAt)));
  const byId = new Map(library.map((q) => [q.id, q]));
  const replaced = new Set(input.items.map((i) => i.replaces).filter((r): r is string => !!r));
  for (const r of replaced) {
    if (!byId.has(r))
      problems.push({ position: -1, message: "A reworded question isn't in the library." });
  }

  interface Chosen {
    position: number;
    kind: QuestionKind;
    reach: QuestionReach;
    key: string;
    text: string;
    existing?: { id: string; source: QuestionSource; suggested: boolean };
  }
  const chosen: Chosen[] = [];
  for (const item of input.items) {
    if (!item.questionId) continue;
    const q = byId.get(item.questionId);
    if (!q || replaced.has(q.id)) {
      problems.push({
        position: item.position,
        message: "This question is no longer in the library.",
      });
      continue;
    }
    chosen.push({
      position: item.position,
      kind: q.kind,
      reach: item.reach,
      key: q.textKey,
      text: q.text,
      existing: { id: q.id, source: q.source, suggested: q.status === "suggested" },
    });
  }

  // Typed questions: the shared checks, against the library (less what they reword) and the rest of the set.
  const libraryKeys = new Set(library.filter((q) => !replaced.has(q.id)).map((q) => q.textKey));
  const brandedExisting = chosen.filter((c) => c.kind === "branded").length;
  let brandedTyped = 0;
  for (const item of typed) {
    const keysSoFar = new Set([...libraryKeys, ...chosen.map((c) => c.key)]);
    const result = validateQuestion(item.text as string, {
      brand: { name: brand.name, domain: brand.domain, aliases: brand.aliases },
      existingKeys: keysSoFar,
      brandedInSet: brandedExisting + brandedTyped,
      maxBranded: limits.maxBrandedQuestions,
      reach: item.reach,
      ...brandPlaces(brand, item.reach),
      competitors: brand.competitors,
    });
    if (!result.ok) {
      problems.push({
        position: item.position,
        message: CHECKS_FAILED_COPY,
        checks: result.checks,
      });
      continue;
    }
    if (result.kind === "branded") brandedTyped++;
    chosen.push({
      position: item.position,
      kind: result.kind,
      reach: item.reach,
      key: questionTextKey(result.text),
      text: result.text,
    });
  }

  // The whole set: no two questions alike, at most 5 naming the business.
  const keys = chosen.map((c) => c.key);
  if (new Set(keys).size !== keys.length) {
    problems.push({ position: -1, message: CHECK_COPY.duplicate });
  }
  const branded = chosen.filter((c) => c.kind === "branded").length;
  if (branded > limits.maxBrandedQuestions) {
    problems.push({ position: -1, message: CHECK_COPY.brandedLimit });
  }
  if (problems.length > 0) return invalid(problems);

  const everyday = chosen.length - branded;
  if (input.count !== undefined && input.count !== everyday) {
    return invalid([{ position: -1, message: "The everyday count doesn't match the questions." }]);
  }
  const overLimit = questionLimitError(limits, { everyday, branded });
  if (overLimit) return { ok: false, status: 402, body: questionLimitBody(overLimit) };
  if (everyday < limits.everydayMin)
    return invalid([{ position: -1, message: TOO_FEW_COPY }], TOO_FEW_COPY);

  // Writes. Reworded questions are archived first: the new wording may share their compared text.
  if (replaced.size > 0) {
    await tx
      .update(brandQuestions)
      .set({ status: "archived", archivedAt: new Date() })
      .where(
        and(eq(brandQuestions.brandId, input.brandId), inArray(brandQuestions.id, [...replaced])),
      );
  }
  const suggested = chosen
    .filter((c) => c.existing?.suggested)
    .map((c) => c.existing?.id as string);
  if (suggested.length > 0) {
    await tx
      .update(brandQuestions)
      .set({ status: "ready" })
      .where(and(eq(brandQuestions.brandId, input.brandId), inArray(brandQuestions.id, suggested)));
  }
  const ordered = [...chosen].sort((a, b) => a.position - b.position);
  const items: Array<{
    id: string;
    kind: QuestionKind;
    reach: QuestionReach;
    source: QuestionSource;
  }> = [];
  for (const c of ordered) {
    if (c.existing) {
      items.push({ id: c.existing.id, kind: c.kind, reach: c.reach, source: c.existing.source });
      continue;
    }
    const [row] = await tx
      .insert(brandQuestions)
      .values({
        organizationId: input.organizationId,
        brandId: input.brandId,
        text: c.text,
        textKey: sql`question_text_key(${c.text})`,
        kind: c.kind,
        source: "agency",
        reach: c.reach,
        status: "ready",
        createdBy: input.userId,
      })
      .returning({ id: brandQuestions.id });
    items.push({ id: row.id, kind: c.kind, reach: c.reach, source: "agency" });
  }

  const [{ latest }] = await tx
    .select({ latest: max(brandQuestionSets.version) })
    .from(brandQuestionSets)
    .where(eq(brandQuestionSets.brandId, input.brandId));
  const version = (latest ?? 0) + 1;
  await tx
    .update(brandQuestionSets)
    .set({ isCurrent: false })
    .where(
      and(eq(brandQuestionSets.brandId, input.brandId), eq(brandQuestionSets.isCurrent, true)),
    );
  const comparisonHash =
    computeQuestionSetHash(ordered.filter((c) => c.kind === "everyday").map((c) => c.text)) ?? "";
  const [set] = await tx
    .insert(brandQuestionSets)
    .values({
      organizationId: input.organizationId,
      brandId: input.brandId,
      version,
      isCurrent: true,
      comparisonHash,
      appliedBy: input.userId,
    })
    .returning({ id: brandQuestionSets.id });
  await tx.insert(brandQuestionSetItems).values(
    items.map((q, position) => ({
      setId: set.id,
      organizationId: input.organizationId,
      questionId: q.id,
      position,
      kind: q.kind,
      reach: q.reach,
      source: q.source,
    })),
  );

  const before = new Set(current?.items.map((i) => i.questionId) ?? []);
  const after = new Set(items.map((i) => i.id));
  return {
    ok: true,
    setId: set.id,
    version,
    fromVersion: currentVersion,
    comparisonHash,
    added: [...after].filter((id) => !before.has(id)).length,
    removed: [...before].filter((id) => !after.has(id)).length,
  };
}
