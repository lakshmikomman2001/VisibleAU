import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandQuestions, brands, organizations } from "@/db/schema";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { classificationFloor } from "@/lib/prompts/classification-floor";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { questionAgencyName } from "@/lib/questions/agency-name";
import { type ApplyResult, applyQuestionSet, CONFIRMED_SET_NOTE } from "@/lib/questions/apply";
import { getQuestionLimits } from "@/lib/questions/limits";
import { loadCurrentQuestionSet } from "@/lib/questions/question-set-store";
import { SUGGESTION_COUNT } from "@/lib/questions/questions-view";
import { type QuestionDefaults, readQuestionDefaults } from "@/lib/questions/settings";
import { questionTextKey } from "@/lib/questions/text-key";
import type { Audience, BrandClassification } from "@/lib/types/brand";

/**
 * S03 part 7 (LLD 8.3.6, client request C4; contract P10 step 3 as S03 builds it): the Questions step on "Confirm your
 * business details" for a new brand. The step shows the questions the first audit will ask -- the generator's pack for
 * the confirmed types and the brand's place, exactly what confirming made before S03 (regeneratePromptPack's inputs),
 * with the workspace's everyday count (Workspace -> Questions) -- and spares from the same generator to swap in; Growth
 * and up add their own (P03's drawer and checks). Confirming applies exactly what was shown as the brand's next set
 * (version 1 for a new brand) through applyQuestionSet's checks, and stores it as the brand's pack with today's
 * generator version, so the first audit asks it and nothing regenerates it afterwards.
 */

export interface ConfirmFacts {
  categories: string[];
  audience: Audience | null;
  competitors: string[];
}

export interface OfferedQuestion {
  text: string;
  kind: "everyday" | "branded";
  /** The generator's pack is the brand's original set; spares are template suggestions. */
  source: "original" | "template";
}

export interface ConfirmPreview {
  /** The one reach in S03: "Local · {place}". */
  reachLabel: string;
  agencyName: string;
  /** What the step shows first: the everyday questions (the workspace's count), then the branded ones. */
  questions: OfferedQuestion[];
  /** Everyday questions to swap in. */
  spares: OfferedQuestion[];
  limits: {
    plan: string;
    everydayAllowed: number;
    everydayMin: number;
    maxBranded: number;
    /** Growth and up: "Add your own question". */
    canWriteQuestions: boolean;
    /** Every paid plan swaps; Free keeps today's questions (LLD 8.3.5: "As today, fixed"). */
    canSwap: boolean;
  };
}

type BrandRow = typeof brands.$inferSelect;

/** The pack and the spares for these facts: pure, so the preview and the confirm build the same lists. */
export function offeredQuestions(
  brand: BrandRow,
  facts: ConfirmFacts,
  defaults: QuestionDefaults,
): { questions: OfferedQuestion[]; spares: OfferedQuestion[] } {
  const classification =
    (brand.classification as BrandClassification | null) ??
    classificationFloor({ categories: facts.categories, audience: facts.audience });
  const build = (count: number) =>
    buildPromptPack(
      classification,
      brand.name,
      brand.domain,
      {
        competitors: facts.competitors,
        categories: facts.categories,
        audience: facts.audience ?? undefined,
      },
      resolveRegionLabel(brand),
      count,
      brand.id,
    );
  const branded = (text: string) => isBrandedPrompt(text, brand);
  const pack = build(PROMPTS_PER_AUDIT);
  const packEveryday = pack.filter((t) => !branded(t));
  const packBranded = pack.filter(branded);
  const seen = new Set(pack.map(questionTextKey));
  const wider = build(PROMPTS_PER_AUDIT + SUGGESTION_COUNT * 2).filter((t) => {
    const key = questionTextKey(t);
    if (branded(t) || t.length < 10 || t.length > 200 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const everyday = (text: string, source: OfferedQuestion["source"]): OfferedQuestion => ({
    text,
    kind: "everyday",
    source,
  });
  const shown = packEveryday.slice(0, defaults.everydayCount).map((t) => everyday(t, "original"));
  // Fewer of the brand's own than the workspace's count: suggestions fill the gap when the workspace says so.
  const fill = defaults.fillWithSuggestions
    ? wider.slice(0, Math.max(0, defaults.everydayCount - shown.length))
    : [];
  return {
    questions: [
      ...shown,
      ...fill.map((t) => everyday(t, "template")),
      ...packBranded.map((text) => ({
        text,
        kind: "branded" as const,
        source: "original" as const,
      })),
    ],
    spares: [
      ...packEveryday.slice(defaults.everydayCount).map((t) => everyday(t, "original")),
      ...wider
        .slice(fill.length, fill.length + SUGGESTION_COUNT)
        .map((t) => everyday(t, "template")),
    ],
  };
}

async function workspaceDefaults(db: DbClient, organizationId: string, included: number) {
  const [org] = await db
    .select({ metadata: organizations.metadata })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return readQuestionDefaults(org?.metadata, included);
}

/** The step's lists for facts the owner hasn't saved yet (the brand row as it is, with these facts). */
export async function loadConfirmPreview(
  db: DbClient,
  input: { organizationId: string; brandId: string; facts: ConfirmFacts },
): Promise<ConfirmPreview | null> {
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, input.organizationId)));
  if (!brand) return null;
  const limits = await getQuestionLimits(db, input.organizationId, input.brandId);
  const defaults = await workspaceDefaults(
    db,
    input.organizationId,
    limits.includedScoredQuestions,
  );
  const facts = {
    ...input.facts,
    competitors: [...new Set([...brand.competitors, ...input.facts.competitors])],
  };
  const { questions, spares } = offeredQuestions(brand, facts, defaults);
  const place = brand.suburb ?? brand.city ?? resolveRegionLabel(brand);
  return {
    reachLabel: place ? `Local · ${place}` : "Local",
    agencyName: await questionAgencyName(db, input.organizationId, input.brandId),
    questions,
    spares,
    limits: {
      plan: limits.plan,
      everydayAllowed: limits.everydayAllowed,
      everydayMin: limits.everydayMin,
      maxBranded: limits.maxBrandedQuestions,
      canWriteQuestions: limits.canWriteQuestions,
      canSwap: limits.plan !== "free",
    },
  };
}

export interface ShownQuestion {
  text: string;
  /** "agency" for a question typed in the step; anything else must be one the step offered. */
  source: "original" | "template" | "agency";
}

export const QUESTIONS_CHANGED_COPY = "We couldn't save your details. Try again.";

export type ConfirmQuestionsResult =
  | ApplyResult
  | { ok: false; status: 422; body: { error: "questions_changed"; message: string } }
  | { ok: false; status: 403; requiredTier: "starter" };

/**
 * Applies `shown` (in order) as the brand's next set, after the brand's facts are saved in the same transaction: the
 * offered questions join the library (suggestions; the chosen ones become ready), typed ones go through the shared
 * checks, and the set is stored as the brand's pack with today's generator version. Refusals write nothing the
 * caller keeps: it rolls the transaction back.
 */
export async function confirmQuestions(
  tx: DbClient,
  input: {
    organizationId: string;
    brandId: string;
    userId: string;
    shown: readonly ShownQuestion[];
  },
): Promise<ConfirmQuestionsResult> {
  const [brand] = await tx
    .select()
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, input.organizationId)));
  if (!brand)
    return {
      ok: false,
      status: 422,
      body: { error: "questions_changed", message: QUESTIONS_CHANGED_COPY },
    };
  const limits = await getQuestionLimits(tx, input.organizationId, input.brandId);
  const defaults = await workspaceDefaults(
    tx,
    input.organizationId,
    limits.includedScoredQuestions,
  );
  const { questions, spares } = offeredQuestions(
    brand,
    {
      categories: brand.categories,
      audience: brand.audience as Audience | null,
      competitors: brand.competitors,
    },
    defaults,
  );
  const offered = new Map([...questions, ...spares].map((q) => [q.text, q]));
  const changed = () =>
    ({
      ok: false,
      status: 422,
      body: { error: "questions_changed", message: QUESTIONS_CHANGED_COPY },
    }) as const;
  if (input.shown.some((s) => s.source !== "agency" && !offered.has(s.text))) return changed();
  // Free keeps today's questions: exactly what was offered first.
  if (
    limits.plan === "free" &&
    (input.shown.length !== questions.length ||
      input.shown.some((s, i) => s.text !== questions[i].text))
  )
    return { ok: false, status: 403, requiredTier: "starter" };

  // The offered questions join the library as suggestions (one live row per compared text: an existing one is kept).
  const live = await tx
    .select({ id: brandQuestions.id, key: brandQuestions.textKey })
    .from(brandQuestions)
    .where(and(eq(brandQuestions.brandId, input.brandId), isNull(brandQuestions.archivedAt)));
  const idByKey = new Map(live.map((q) => [q.key, q.id]));
  for (const q of offered.values()) {
    const key = questionTextKey(q.text);
    if (idByKey.has(key)) continue;
    const [row] = await tx
      .insert(brandQuestions)
      .values({
        organizationId: input.organizationId,
        brandId: input.brandId,
        text: q.text,
        textKey: sql`question_text_key(${q.text})`,
        kind: q.kind,
        source: q.source,
        reach: "local",
        status: "suggested",
      })
      .returning({ id: brandQuestions.id, key: brandQuestions.textKey });
    idByKey.set(row.key, row.id);
  }

  const current = await loadCurrentQuestionSet(tx, input.brandId);
  const result = await applyQuestionSet(tx, {
    organizationId: input.organizationId,
    brandId: input.brandId,
    userId: input.userId,
    note: CONFIRMED_SET_NOTE,
    baseVersion: current?.version ?? 0,
    items: input.shown.map((s, position) =>
      s.source === "agency"
        ? { text: s.text, reach: "local" as const, position }
        : {
            questionId: idByKey.get(questionTextKey(s.text)) as string,
            reach: "local" as const,
            position,
          },
    ),
  });
  if (!result.ok) return result;

  // The applied set is the brand's pack, stamped with today's generator: the first audit asks it, and the audit start
  // never regenerates it (lib/audit/get-audit-prompts.ts regenerates only a pack stamped behind PROMPT_GENERATOR_VERSION).
  const applied = await loadCurrentQuestionSet(tx, input.brandId);
  const hadPack = Array.isArray(brand.promptPack) && brand.promptPack.length > 0;
  await tx
    .update(brands)
    .set({
      promptPack: (applied?.items ?? []).map((i) => i.text),
      promptPackVersion: hadPack
        ? (brand.promptPackVersion ?? 1) + 1
        : (brand.promptPackVersion ?? 1),
      promptPackGeneratorVersion: PROMPT_GENERATOR_VERSION,
    })
    .where(eq(brands.id, input.brandId));
  return result;
}
