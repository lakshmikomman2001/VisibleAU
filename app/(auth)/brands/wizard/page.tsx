import { enginesForTier, PROMPTS_PER_AUDIT, runsForTier } from "@/lib/llm/tier-engines";
import { WizardForm } from "./wizard-form";

export default function BrandWizardPage() {
  const auditConfig = {
    freeEngines: enginesForTier("free").length,
    freeRuns: runsForTier("free"),
    paidEngines: enginesForTier("growth").length,
    paidRuns: runsForTier("growth"),
    promptsPerAudit: PROMPTS_PER_AUDIT,
  };

  return <WizardForm auditConfig={auditConfig} />;
}
