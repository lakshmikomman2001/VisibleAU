import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { audits, brands, organizations } from "@/db/schema";
import { checkSampleAuditReadRateLimit } from "@/lib/sample-audit/rate-limit";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";
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
      brandName: brands.name,
      brandDomain: brands.domain,
      brandSuburb: brands.suburb,
      brandCity: brands.city,
      brandState: brands.state,
      metadata: audits.metadata,
    })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .innerJoin(organizations, eq(audits.organizationId, organizations.id))
    .where(and(eq(audits.id, id), eq(organizations.slug, SAMPLE_ORG_SLUG)));

  if (!audit) notFound();

  const meta = audit.metadata as Record<string, unknown> | null;
  if (!meta?.isSample) notFound();

  // Audit reliability, Part C, item 4 / reliability follow-up item 4
  // -- "Label the result 'in <place>'" (curated: suburb alone, e.g.
  // "Bondi") / "in <Suburb>, <STATE>" (custom suburb, no curated
  // city, e.g. "Norwest, NSW") -- the exact same rule lib/brands/
  // region-label.ts's resolveRegionLabel already uses for the
  // {location}/{region} prompts this audit actually asked, so the
  // headline names the same place the questions were about. Every
  // sample brand always has a suburb (item 4 made it required), so
  // this never falls through to a city/region/country fallback the
  // way resolveRegionLabel's own fuller chain would for a real brand.
  const place = audit.brandSuburb
    ? !audit.brandCity && audit.brandState
      ? `${audit.brandSuburb}, ${audit.brandState}`
      : audit.brandSuburb
    : null;

  // Task #46 (fix: stored value contradicting its own CI): this is the
  // highest-visibility instance of that bug -- the free, unauthenticated
  // top-of-funnel page a prospect sees before signing up. Every dimension
  // VALUE, not just the headline, now comes from the same live, read-time
  // recompute over real citations (lib/scoring/resolve-audit-dimensions.ts)
  // the audit page/badge/client-portal use -- never the stored
  // audits.score_* columns, which can go stale the moment a prod-fix
  // changes which rows count as organic without the audit being re-run.
  let insufficientData = false;
  let noAnswers = false;
  let sampleSize = 0;
  let mentionedCount = 0;
  let headlineValue: number | null = null;
  let frequencyValue: number | null = null;
  let positionValue: number | null = null;
  let accuracyValue: number | null = null;
  if (audit.status === "complete") {
    const resolved = await resolveAuditDimensionsAndHeadline(serviceDb, audit.id);
    sampleSize = resolved.sampleCount;
    mentionedCount = resolved.mentionedCount;
    insufficientData = resolved.mentionedCount === 0;
    // Vunnara (19 Oct): the headline is the Frequency DimensionResult
    // (mention rate), never a blend. It's insufficient_data ("no_answers")
    // only when there were zero successful organic answers -- null here,
    // with noAnswers telling the view to say so instead of a fake 0.
    noAnswers = resolved.headline.status !== "scored";
    headlineValue = resolved.headline.status === "scored" ? resolved.headline.value : null;
    frequencyValue =
      resolved.dimensions.frequency.status === "scored" ? resolved.dimensions.frequency.value : null;
    // Position/Accuracy are "insufficient" under exactly the same
    // condition as insufficientData above (both gate on the same real
    // mention count) -- no separate flag needed, mirroring the original
    // single-insufficientData design.
    positionValue =
      resolved.dimensions.position.status === "scored" ? resolved.dimensions.position.value : null;
    accuracyValue =
      resolved.dimensions.accuracy.status === "scored" ? resolved.dimensions.accuracy.value : null;
  }

  return (
    <SampleResultView
      audit={{
        id: audit.id,
        status: audit.status,
        headlineValue,
        frequencyValue,
        positionValue,
        accuracyValue,
        brandName: audit.brandName,
        brandDomain: audit.brandDomain,
        place,
        insufficientData,
        noAnswers,
        sampleSize,
        mentionedCount,
      }}
    />
  );
}
