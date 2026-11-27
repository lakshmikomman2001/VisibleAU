import { and, asc, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import {
  brandQuestionSetItems,
  brandQuestionSets,
  brandQuestions,
  brands,
  brandVisibilityScopes,
  type QuestionKind,
  type QuestionReach,
  type QuestionSource,
  type ReachPlace,
} from "@/db/schema";
import { findState, type Market, marketFor } from "@/lib/markets";
import { TIER_DEFINITIONS, tierRank } from "@/lib/pricing/tiers";
import { getQuestionLimits, QuestionLimitError, type QuestionLimits } from "@/lib/questions/limits";
import { addReachSuggestions, type BeyondLocal, brandReachQuestions } from "./generate";
import { placeForReach, REACH_ORDER, REACH_ROW_TITLES, reachLabel } from "./places";
import {
  enabledInOrder,
  LOCAL_ALWAYS_ON_COPY,
  LOCAL_MIN_QUESTIONS,
  minQuestionsFor,
  type ReachTargets,
  usedQuestions,
} from "./split";

/**
 * S04 part 6 (LLD 8.4.1, 8.4.7; contract P01.reach): a brand's reaches as the reach card reads and saves them.
 * - A brand with no brand_visibility_scopes row is Local only, with its current set's everyday questions (0157's
 *   backfill wrote that row for every brand that existed; a brand added since has none).
 * - Saving writes the rows (Local can't be turned off) and returns a draft for the Questions tab's edit mode: the
 *   current set less the questions of a reach turned off or lowered, plus each reach's added questions, written to the
 *   library as suggestions in that reach (lib/reach/generate.ts). Nothing changes for audits until the draft is applied
 *   (P04, lib/questions/apply.ts).
 * Refusals (existing code wins over the sprint's codes, runbook section 2): more reaches than the plan allows is a
 * feature the plan doesn't include, 403 plan_required (tierRefusal, by the caller; the client knows only that); more
 * everyday questions than the plan and packs allow is 402 question_limit (QuestionLimitError, as P02/P04 and the
 * contract's P01.overLimit); a bad reach, place or count is 422.
 */

export interface ReachSetting {
  reach: QuestionReach;
  /** The row title (contract reachLabels.rowTitles): Local, State, Country, Worldwide. */
  title: string;
  /** The reach's label everywhere else: "Local · Sydney", "NSW", "Australia", "Worldwide". */
  label: string;
  /** The market can place it for the brand (a brand with no state has no State reach). */
  available: boolean;
  enabled: boolean;
  /** Null when the market can't place it. */
  place: ReachPlace | null;
  targetCount: number;
}

/** A reach Vunnara suggests from the brand's data (S5's business type, S6's website); none before those sprints. */
export interface ReachSuggestion {
  reaches: QuestionReach[];
  scope: string;
  quote: string;
}

export interface ReachSettingsView {
  reaches: ReachSetting[];
  plan: { key: string; name: string; reachesAllowed: number };
  /** For each number of reaches beyond this plan's, the first plan that allows it (P01.states.planLock's marker). */
  plansForReaches: Record<number, { key: string; name: string }>;
  everydayAllowed: number;
  everydayMin: number;
  localMin: number;
  /** The capital Google AI is checked from when a state can't be set (P01.reach.state's help). */
  stateCapital: string | null;
  /** The brand's primary regions as stored ("NSW:Chatswood"), for the Local row's Areas chip. */
  areas: string[];
  suggestions: ReachSuggestion[];
  /** "Want more? Add a question pack": question_packs on and the plan offers packs. */
  packsOffered: boolean;
}

type BrandRow = typeof brands.$inferSelect;

async function loadBrand(db: DbClient, organizationId: string, brandId: string) {
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.organizationId, organizationId)));
  return brand ?? null;
}

async function loadScopes(db: DbClient, brandId: string) {
  return db
    .select({
      reach: brandVisibilityScopes.reach,
      enabled: brandVisibilityScopes.enabled,
      targetCount: brandVisibilityScopes.targetCount,
    })
    .from(brandVisibilityScopes)
    .where(eq(brandVisibilityScopes.brandId, brandId));
}

interface SetItem {
  questionId: string;
  text: string;
  kind: QuestionKind;
  reach: QuestionReach;
  source: QuestionSource;
}

async function loadCurrentItems(
  db: DbClient,
  brandId: string,
): Promise<{ version: number; items: SetItem[] } | null> {
  const rows = await db
    .select({
      version: brandQuestionSets.version,
      questionId: brandQuestions.id,
      text: brandQuestions.text,
      kind: brandQuestionSetItems.kind,
      reach: brandQuestionSetItems.reach,
      source: brandQuestions.source,
    })
    .from(brandQuestionSets)
    .innerJoin(brandQuestionSetItems, eq(brandQuestionSetItems.setId, brandQuestionSets.id))
    .innerJoin(brandQuestions, eq(brandQuestions.id, brandQuestionSetItems.questionId))
    .where(and(eq(brandQuestionSets.brandId, brandId), eq(brandQuestionSets.isCurrent, true)))
    .orderBy(asc(brandQuestionSetItems.position));
  const first = rows[0];
  if (!first) return null;
  return {
    version: first.version,
    items: rows.map(({ version: _v, ...item }) => item),
  };
}

function plansForReaches(currentPlan: string): Record<number, { key: string; name: string }> {
  const out: Record<number, { key: string; name: string }> = {};
  const byRank = [...TIER_DEFINITIONS].sort((a, b) => tierRank(a.key) - tierRank(b.key));
  for (let n = 2; n <= REACH_ORDER.length; n++) {
    const plan = byRank.find(
      (t) => t.reachesAllowed >= n && tierRank(t.key) > tierRank(currentPlan),
    );
    if (plan) out[n] = { key: plan.key, name: plan.name };
  }
  return out;
}

function reachSettings(
  brand: BrandRow,
  market: Market,
  scopes: Awaited<ReturnType<typeof loadScopes>>,
  everydayInSet: number,
): ReachSetting[] {
  const byReach = new Map(scopes.map((s) => [s.reach, s]));
  return REACH_ORDER.map((reach) => {
    const place = placeForReach(reach, brand, market);
    const row = byReach.get(reach);
    const enabled = reach === "local" ? true : !!(row?.enabled && place);
    const targetCount =
      reach === "local"
        ? (row?.targetCount ?? everydayInSet)
        : enabled
          ? (row?.targetCount ?? 0)
          : 0;
    return {
      reach,
      title: REACH_ROW_TITLES[reach],
      label: reachLabel(reach, place ?? {}, market),
      available: place !== null,
      enabled,
      place,
      targetCount,
    };
  });
}

export async function loadReachSettings(
  db: DbClient,
  input: { organizationId: string; brandId: string; packsFlag: boolean },
): Promise<ReachSettingsView | null> {
  const brand = await loadBrand(db, input.organizationId, input.brandId);
  if (!brand) return null;
  const market = marketFor(brand.region);
  const limits = await getQuestionLimits(db, input.organizationId, input.brandId);
  const set = await loadCurrentItems(db, input.brandId);
  const everydayInSet = set ? set.items.filter((i) => i.kind === "everyday").length : 0;
  const definition = TIER_DEFINITIONS.find((t) => t.key === limits.plan);
  return {
    reaches: reachSettings(brand, market, await loadScopes(db, input.brandId), everydayInSet),
    plan: {
      key: limits.plan,
      name: definition?.name ?? limits.plan,
      reachesAllowed: limits.reachesAllowed,
    },
    plansForReaches: plansForReaches(limits.plan),
    everydayAllowed: limits.everydayAllowed,
    everydayMin: limits.everydayMin,
    localMin: LOCAL_MIN_QUESTIONS,
    stateCapital: findState(market, brand.state)?.capital ?? null,
    areas: brand.primaryRegions,
    suggestions: [],
    packsOffered: input.packsFlag && !!definition?.questionPacks,
  };
}

export interface ReachUpdate {
  reach: QuestionReach;
  enabled: boolean;
  place?: ReachPlace | null;
  targetCount: number;
}

export type ReachUpdateResult =
  | { ok: true; view: ReachSettingsView; draft: ReachDraft }
  | { ok: false; status: 403; requiredPlan: string }
  | { ok: false; status: 402; error: QuestionLimitError }
  | { ok: false; status: 422; message: string }
  | { ok: false; status: 404 };

/** The Questions tab's edit-mode draft (components/domain/questions/question-editor.tsx's Draft). */
export interface ReachDraft {
  baseVersion: number;
  items: Array<{
    key: string;
    questionId: string;
    text: string;
    kind: QuestionKind;
    source: QuestionSource;
    reach: QuestionReach;
  }>;
  archive: string[];
}

const samePlace = (a: ReachPlace, b: ReachPlace) => {
  const norm = (p: ReachPlace) =>
    JSON.stringify(
      Object.entries(p)
        .filter(([, v]) => typeof v === "string" && v.trim())
        .map(([k, v]) => [k, (v as string).trim().toLowerCase()])
        .sort(([x], [y]) => (x < y ? -1 : 1)),
    );
  return norm(a) === norm(b);
};

/** The checks on a PUT body against the brand and its limits; the enabled reaches' targets when they pass. */
export function checkReachUpdate(
  updates: readonly ReachUpdate[],
  current: readonly ReachSetting[],
  limits: Pick<QuestionLimits, "reachesAllowed" | "everydayAllowed" | "everydayMin">,
  plans: ReachSettingsView["plansForReaches"],
):
  | { ok: true; enabled: QuestionReach[]; targets: ReachTargets }
  | Exclude<ReachUpdateResult, { ok: true }> {
  const reaches = updates.map((u) => u.reach);
  if (new Set(reaches).size !== reaches.length)
    return { ok: false, status: 422, message: "Each area can be listed once." };
  const local = updates.find((u) => u.reach === "local");
  if (!local?.enabled) return { ok: false, status: 422, message: LOCAL_ALWAYS_ON_COPY };
  const targets: ReachTargets = {};
  for (const u of updates) {
    if (!u.enabled) continue;
    const setting = current.find((s) => s.reach === u.reach);
    if (!setting?.available || !setting.place)
      return {
        ok: false,
        status: 422,
        message: `${setting?.title ?? u.reach} can't be set for this business: add its state first.`,
      };
    if (u.place && !samePlace(u.place, setting.place))
      return {
        ok: false,
        status: 422,
        message: "This place doesn't match the business's location.",
      };
    const min = minQuestionsFor(u.reach);
    if (u.targetCount < min)
      return {
        ok: false,
        status: 422,
        message: `${setting.label} needs at least ${min} question${min === 1 ? "" : "s"}.`,
      };
    targets[u.reach] = u.targetCount;
  }
  const enabled = enabledInOrder(updates.filter((u) => u.enabled).map((u) => u.reach));
  if (enabled.length > limits.reachesAllowed) {
    const plan = plans[enabled.length];
    return { ok: false, status: 403, requiredPlan: plan?.key ?? "agency" };
  }
  const used = usedQuestions(targets, enabled);
  if (used > limits.everydayAllowed)
    return { ok: false, status: 402, error: new QuestionLimitError(limits.everydayAllowed) };
  if (used < limits.everydayMin)
    return {
      ok: false,
      status: 422,
      message: `Keep at least ${limits.everydayMin} everyday questions.`,
    };
  return { ok: true, enabled, targets };
}

/**
 * The draft: the current set's questions in their order, less those of a reach turned off and those past a reach's new
 * count; then each reach's added questions (suggestions in that reach), in reach order. Questions naming the business
 * stay as they are.
 */
async function buildDraft(
  tx: DbClient,
  input: {
    organizationId: string;
    brand: BrandRow;
    market: Market;
    settings: readonly ReachSetting[];
    enabled: readonly QuestionReach[];
    targets: ReachTargets;
  },
): Promise<ReachDraft> {
  const set = await loadCurrentItems(tx, input.brand.id);
  const items = set?.items ?? [];
  const kept: SetItem[] = [];
  const perReach = new Map<QuestionReach, number>();
  for (const item of items) {
    if (item.kind === "branded") {
      kept.push(item);
      continue;
    }
    if (!input.enabled.includes(item.reach)) continue;
    const n = perReach.get(item.reach) ?? 0;
    if (n >= (input.targets[item.reach] ?? 0)) continue;
    perReach.set(item.reach, n + 1);
    kept.push(item);
  }
  const draftItems: ReachDraft["items"] = kept.map((i) => ({
    key: i.questionId,
    questionId: i.questionId,
    text: i.text,
    kind: i.kind,
    source: i.source,
    reach: i.reach,
  }));
  const inDraft = new Set(draftItems.map((i) => i.questionId));
  for (const reach of input.enabled) {
    if (reach === "local") continue;
    const missing = (input.targets[reach] ?? 0) - (perReach.get(reach) ?? 0);
    const place = input.settings.find((s) => s.reach === reach)?.place;
    if (missing <= 0 || !place) continue;
    const texts = brandReachQuestions(input.brand, {
      reach: reach as BeyondLocal,
      market: input.market,
      place,
      count: missing + 3,
    });
    const ids = await addReachSuggestions(tx, {
      organizationId: input.organizationId,
      brandId: input.brand.id,
      reach: reach as BeyondLocal,
      texts,
    });
    let added = 0;
    for (const [n, id] of ids.entries()) {
      if (added >= missing) break;
      if (inDraft.has(id)) continue;
      inDraft.add(id);
      draftItems.push({
        key: id,
        questionId: id,
        text: texts[n],
        kind: "everyday",
        source: "template",
        reach,
      });
      added++;
    }
  }
  return { baseVersion: set?.version ?? 0, items: draftItems, archive: [] };
}

/** PUT: checks the reaches, writes them, and returns the saved view and the draft. Run under the workspace's RLS. */
export async function saveReachSettings(
  tx: DbClient,
  input: {
    organizationId: string;
    brandId: string;
    userId: string;
    updates: readonly ReachUpdate[];
    packsFlag: boolean;
  },
): Promise<ReachUpdateResult> {
  const brand = await loadBrand(tx, input.organizationId, input.brandId);
  if (!brand) return { ok: false, status: 404 };
  // The brand row, locked: reach saves, applies and pack regenerations for one brand take turns.
  await tx.select({ id: brands.id }).from(brands).where(eq(brands.id, brand.id)).for("update");
  const before = await loadReachSettings(tx, input);
  if (!before) return { ok: false, status: 404 };
  const checked = checkReachUpdate(
    input.updates,
    before.reaches,
    {
      reachesAllowed: before.plan.reachesAllowed,
      everydayAllowed: before.everydayAllowed,
      everydayMin: before.everydayMin,
    },
    before.plansForReaches,
  );
  if (!checked.ok) return checked;

  const existing = new Set((await loadScopes(tx, brand.id)).map((s) => s.reach));
  for (const setting of before.reaches) {
    const on = checked.enabled.includes(setting.reach);
    if (!on && !existing.has(setting.reach)) continue;
    const values = {
      enabled: on,
      place: on && setting.place ? setting.place : {},
      targetCount: on ? (checked.targets[setting.reach] ?? 0) : 0,
      updatedBy: input.userId,
      updatedAt: new Date(),
    };
    await tx
      .insert(brandVisibilityScopes)
      .values({
        organizationId: input.organizationId,
        brandId: brand.id,
        reach: setting.reach,
        ...values,
      })
      .onConflictDoUpdate({
        target: [brandVisibilityScopes.brandId, brandVisibilityScopes.reach],
        set: values,
      });
  }

  const draft = await buildDraft(tx, {
    organizationId: input.organizationId,
    brand,
    market: marketFor(brand.region),
    settings: before.reaches,
    enabled: checked.enabled,
    targets: checked.targets,
  });
  const view = await loadReachSettings(tx, input);
  if (!view) return { ok: false, status: 404 };
  return { ok: true, view, draft };
}

/** The reaches a set may hold for a brand: Local, and with visibility_reach on, its enabled reaches. */
export async function reachesForSet(
  db: DbClient,
  brandId: string,
  visibilityReach: boolean,
): Promise<QuestionReach[]> {
  if (!visibilityReach) return ["local"];
  const scopes = await loadScopes(db, brandId);
  return enabledInOrder(scopes.filter((s) => s.enabled).map((s) => s.reach));
}
