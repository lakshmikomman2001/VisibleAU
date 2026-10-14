import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { audits, brands, organizations } from "@/db/schema";
import { checkSampleAuditReadRateLimit } from "@/lib/sample-audit/rate-limit";
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
      scoreComposite: audits.scoreComposite,
      scoreFrequency: audits.scoreFrequency,
      scorePosition: audits.scorePosition,
      scoreSentimentNumeric: audits.scoreSentimentNumeric,
      scoreContextNumeric: audits.scoreContextNumeric,
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

  return (
    <SampleResultView
      audit={{
        id: audit.id,
        status: audit.status,
        scoreComposite: audit.scoreComposite,
        scoreFrequency: audit.scoreFrequency,
        scorePosition: audit.scorePosition,
        scoreSentimentNumeric: audit.scoreSentimentNumeric,
        scoreContextNumeric: audit.scoreContextNumeric,
        scoreAccuracy: audit.scoreAccuracy,
        brandName: audit.brandName,
        brandDomain: audit.brandDomain,
      }}
    />
  );
}
