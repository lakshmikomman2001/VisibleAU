import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, citations, evidenceSnapshots } from "@/db/schema";
import { dedupeResponses } from "@/lib/audit/dedupe-responses";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  brandAccessErrorResponse,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { RUNS_MAX } from "@/lib/llm/tier-engines";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { getBrandDistinctCitationCount } from "@/lib/trust";
import { evidenceAnswerKey } from "@/lib/trust/evidence-archive-copy";

const DISPLAY_LIMIT = 200;

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, brandFeaturePlan("evidence_archive"));
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    if (e instanceof TierInsufficientError) return tierRefusal(e);
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [rawSnapshots, citationCount] = await Promise.all([
      // Task #40: historical rows may still be up to RUNS_MAX (5)
      // copies of the same (engine, prompt) response -- captureEvidenceSnapshots
      // only started storing one per group after this fix; rows written
      // before it remain 5x-inflated. Fetching DISPLAY_LIMIT * RUNS_MAX
      // raw rows (a generous margin) before deduping below means a full
      // page of DISTINCT responses survives even when every one of them
      // happens to fall in the most-duplicated part of the table -- a
      // plain DISPLAY_LIMIT-row fetch would mostly collapse to ~1/5th
      // that many distinct responses. See
      // docs/ops/post-launch-db-hardening.md section 40.
      //
      // 17 Nov, part 3: score_at_capture is no longer read or sent. It was
      // copied from citations.sentiment_score, which nothing writes, and the
      // page showed it as "Sentiment: +N%" (sentiment isn't measured).
      tx
        .select({
          id: evidenceSnapshots.id,
          auditId: evidenceSnapshots.auditId,
          engine: evidenceSnapshots.engine,
          prompt: evidenceSnapshots.prompt,
          rawResponse: evidenceSnapshots.rawResponse,
          capturedAt: evidenceSnapshots.capturedAt,
        })
        .from(evidenceSnapshots)
        .where(eq(evidenceSnapshots.brandId, brandId))
        .orderBy(desc(evidenceSnapshots.capturedAt))
        .limit(DISPLAY_LIMIT * RUNS_MAX),
      // Task #38: see docs/ops/post-launch-db-hardening.md section 38 --
      // the deduped, organic sample instead of the replay-inflated raw
      // count (getBrandCitationCount was built as an audit-progress-bar
      // denominator, not a coverage figure to show a user).
      getBrandDistinctCitationCount(tx, brandId),
    ]);

    // Reuses the same content-based dedupeResponses() the Responses tab
    // uses (#24/task TTT) -- not a second implementation. The query above
    // already orders newest-first, and dedupeResponses keeps the first
    // occurrence of each (engine, prompt, response) group, so the
    // surviving row is the latest one in each duplicate set.
    const snapshots = dedupeResponses(
      rawSnapshots.map((s) => ({ ...s, responseSnippet: s.rawResponse })),
    ).slice(0, DISPLAY_LIMIT);

    // 17 Nov, part 3: the archive keeps every first-run answer, including the
    // answers to questions that named the business (citations.is_branded_prompt),
    // which the audit page doesn't count as everyday answers (ORGANIC_ONLY,
    // lib/audit/organic-filter.ts). Each snapshot is matched back to its
    // citations row (same audit, engine and question, run 1) so the page can mark
    // those. A legacy NULL flag counts as an everyday question, as ORGANIC_ONLY
    // counts it; a snapshot whose audit was deleted can't be matched (null).
    const auditIds = [
      ...new Set(snapshots.map((s) => s.auditId).filter((id): id is string => id !== null)),
    ];
    const namedRows =
      auditIds.length === 0
        ? []
        : await tx
            .select({
              auditId: citations.auditId,
              engine: citations.engine,
              prompt: citations.prompt,
            })
            .from(citations)
            .where(
              and(
                inArray(citations.auditId, auditIds),
                eq(citations.runNumber, 1),
                eq(citations.isBrandedPrompt, true),
              ),
            );
    const namedKeys = new Set(
      namedRows.map((r) => evidenceAnswerKey(r.auditId, r.engine, r.prompt)),
    );

    return NextResponse.json({
      snapshots: snapshots.map((s) => ({
        id: s.id,
        engine: s.engine,
        prompt: s.prompt,
        rawResponse: s.rawResponse,
        capturedAt: s.capturedAt,
        askedByName:
          s.auditId === null
            ? null
            : namedKeys.has(evidenceAnswerKey(s.auditId, s.engine, s.prompt)),
      })),
      citationCount,
    });
  });
}
