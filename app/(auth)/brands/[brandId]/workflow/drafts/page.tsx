import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PlanLockedPage } from "@/components/domain/pricing/plan-lock";
import { withRlsContext } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brandFeatureIncluded } from "@/lib/pricing/brand-features";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { DraftsPageClient } from "./drafts-page-client";

export default async function DraftsPage({ params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  // Brand-feature locks (8 Nov), part 1: tasks and drafts are Growth (their routes say so, from
  // lib/pricing/brand-features.ts). On a plan without them the page shows the locked card and reads nothing;
  // it used to list them and every action on them answered 403.
  const tier = await withRlsContext(currentUser.organizationId, (tx) =>
    effectiveTier(tx, currentUser.organizationId),
  );
  if (!brandFeatureIncluded(tier, "content_drafts")) {
    return <PlanLockedPage title="Content Drafts" feature="content_drafts" />;
  }

  const drafts = await withRlsContext(currentUser.organizationId, async (tx) => {
    return tx
      .select()
      .from(contentDrafts)
      .where(eq(contentDrafts.brandId, brandId))
      .orderBy(desc(contentDrafts.createdAt));
  });

  const serialized = drafts.map((d) => ({
    id: d.id,
    title: d.title,
    body: d.body,
    status: d.status,
    draftType: d.draftType,
    contentFormat: d.contentFormat,
    formatRecommendationReason: d.formatRecommendationReason,
    targetWordCount: d.targetWordCount,
    wordCount: d.wordCount,
    createdAt: d.createdAt.toISOString(),
  }));

  return <DraftsPageClient brandId={brandId} drafts={serialized} />;
}
