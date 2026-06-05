import { serve } from "inngest/next";
import { generateRecommendations } from "@/inngest/functions/generate-recommendations";
import { runAudit } from "@/inngest/functions/run-audit";
import { sendAuditCompleteEmail } from "@/inngest/functions/send-audit-complete-email";
import { inngest } from "@/lib/inngest/client";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAudit, sendAuditCompleteEmail, generateRecommendations],
});
