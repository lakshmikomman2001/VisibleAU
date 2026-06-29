import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { db, setRlsContext } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DraftsPageClient } from "./drafts-page-client";

export default async function DraftsPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  const drafts = await db
    .select()
    .from(contentDrafts)
    .where(eq(contentDrafts.brandId, brandId))
    .orderBy(desc(contentDrafts.createdAt));

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
