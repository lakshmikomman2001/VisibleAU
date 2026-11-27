import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandQuestions, brands, organizations } from "@/db/schema";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { tierDisplayName } from "@/lib/pricing/tiers";
import { CONFIRMED_SET_NOTE } from "@/lib/questions/apply";
import { MIN_EVERYDAY_QUESTIONS, questionLimitsFor } from "@/lib/questions/limits";
import { loadCurrentQuestionSet } from "@/lib/questions/question-set-store";
import { questionTextKey } from "@/lib/questions/text-key";

/**
 * S03 part 5 (LLD 8.3.4, 8.3.5; contract P05): the workspace's Questions settings -- its defaults for new brands, one
 * row per brand from one query, and copying questions from one of its brands to another.
 *
 * Defaults live in organizations.metadata.questionDefaults (no migration: the metadata column is the workspace's own
 * settings bag, written with jsonb ||, as dismissed notices are). They affect new brands only -- the confirm screen's
 * Questions step reads them (part 7) -- and never an existing brand's set.
 */

export interface QuestionDefaults {
  /** Everyday questions a new brand starts with: 5 to the plan's included count. */
  everydayCount: number;
  /** Fill empty slots with suggestions when a new brand's own questions are fewer than the count. */
  fillWithSuggestions: boolean;
}

export const DEFAULTS_KEY = "questionDefaults";

/** The stored defaults, clamped to the plan: the included count and suggestions on when nothing is stored. */
export function readQuestionDefaults(metadata: unknown, included: number): QuestionDefaults {
  const stored =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)[DEFAULTS_KEY]
      : undefined;
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const count = typeof s.everydayCount === "number" ? Math.trunc(s.everydayCount) : included;
  return {
    everydayCount: Math.min(included, Math.max(MIN_EVERYDAY_QUESTIONS, count)),
    fillWithSuggestions: typeof s.fillWithSuggestions === "boolean" ? s.fillWithSuggestions : true,
  };
}

export interface BrandQuestionRow {
  id: string;
  name: string;
  /** Local until visibility reach (S04). */
  areas: string[];
  everydayActive: number;
  everydayAllowed: number;
  packs: number;
  writtenByAgency: number;
  version: number | null;
  /**
   * S04 part 0d (LLD amendment 95): `backfill` is 0155's version 1 ("Original questions · {date}"), `confirmed` a version
   * the confirm screen saved ("Confirmed · {date} · {userName}"); otherwise one applied in P04 ("{date} · {userName}").
   */
  lastChange: { at: string; by: string | null; backfill: boolean; confirmed?: boolean } | null;
}

export interface QuestionSettingsView {
  plan: string;
  planName: string;
  included: number;
  /** Writing questions (and copying them) is Growth and up; Starter sees counts and suggestions only. */
  canWrite: boolean;
  defaults: QuestionDefaults;
  brands: BrandQuestionRow[];
}

const BACKFILL_NOTE = "0155 backfill: the stored question pack";

type Row = {
  id: string;
  name: string;
  version: number | null;
  applied_at: Date | string | null;
  applied_by: string | null;
  note: string | null;
  everyday: number;
  agency: number;
  packs: number | null;
};

export async function loadQuestionSettings(
  db: DbClient,
  organizationId: string,
): Promise<QuestionSettingsView> {
  const plan = await effectiveTier(db, organizationId);
  const base = questionLimitsFor(plan, 0);
  const [org] = await db
    .select({ metadata: organizations.metadata })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  // One query for every brand: its current set's counts, who applied it and when, and its packs.
  const rows = await db.execute<Row>(sql`
    SELECT b.id, b.name, s.version, s.applied_at, u.name AS applied_by, s.note,
           COALESCE(c.everyday, 0)::int AS everyday, COALESCE(c.agency, 0)::int AS agency, p.packs
    FROM brands b
    LEFT JOIN brand_question_sets s ON s.brand_id = b.id AND s.is_current
    LEFT JOIN users u ON u.id = s.applied_by
    LEFT JOIN (
      SELECT i.set_id,
             count(*) FILTER (WHERE i.kind = 'everyday') AS everyday,
             count(*) FILTER (WHERE i.source = 'agency') AS agency
      FROM brand_question_set_items i GROUP BY i.set_id
    ) c ON c.set_id = s.id
    LEFT JOIN brand_question_packs p ON p.brand_id = b.id
    WHERE b.organization_id = ${organizationId} AND b.deleted_at IS NULL
    ORDER BY s.applied_at DESC NULLS LAST, b.name`);
  return {
    plan: base.plan,
    planName: tierDisplayName(base.plan),
    included: base.includedScoredQuestions,
    canWrite: base.canWriteQuestions,
    defaults: readQuestionDefaults(org?.metadata, base.includedScoredQuestions),
    brands: [...rows].map((r) => {
      const limits = questionLimitsFor(plan, r.packs ?? 0);
      return {
        id: r.id,
        name: r.name,
        areas: ["Local"],
        everydayActive: r.everyday,
        everydayAllowed: limits.everydayAllowed,
        packs: limits.packs,
        writtenByAgency: r.agency,
        version: r.version,
        lastChange: r.applied_at
          ? {
              at: new Date(r.applied_at).toISOString(),
              by: r.applied_by,
              backfill: r.version === 1 && r.note === BACKFILL_NOTE,
              confirmed: r.note === CONFIRMED_SET_NOTE,
            }
          : null,
      };
    }),
  };
}

/** Saves the defaults (within 5 and the plan's included count). Returns the stored values. */
export async function saveQuestionDefaults(
  db: DbClient,
  organizationId: string,
  next: QuestionDefaults,
): Promise<QuestionDefaults> {
  const value = {
    everydayCount: next.everydayCount,
    fillWithSuggestions: next.fillWithSuggestions,
  };
  await db
    .update(organizations)
    .set({
      metadata: sql`${organizations.metadata} || jsonb_build_object(${DEFAULTS_KEY}::text, ${JSON.stringify(value)}::jsonb)`,
    })
    .where(eq(organizations.id, organizationId));
  return value;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One question's text with the source brand's places replaced by the target's, where both have that kind of place
 * (suburb for suburb, city for city, state for state), whole words, any case.
 */
export function swapPlaces(
  text: string,
  from: { suburb: string | null; city: string | null; state: string | null },
  to: { suburb: string | null; city: string | null; state: string | null },
): string {
  const pairs = (["suburb", "city", "state"] as const)
    .map((k) => [from[k]?.trim(), to[k]?.trim()] as const)
    .filter(
      (p): p is readonly [string, string] =>
        !!p[0] && !!p[1] && p[0].toLowerCase() !== p[1].toLowerCase(),
    )
    .sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [a, b] of pairs) {
    out = out.replace(
      new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(a)}(?=$|[^A-Za-z0-9])`, "gi"),
      `$1${b}`,
    );
  }
  return out;
}

/**
 * Copies the source brand's everyday questions (its current set) into the target's library as suggestions, source
 * agency, places swapped; never a shared row (questions always belong to one brand). Skips questions the target
 * already has (by compared text), and any that would name the target business. Both brands must be the workspace's.
 */
export async function copyQuestions(
  db: DbClient,
  input: { organizationId: string; sourceBrandId: string; targetBrandId: string; userId: string },
): Promise<{ added: number } | null> {
  const pick = {
    id: brands.id,
    name: brands.name,
    domain: brands.domain,
    aliases: brands.aliases,
    suburb: brands.suburb,
    city: brands.city,
    state: brands.state,
  };
  // Each read names its brand (tests/unit/governance/no-arbitrary-first-brand.test.ts); both are the workspace's own.
  const sameWorkspace = and(
    eq(brands.organizationId, input.organizationId),
    isNull(brands.deletedAt),
  );
  const [source] = await db
    .select(pick)
    .from(brands)
    .where(and(eq(brands.id, input.sourceBrandId), sameWorkspace));
  const [target] = await db
    .select(pick)
    .from(brands)
    .where(and(eq(brands.id, input.targetBrandId), sameWorkspace))
    .for("update");
  if (!source || !target) return null;

  const set = await loadCurrentQuestionSet(db, source.id);
  const existing = await db
    .select({ key: brandQuestions.textKey })
    .from(brandQuestions)
    .where(and(eq(brandQuestions.brandId, target.id), isNull(brandQuestions.archivedAt)));
  const seen = new Set(existing.map((e) => e.key));
  let added = 0;
  for (const item of set?.items ?? []) {
    if (item.kind !== "everyday") continue;
    const text = swapPlaces(item.text, source, target);
    const key = questionTextKey(text);
    if (seen.has(key) || text.length < 10 || text.length > 200) continue;
    if (
      isBrandedPrompt(text, { name: target.name, domain: target.domain, aliases: target.aliases })
    )
      continue;
    seen.add(key);
    await db.insert(brandQuestions).values({
      organizationId: input.organizationId,
      brandId: target.id,
      text,
      textKey: sql`question_text_key(${text})`,
      kind: "everyday",
      source: "agency",
      reach: "local",
      status: "suggested",
      createdBy: input.userId,
    });
    added++;
  }
  return { added };
}
