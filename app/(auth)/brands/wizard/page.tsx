import { redirect } from "next/navigation";
import { BrandLimitCard } from "@/components/domain/new-brand-button";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { countBrands } from "@/lib/brands";
import { brandUsage } from "@/lib/brands/limits";
import { enginesForTier, PROMPTS_PER_AUDIT, runsForTier } from "@/lib/llm/tier-engines";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { WizardForm } from "./wizard-form";

export default async function BrandWizardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // The API refuses a brand over the plan's limit (POST /api/brands): say so
  // here, before the form, rather than after it's filled in -- whichever link
  // led here (6 Nov, phone-layout follow-ups, item 1). Read as the API reads it.
  const usage = await withRlsContext(user.organizationId, async (tx) =>
    brandUsage(
      await effectiveTier(tx, user.organizationId),
      await countBrands(tx, user.organizationId),
    ),
  );
  if (!usage.canAdd) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: "0 0 16px",
          }}
        >
          Add a brand
        </h1>
        <BrandLimitCard usage={usage} />
      </div>
    );
  }

  const auditConfig = {
    freeEngines: enginesForTier("free").length,
    freeRuns: runsForTier("free"),
    paidEngines: enginesForTier("growth").length,
    paidRuns: runsForTier("growth"),
    promptsPerAudit: PROMPTS_PER_AUDIT,
  };

  return <WizardForm auditConfig={auditConfig} />;
}
