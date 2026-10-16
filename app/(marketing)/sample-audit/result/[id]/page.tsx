import { and, count, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { audits, brands, citations, organizations } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { checkSampleAuditReadRateLimit } from "@/lib/sample-audit/rate-limit";
import { NOT_MEASURED_DIMENSION, resolveComposite, resolveDimension } from "@/lib/scoring/dimension-result";
import { wilsonCI, wilsonCIFromScore } from "@/lib/scoring/wilson";
import SampleResultView from "./sample-result-view";

const SAMPLE_ORG_SLUG = "__sample__";

// No signed-in user on this route — sample audits are deliberately public,
// gated by metadata.isSample rather than by tenant, so this reads via
// serviceDb (bypasses RLS by design) instead of the RLS-enforced client.
// serviceDb stays justified: there is no session/org context to run an
// RLS-scoped query with here, same reasoning as the sibling status routes.
//
// Task #46 (15th follow-up), Part B -- fixes the MEDIUM the 14th
// follow-up documented without fixing. Defence in depth:
// 1. DB-level join against the hardcoded sample org (primary guarantee --
//    structurally cannot return a real tenant's row, same pattern as
//    app/api/sample-audit/[auditId]/status/route.ts), PLUS the original
//    metadata.isSample check kept as a redundant secondary check.
// 2. Field allow-list: SampleResultView's own AuditResult type never read
//    `metadata` (confirmed) -- it was only serialized into the client
//    payload because the whole server-selected row was passed through
//    `JSON.parse(JSON.stringify(audit))`, which launders the type to
//    `any` and silently defeated the component prop type's own narrower
//    shape. Replaced with an explicit object literal matching exactly
//    what SampleResultView declares; `scoreSentiment`/`scoreContext`
//    (the string-label columns, as opposed to their *Numeric siblings,
//    which the view actually renders) are no longer even selected from
//    the DB, let alone returned.
// 3. `id` is validated as a real UUID before either check runs (the
//    column is `defaultRandom()` -- confirmed not sequential/guessable).
// 4. Rate limited by IP, same limiter/window as the status-polling
//    routes (60/min) -- generous for a one-time result-page view, still
//    bounds a UUID-enumeration scrape. A Server Component can't set a
//    429 status directly (no route handler here), so this renders an
//    inline message instead.
export default async function SampleResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkSampleAuditReadRateLimit(ip);
  if (!allowed) {
    return (
      <div className="text-center py-20">
        <p style={{ color: "var(--text-secondary)" }}>
          Too many requests. Please try again in a minute.
        </p>
      </div>
    );
  }

  const [audit] = await serviceDb
    .select({
      id: audits.id,
      status: audits.status,
      scoreFrequency: audits.scoreFrequency,
      scorePosition: audits.scorePosition,
      scoreAccuracy: audits.scoreAccuracy,
      brandName: brands.name,
      brandDomain: brands.domain,
      metadata: audits.metadata,
    })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .innerJoin(organizations, eq(audits.organizationId, organizations.id))
    .where(and(eq(audits.id, id), eq(organizations.slug, SAMPLE_ORG_SLUG)));

  if (!audit) notFound();

  const meta = audit.metadata as Record<string, unknown> | null;
  if (!meta?.isSample) notFound();

  // Task #46 Phase 2: this is the highest-visibility instance of the
  // insufficient-data bug -- the free, unauthenticated top-of-funnel page a
  // prospect sees before signing up. A zero-mention sample audit's
  // scoreComposite/dimension scores are real, non-fabricated "0.00"
  // strings (lib/scoring/dimension-result.ts's own `if (...length === 0)
  // return 0`), not "measured as the worst possible score" -- the TRUE
  // independent-sample mention count (organic, run_number = 1, same gate
  // the audit detail page uses) decides which is true.
  let insufficientData = false;
  let sampleSize = 0;
  // Task #46 Phase 3, Part C: the stored audits.score_composite column is
  // stale -- it was blended with Sentiment/Context fabricated from mention
  // presence at 20%/15% weight. compositeValue below is the live,
  // honest recompute (same resolveDimension/resolveComposite contract as
  // the audit page, the export route, the badge, and the client portal),
  // excluding both entirely -- this page is the highest-visibility
  // instance of the insufficient-data fix (the free pre-signup page), so
  // it gets the same live-recompute treatment, not just the badge/dashboard.
  let compositeValue: number | null = null;
  if (audit.status === "complete") {
    const [{ distinctSampleCount, distinctMentionedCount, distinctAccWithSourcesCount }] =
      await serviceDb
        .select({
          distinctSampleCount: count(),
          distinctMentionedCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
          distinctAccWithSourcesCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true AND jsonb_array_length(cited_sources) > 0 THEN 1 ELSE 0 END), 0)`,
        })
        .from(citations)
        .where(and(eq(citations.auditId, audit.id), ORGANIC_ONLY, eq(citations.runNumber, 1)));
    sampleSize = Number(distinctSampleCount);
    // Postgres SUM() surfaces as a string via the JS driver -- coerce
    // before the `=== 0` check (lib/scoring/dimension-result.ts's own
    // comment documents this exact root cause).
    const mentioned = Number(distinctMentionedCount);
    const accWithSources = Number(distinctAccWithSourcesCount);
    insufficientData = mentioned === 0;

    const frequency = resolveDimension(
      Number(audit.scoreFrequency ?? 0),
      wilsonCI(mentioned, sampleSize),
      mentioned,
      { alwaysScored: true },
    );
    const position = resolveDimension(
      Number(audit.scorePosition ?? 0),
      wilsonCIFromScore(Number(audit.scorePosition ?? 0), mentioned),
      mentioned,
    );
    const accuracy = resolveDimension(
      Number(audit.scoreAccuracy ?? 0),
      wilsonCI(accWithSources, mentioned),
      mentioned,
    );
    compositeValue = resolveComposite({
      frequency,
      position,
      sentiment: NOT_MEASURED_DIMENSION,
      context: NOT_MEASURED_DIMENSION,
      accuracy,
    }).value;
  }

  return (
    <SampleResultView
      audit={{
        id: audit.id,
        status: audit.status,
        compositeValue,
        scoreFrequency: audit.scoreFrequency,
        scorePosition: audit.scorePosition,
        scoreAccuracy: audit.scoreAccuracy,
        brandName: audit.brandName,
        brandDomain: audit.brandDomain,
        insufficientData,
        sampleSize,
      }}
    />
  );
}
