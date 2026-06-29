import { serve } from "inngest/next";
import { auditDataRetention } from "@/inngest/functions/audit-data-retention";
import { auditSchedulesCron } from "@/inngest/functions/audit-schedules-cron";
import { bulkReauditOrchestrate } from "@/inngest/functions/bulk-reaudit-orchestrate";
import { classifyExistingBrands } from "@/inngest/functions/classify-existing-brands";
import { classifyOnBrandCreate } from "@/inngest/functions/classify-on-brand-create";
import { deliverWebhookFn } from "@/inngest/functions/deliver-webhook";
import { detectDriftFn } from "@/inngest/functions/detect-drift";
import { fanoutWebhooksFn } from "@/inngest/functions/fanout-webhooks";
import { ga4PushFn } from "@/inngest/functions/ga4-push";
import { generateRecommendations } from "@/inngest/functions/generate-recommendations";
import { localSeoAuditFn } from "@/inngest/functions/local-seo-audit";
import { runAudit } from "@/inngest/functions/run-audit";
import { sendAuditCompleteEmail } from "@/inngest/functions/send-audit-complete-email";
import { sampleAuditCleanup } from "@/inngest/functions/sample-audit-cleanup";
import { weeklyDigestCron } from "@/inngest/functions/weekly-digest-cron";
import { generateContentDraft } from "@/inngest/functions/generate-content-draft";
import { triggerValidationReaudit } from "@/inngest/functions/trigger-validation-reaudit";
import { scheduleWorkflowRuns } from "@/inngest/functions/schedule-workflow-runs";
import { inngest } from "@/lib/inngest/client";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    auditDataRetention,
    auditSchedulesCron,
    bulkReauditOrchestrate,
    classifyExistingBrands,
    classifyOnBrandCreate,
    deliverWebhookFn,
    detectDriftFn,
    fanoutWebhooksFn,
    ga4PushFn,
    generateRecommendations,
    localSeoAuditFn,
    runAudit,
    sampleAuditCleanup,
    sendAuditCompleteEmail,
    weeklyDigestCron,
    generateContentDraft,
    triggerValidationReaudit,
    scheduleWorkflowRuns,
  ],
});
