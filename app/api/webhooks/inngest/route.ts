import { serve } from "inngest/next";
import { aggregateVisibilityTrendFn } from "@/inngest/functions/aggregate-visibility-trend";
import { auditDataRetention } from "@/inngest/functions/audit-data-retention";
import { auditEntityHomeFn } from "@/inngest/functions/audit-entity-home";
import { auditLinkedinPresenceFn } from "@/inngest/functions/audit-linkedin-presence";
import { auditSchedulesCron } from "@/inngest/functions/audit-schedules-cron";
import { auditYoutubePresenceFn } from "@/inngest/functions/audit-youtube-presence";
import { buildCitationSourceIntelligenceFn } from "@/inngest/functions/build-citation-source-intelligence";
import { bulkReauditOrchestrate } from "@/inngest/functions/bulk-reaudit-orchestrate";
import { calculateShareOfVoiceFn } from "@/inngest/functions/calculate-share-of-voice";
import { calculateTopicalGapsFn } from "@/inngest/functions/calculate-topical-gaps";
import { captureEvidenceSnapshot } from "@/inngest/functions/capture-evidence-snapshot";
import { checkCrossPlatformConsensusFn } from "@/inngest/functions/check-cross-platform-consensus";
import { classifyCitationSourcesFn } from "@/inngest/functions/classify-citation-sources";
import { classifyExistingBrands } from "@/inngest/functions/classify-existing-brands";
import { classifyOnBrandCreate } from "@/inngest/functions/classify-on-brand-create";
import { contentStructureAuditFn } from "@/inngest/functions/content-structure-audit";
import { crawlerLogIngestFn } from "@/inngest/functions/crawler-log-ingest";
import { deliverWebhookFn } from "@/inngest/functions/deliver-webhook";
import { detectDriftFn } from "@/inngest/functions/detect-drift";
import { detectHallucinationsFn } from "@/inngest/functions/detect-hallucinations";
import { fanoutWebhooksFn } from "@/inngest/functions/fanout-webhooks";
import { ga4PushFn } from "@/inngest/functions/ga4-push";
import { generateContentDraft } from "@/inngest/functions/generate-content-draft";
import { generateNarrativeReport } from "@/inngest/functions/generate-narrative-report";
import { generateRecommendations } from "@/inngest/functions/generate-recommendations";
import { ingestAiReferralsFn } from "@/inngest/functions/ingest-ai-referrals";
import { llmstxtRefreshFn } from "@/inngest/functions/llmstxt-refresh";
import { parseCrawlerLogFn } from "@/inngest/functions/parse-crawler-log";
import { refreshBotIpRangesFn } from "@/inngest/functions/refresh-bot-ip-ranges";
import { refreshEntityScoreFn } from "@/inngest/functions/refresh-entity-score";
import { renderReportPdf } from "@/inngest/functions/render-report-pdf";
import { runAudit } from "@/inngest/functions/run-audit";
import { runComparisonPromptsFn } from "@/inngest/functions/run-comparison-prompts";
import { runJourneyFn } from "@/inngest/functions/run-journey";
import { sampleAuditCleanup } from "@/inngest/functions/sample-audit-cleanup";
import { scheduleWorkflowRuns } from "@/inngest/functions/schedule-workflow-runs";
import { scoreAgentReadinessFn } from "@/inngest/functions/score-agent-readiness";
import { sendAuditCompleteEmail } from "@/inngest/functions/send-audit-complete-email";
import { sendScheduledReports } from "@/inngest/functions/send-scheduled-reports";
import { simulateQueryFanOutFn } from "@/inngest/functions/simulate-query-fan-out";
import { trackBrandWebMentionsFn } from "@/inngest/functions/track-brand-web-mentions";
import { triggerValidationReaudit } from "@/inngest/functions/trigger-validation-reaudit";
import { verifyCrawlerHitsFn } from "@/inngest/functions/verify-crawler-hits";
import { weeklyDigestCron } from "@/inngest/functions/weekly-digest-cron";
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
    runAudit,
    sampleAuditCleanup,
    sendAuditCompleteEmail,
    weeklyDigestCron,
    generateContentDraft,
    triggerValidationReaudit,
    scheduleWorkflowRuns,
    calculateShareOfVoiceFn,
    aggregateVisibilityTrendFn,
    simulateQueryFanOutFn,
    calculateTopicalGapsFn,
    classifyCitationSourcesFn,
    trackBrandWebMentionsFn,
    generateNarrativeReport,
    renderReportPdf,
    sendScheduledReports,
    detectHallucinationsFn,
    captureEvidenceSnapshot,
    refreshEntityScoreFn,
    buildCitationSourceIntelligenceFn,
    auditLinkedinPresenceFn,
    checkCrossPlatformConsensusFn,
    auditYoutubePresenceFn,
    crawlerLogIngestFn,
    contentStructureAuditFn,
    llmstxtRefreshFn,
    scoreAgentReadinessFn,
    auditEntityHomeFn,
    runJourneyFn,
    runComparisonPromptsFn,
    parseCrawlerLogFn,
    verifyCrawlerHitsFn,
    refreshBotIpRangesFn,
    ingestAiReferralsFn,
  ],
});
