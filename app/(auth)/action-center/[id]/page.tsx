import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ActionStatusButtons } from "@/components/domain/action-center/action-status-buttons";
import { ConfidenceBadge } from "@/components/domain/action-center/confidence-badge";
import { EvidenceLink } from "@/components/domain/action-center/evidence-link";
import { TierGate } from "@/components/domain/action-center/tier-gate";
import { db, setRlsContext } from "@/db/client";
import { actionItems, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function ActionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { id } = await params;
  const [item] = await db
    .select({
      id: actionItems.id,
      recommendationKey: actionItems.recommendationKey,
      dimension: actionItems.dimension,
      title: actionItems.title,
      action: actionItems.action,
      confidenceLabel: actionItems.confidenceLabel,
      expectedImpactScore: actionItems.expectedImpactScore,
      evidenceRefs: actionItems.evidenceRefs,
      status: actionItems.status,
      brandId: actionItems.brandId,
      brandName: brands.name,
      auditId: actionItems.auditId,
      createdAt: actionItems.createdAt,
      updatedAt: actionItems.updatedAt,
    })
    .from(actionItems)
    .innerJoin(brands, eq(actionItems.brandId, brands.id))
    .where(eq(actionItems.id, id));

  if (!item) notFound();

  const isFree = currentUser.organization.tier === "free";
  const evidenceRefs = (item.evidenceRefs ?? []) as Array<{
    source: string;
    url: string;
    summary: string;
  }>;

  function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 32px" }}>
      <ConfidenceBadge label={item.confidenceLabel} />
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          margin: "8px 0 4px",
        }}
      >
        {item.title}
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 24px" }}>
        {item.brandName} &middot; {capitalize(item.dimension)}
      </p>

      <TierGate isFree={isFree}>
        <div style={{ marginBottom: 24 }}>
          <h2
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
              marginBottom: 8,
            }}
          >
            What to do
          </h2>
          <p style={{ fontSize: 15, color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>
            {item.action}
          </p>
        </div>
      </TierGate>

      <EvidenceLink evidenceRefs={evidenceRefs} />

      {!isFree && item.status !== "done" && item.status !== "dismissed" && (
        <ActionStatusButtons itemId={item.id} />
      )}
    </div>
  );
}
