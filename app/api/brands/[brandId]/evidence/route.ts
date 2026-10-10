import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, evidenceSnapshots } from "@/db/schema";
import { dedupeResponses } from "@/lib/audit/dedupe-responses";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  BrandAccessDeniedError,
  TierInsufficientError,
} from "@/lib/governance";
import { RUNS_MAX } from "@/lib/llm/tier-engines";
import { getBrandDistinctCitationCount } from "@/lib/trust";

const DISPLAY_LIMIT = 200;

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, "agency");
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: e.message }, { status: 403 });
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
      tx
        .select({
          id: evidenceSnapshots.id,
          engine: evidenceSnapshots.engine,
          prompt: evidenceSnapshots.prompt,
          rawResponse: evidenceSnapshots.rawResponse,
          scoreAtCapture: evidenceSnapshots.scoreAtCapture,
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

    return NextResponse.json({
      snapshots: snapshots.map((s) => ({
        id: s.id,
        engine: s.engine,
        prompt: s.prompt,
        rawResponse: s.rawResponse,
        scoreAtCapture: s.scoreAtCapture == null ? null : Number(s.scoreAtCapture),
        capturedAt: s.capturedAt,
      })),
      citationCount,
    });
  });
}
