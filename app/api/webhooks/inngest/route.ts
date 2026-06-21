import { serve } from "inngest/next";
import { classifyExistingBrands } from "@/inngest/functions/classify-existing-brands";
import { classifyOnBrandCreate } from "@/inngest/functions/classify-on-brand-create";
import { deliverWebhookFn } from "@/inngest/functions/deliver-webhook";
import { detectDriftFn } from "@/inngest/functions/detect-drift";
import { fanoutWebhooksFn } from "@/inngest/functions/fanout-webhooks";
import { generateRecommendations } from "@/inngest/functions/generate-recommendations";
import { localSeoAuditFn } from "@/inngest/functions/local-seo-audit";
import { runAudit } from "@/inngest/functions/run-audit";
import { sendAuditCompleteEmail } from "@/inngest/functions/send-audit-complete-email";
import { inngest } from "@/lib/inngest/client";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    runAudit,
    sendAuditCompleteEmail,
    generateRecommendations,
    classifyOnBrandCreate,
    classifyExistingBrands,
    localSeoAuditFn,
    detectDriftFn,
    deliverWebhookFn,
    fanoutWebhooksFn,
  ],
});
