import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import SampleResultView from "./sample-result-view";

// No signed-in user on this route — sample audits are deliberately public,
// gated by metadata.isSample rather than by tenant, so this reads via
// serviceDb (bypasses RLS by design) instead of the RLS-enforced client.
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
