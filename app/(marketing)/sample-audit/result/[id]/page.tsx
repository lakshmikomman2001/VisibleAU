import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import SampleResultView from "./sample-result-view";

// No signed-in user on this route — sample audits are deliberately public,
// gated by metadata.isSample rather than by tenant, so this reads via
// serviceDb (bypasses RLS by design) instead of the RLS-enforced client.
//
// Task #46 (14th follow-up) serviceDb audit -- MEDIUM, documented not fixed:
// `id` is caller-supplied and the query has NO organization/brand filter at
// all; the ONLY thing stopping this from serving a real customer's audit is
// the `metadata.isSample` boolean check below, same weak pattern as the
// sibling app/api/audits/[auditId]/status/route.ts -- except this page
// returns MORE: the full score breakdown plus brandName/brandDomain, not
// just a status string. There is no DB-level guarantee (no join against a
// hardcoded sample org, the way app/api/sample-audit/[auditId]/status/route.ts
// does it) that `isSample` can't be wrong on a real audit row. Recommend the
// same join-against-sample-org pattern; flagged for Sri, not fixed here.
export default async function SampleResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [audit] = await serviceDb
    .select({
      id: audits.id,
      status: audits.status,
      scoreComposite: audits.scoreComposite,
      scoreFrequency: audits.scoreFrequency,
      scorePosition: audits.scorePosition,
      scoreSentiment: audits.scoreSentiment,
      scoreSentimentNumeric: audits.scoreSentimentNumeric,
      scoreContext: audits.scoreContext,
      scoreContextNumeric: audits.scoreContextNumeric,
      scoreAccuracy: audits.scoreAccuracy,
      brandName: brands.name,
      brandDomain: brands.domain,
      metadata: audits.metadata,
    })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .where(eq(audits.id, id));

  if (!audit) notFound();

  const meta = audit.metadata as Record<string, unknown> | null;
  if (!meta?.isSample) notFound();

  return <SampleResultView audit={JSON.parse(JSON.stringify(audit))} />;
}
