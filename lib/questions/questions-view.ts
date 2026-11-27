import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandQuestionSets, brandQuestions, brands, users } from "@/db/schema";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { classificationFloor } from "@/lib/prompts/classification-floor";
import type { BrandClassification } from "@/lib/types/brand";

/**
 * S02 part 4 (LLD 8.2.2, 13; contract P02 view mode): what the brand's Questions tab shows, read in one query for the
 * set and its questions with each one's last result (no request per row), plus the version history and the library.
 */

export type EngineResult = "named" | "unverified" | "not_named" | "failed";

export interface QuestionView {
  id: string;
  position: number;
  text: string;
  kind: "everyday" | "branded";
  reach: "local" | "state" | "country" | "global";
  source: "original" | "template" | "ai_suggested" | "agency";
  serviceLabel: string | null;
  intent: string | null;
  /** Each engine's answer to this question in the brand's latest complete audit; null when that audit didn't ask it. */
  lastResult: Record<string, EngineResult> | null;
}

export interface QuestionsView {
  set: {
    id: string;
    version: number;
    appliedAt: string;
    appliedBy: string | null;
    /** Version 1 made by the 0155 backfill: "Version 1 · your original questions". */
    original: boolean;
    /** The first complete audit with this set's question hash; null when none has asked it yet. */
    comparingSinceAudit: number | null;
  } | null;
  questions: QuestionView[];
  lastAudit: { id: string; number: number; engines: string[] } | null;
  history: Array<{
    version: number;
    appliedAt: string;
    appliedBy: string | null;
    everyday: number;
    audits: { from: number; to: number } | null;
  }>;
  /** The brand's live library (not archived): every question it asks or could ask. */
  library: Array<{ id: string; text: string; kind: string; source: string; status: string }>;
  /** S03 part 5: `source` says where a suggestion came from (a template, or copied from another brand: agency). */
  suggestions: Array<{
    id: string;
    text: string;
    serviceLabel: string | null;
    source?: QuestionView["source"];
  }>;
}

const BACKFILL_NOTE = "0155 backfill: the stored question pack";

type Row = {
  question_id: string;
  position: number;
  text: string;
  kind: QuestionView["kind"];
  reach: QuestionView["reach"];
  source: QuestionView["source"];
  service_label: string | null;
  intent: string | null;
  results: Record<string, EngineResult> | null;
  set_id: string;
  version: number;
  applied_at: string;
  applied_by: string | null;
  note: string | null;
  comparing_since: number | null;
  audit_id: string | null;
  audit_number: number | null;
  audit_engines: string[] | null;
};

/**
 * The one query: the current set's items with their library rows, the brand's latest complete audit, the first audit
 * with the set's hash, and per question the latest audit's answers (by question_id, or by exact text for an audit from
 * before S02, which recorded none) and failed calls. Indexes: brand_question_sets_one_current, the items' primary key,
 * audits by brand, citations_audit_run_idx / engine_call_failures_audit_idx (EXPLAIN in the S02 report).
 */
export function questionsViewSql(brandId: string, organizationId: string) {
  return sql`
    WITH s AS (
      SELECT id, version, applied_at, applied_by, note, comparison_hash FROM brand_question_sets
      WHERE brand_id = ${brandId} AND organization_id = ${organizationId} AND is_current
    ),
    la AS (
      SELECT id, audit_number, engines FROM audits
      WHERE brand_id = ${brandId} AND organization_id = ${organizationId} AND status = 'complete'
      ORDER BY completed_at DESC NULLS LAST LIMIT 1
    ),
    since AS (
      SELECT a.audit_number FROM audits a JOIN s ON a.question_set_hash = s.comparison_hash
      WHERE a.brand_id = ${brandId} AND a.organization_id = ${organizationId} AND a.status = 'complete'
      ORDER BY a.completed_at ASC NULLS LAST LIMIT 1
    ),
    items AS (
      SELECT i.position, q.id, q.text, q.kind, q.reach, q.source, q.service_label, q.intent
      FROM s JOIN brand_question_set_items i ON i.set_id = s.id JOIN brand_questions q ON q.id = i.question_id
    ),
    answers AS (
      SELECT it.id AS question_id, c.engine,
             CASE WHEN c.brand_mentioned AND c.mention_verification = 'unverified' THEN 'unverified'
                  WHEN c.brand_mentioned THEN 'named' ELSE 'not_named' END AS result
      FROM items it CROSS JOIN la
      JOIN citations c ON c.audit_id = la.id AND c.run_number = 1
        AND (c.question_id = it.id OR (c.question_id IS NULL AND c.prompt = it.text))
      UNION ALL
      SELECT it.id, f.engine, 'failed'
      FROM items it CROSS JOIN la
      JOIN engine_call_failures f ON f.audit_id = la.id
        AND (f.question_id = it.id OR (f.question_id IS NULL AND f.prompt = it.text))
    ),
    res AS (SELECT question_id, jsonb_object_agg(engine, result) AS results FROM answers GROUP BY question_id)
    SELECT it.id AS question_id, it.position, it.text, it.kind, it.reach, it.source, it.service_label, it.intent,
           res.results,
           s.id AS set_id, s.version, s.applied_at, u.name AS applied_by, s.note,
           (SELECT audit_number FROM since) AS comparing_since,
           la.id AS audit_id, la.audit_number, la.engines AS audit_engines
    FROM items it CROSS JOIN s
    LEFT JOIN users u ON u.id = s.applied_by
    LEFT JOIN la ON true
    LEFT JOIN res ON res.question_id = it.id
    ORDER BY it.position`;
}

export async function loadQuestionsView(
  db: DbClient,
  input: { brandId: string; organizationId: string },
): Promise<QuestionsView> {
  const rows = [...(await db.execute<Row>(questionsViewSql(input.brandId, input.organizationId)))];
  const first = rows[0];

  const usedVersion = sql`a.brand_id = ${brandQuestionSets.brandId} AND a.status = 'complete'
    AND (a.question_set_id = ${brandQuestionSets.id}
      OR (a.question_set_id IS NULL AND a.question_set_hash = ${brandQuestionSets.comparisonHash}))`;
  const [history, library] = await Promise.all([
    db
      .select({
        id: brandQuestionSets.id,
        version: brandQuestionSets.version,
        appliedAt: brandQuestionSets.appliedAt,
        appliedBy: users.name,
        everyday: sql<number>`(SELECT count(*)::int FROM brand_question_set_items i
          WHERE i.set_id = ${brandQuestionSets.id} AND i.kind = 'everyday')`,
        // The audits that asked this version: those recorded with it, and those from before S02 (no set recorded)
        // whose questions hashed the same -- the 0155 backfill's version 1 links no past audit.
        from: sql<number | null>`(SELECT min(a.audit_number) FROM audits a WHERE ${usedVersion})`,
        to: sql<number | null>`(SELECT max(a.audit_number) FROM audits a WHERE ${usedVersion})`,
      })
      .from(brandQuestionSets)
      .leftJoin(users, eq(users.id, brandQuestionSets.appliedBy))
      .where(
        and(
          eq(brandQuestionSets.brandId, input.brandId),
          eq(brandQuestionSets.organizationId, input.organizationId),
        ),
      )
      .orderBy(desc(brandQuestionSets.version)),
    db
      .select({
        id: brandQuestions.id,
        text: brandQuestions.text,
        kind: brandQuestions.kind,
        source: brandQuestions.source,
        status: brandQuestions.status,
        serviceLabel: brandQuestions.serviceLabel,
      })
      .from(brandQuestions)
      .where(
        and(
          eq(brandQuestions.brandId, input.brandId),
          eq(brandQuestions.organizationId, input.organizationId),
          isNull(brandQuestions.archivedAt),
        ),
      )
      .orderBy(brandQuestions.createdAt),
  ]);

  return {
    set: first
      ? {
          id: first.set_id,
          version: first.version,
          appliedAt: new Date(first.applied_at).toISOString(),
          appliedBy: first.applied_by,
          original: first.version === 1 && first.note === BACKFILL_NOTE,
          comparingSinceAudit: first.comparing_since,
        }
      : null,
    questions: rows.map((r) => ({
      id: r.question_id,
      position: r.position,
      text: r.text,
      kind: r.kind,
      reach: r.reach,
      source: r.source,
      serviceLabel: r.service_label,
      intent: r.intent,
      lastResult: r.results,
    })),
    lastAudit:
      first?.audit_id && first.audit_number !== null
        ? { id: first.audit_id, number: first.audit_number, engines: first.audit_engines ?? [] }
        : null,
    history: history.map((h) => ({
      version: h.version,
      appliedAt: h.appliedAt.toISOString(),
      appliedBy: h.appliedBy,
      everyday: h.everyday,
      audits: h.from !== null && h.to !== null ? { from: h.from, to: h.to } : null,
    })),
    library: library.map(({ serviceLabel: _s, ...q }) => q),
    suggestions: library
      .filter((q) => q.status === "suggested")
      .map((q) => ({ id: q.id, text: q.text, serviceLabel: q.serviceLabel, source: q.source })),
  };
}

/** How many template alternatives the tab offers (LLD 8.2.2: "so S2 already shows alternatives"). */
export const SUGGESTION_COUNT = 5;

/**
 * S02 part 4 (LLD 8.2.2): template alternatives for the brand's type and place, made the first time the tab asks and
 * stored (source 'template', status 'suggested'): the same generator as the brand's pack (buildPromptPack), asked for
 * more everyday questions, keeping those the brand doesn't already have. Nothing for a brand that isn't confirmed yet
 * (no type or place to write them for) or that already has suggestions. They can't be applied until S03.
 */
export async function ensureTemplateSuggestions(
  db: DbClient,
  input: { brandId: string; organizationId: string },
): Promise<number> {
  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(brandQuestions)
    .where(
      and(
        eq(brandQuestions.brandId, input.brandId),
        eq(brandQuestions.source, "template"),
        isNull(brandQuestions.archivedAt),
      ),
    );
  if ((existing?.n ?? 0) > 0) return 0;
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, input.organizationId)));
  if (brand?.classificationStatus !== "complete" || !brand.locationMode) return 0;
  const classification =
    (brand.classification as BrandClassification | null) ??
    classificationFloor({ categories: brand.categories, audience: brand.audience });
  const wider = buildPromptPack(
    classification,
    brand.name,
    brand.domain,
    {
      competitors: brand.competitors,
      categories: brand.categories,
      audience: brand.audience ?? undefined,
    },
    resolveRegionLabel(brand),
    PROMPTS_PER_AUDIT + SUGGESTION_COUNT * 2,
    brand.id,
  ).filter((text) => !isBrandedPrompt(text, brand) && text.length >= 10 && text.length <= 200);
  const keys = await db.execute<{ text: string; key: string }>(
    sql`SELECT t AS text, question_text_key(t) AS key FROM unnest(ARRAY[${sql.join(
      wider.map((t) => sql`${t}::text`),
      sql`, `,
    )}]::text[]) AS t`,
  );
  const taken = new Set(
    (
      await db
        .select({ key: brandQuestions.textKey })
        .from(brandQuestions)
        .where(and(eq(brandQuestions.brandId, input.brandId), isNull(brandQuestions.archivedAt)))
    ).map((r) => r.key),
  );
  const fresh: string[] = [];
  for (const k of keys) {
    if (fresh.length >= SUGGESTION_COUNT) break;
    if (taken.has(k.key)) continue;
    taken.add(k.key);
    fresh.push(k.text);
  }
  if (fresh.length === 0) return 0;
  await db
    .insert(brandQuestions)
    .values(
      fresh.map((text) => ({
        organizationId: input.organizationId,
        brandId: input.brandId,
        text,
        textKey: sql`question_text_key(${text})`,
        kind: "everyday" as const,
        source: "template" as const,
        reach: "local" as const,
        status: "suggested" as const,
      })),
    )
    .onConflictDoNothing();
  return fresh.length;
}
