import { notFound, redirect } from "next/navigation";
import { QuestionsTab } from "@/components/domain/questions/questions-tab";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
import { isUuid } from "@/lib/validation/uuid";

/**
 * S02 part 4 (contract P02, LLD 8.2.2): /brands/:id/questions, the brand's Questions tab, read-only until S03. The
 * brand layout has already checked access to the brand (another workspace's is 404); the tab's one request
 * (GET /api/brands/:id/questions) reads the plan. P02.states.flagOff: with question_library off there's no tab, and
 * this route goes to the brand page.
 */
export default async function BrandQuestionsPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();
  if (!(await isEnabled("question_library", currentUser.organizationId))) {
    redirect(`/brands/${brandId}`);
  }
  return (
    <div className="p-4 min-[641px]:p-8" style={{ maxWidth: 1040 }}>
      <QuestionsTab brandId={brandId} />
    </div>
  );
}
