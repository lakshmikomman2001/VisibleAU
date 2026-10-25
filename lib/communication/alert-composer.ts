import { type NotificationType, resolveNotificationRecipients } from "@/lib/email/recipients";
import { idempotencyKeyFor, type SendEmailResult, sendEmail } from "@/lib/email/send";
import { consensusAlertEmail } from "@/lib/email/templates/alerts/consensus";
import { driftAlertEmail } from "@/lib/email/templates/alerts/drift";
import { hallucinationAlertEmail } from "@/lib/email/templates/alerts/hallucination";
import { promptPackGenerationFailedEmail } from "@/lib/email/templates/alerts/prompt-pack-generation-failed";
import { scheduleNeedsConfirmationEmail } from "@/lib/email/templates/alerts/schedule-needs-confirmation";
import { volatilityAlertEmail } from "@/lib/email/templates/alerts/volatility";
import type { RenderedEmail } from "@/lib/email/templates/layout";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sends one alert to whoever should get it: nobody if the org has
 * switched this type off, otherwise its owner and admins (lib/email/
 * recipients.ts) -- one send each, each with its own idempotency key.
 * Every template ends with the notification-settings link
 * (lib/email/templates/layout.ts). Returns every send's result (empty
 * when nobody was due one); callers in an Inngest step throw on a
 * failure so the step retries.
 */
async function sendAlert(
  type: NotificationType,
  a: { organizationId: string; idempotencyBase?: string; email: RenderedEmail },
): Promise<SendEmailResult[]> {
  const { enabled, recipients } = await resolveNotificationRecipients(a.organizationId, type);
  if (!enabled || recipients.length === 0) {
    console.info(
      JSON.stringify({
        event: "email_skipped",
        category: "alert",
        alert: type,
        reason: enabled ? "no_recipients" : "switched_off",
        organizationId: a.organizationId,
      }),
    );
    return [];
  }
  const results: SendEmailResult[] = [];
  for (const to of recipients) {
    results.push(
      await sendEmail({
        to,
        ...a.email,
        category: "alert",
        organizationId: a.organizationId,
        idempotencyKey: a.idempotencyBase ? idempotencyKeyFor(a.idempotencyBase, to) : undefined,
      }),
    );
  }
  return results;
}

interface AlertBase {
  organizationId: string;
  /** Names this alert for its idempotency key -- set by every caller
   * that sends from an Inngest step, so a replay never sends twice. */
  idempotencyBase?: string;
}

// ---------------------------------------------------------------------------
// 1. Hallucination Alert -- emailOnHallucination (default on)
//    Trigger: detect-hallucinations finds critical or warning incidents (S5)
// ---------------------------------------------------------------------------

interface HallucinationAlertParams extends AlertBase {
  brandName: string;
  auditNumber: number | null;
  criticalCount: number;
  warningCount: number;
  reviewUrl: string;
}

export async function sendHallucinationAlert({
  organizationId,
  idempotencyBase,
  ...content
}: HallucinationAlertParams) {
  return sendAlert("hallucination", {
    organizationId,
    idempotencyBase,
    email: hallucinationAlertEmail(content),
  });
}

// ---------------------------------------------------------------------------
// 2. Drift Alert -- emailOnDrift (default on). No caller sends it yet.
// ---------------------------------------------------------------------------

interface DriftAlertParams extends AlertBase {
  brandName: string;
  dimension: string;
  scoreBefore: number;
  scoreAfter: number;
  auditUrl: string;
}

export async function sendDriftAlert({
  organizationId,
  idempotencyBase,
  ...content
}: DriftAlertParams) {
  return sendAlert("drift", { organizationId, idempotencyBase, email: driftAlertEmail(content) });
}

// ---------------------------------------------------------------------------
// 3. Consensus Alert -- emailOnConsensus (default off)
//    Trigger: consistency_score < 60 (S5); the check itself is switched
//    off until it's real (inngest/functions/check-cross-platform-consensus.ts)
// ---------------------------------------------------------------------------

interface ConsensusAlertParams extends AlertBase {
  brandName: string;
  sourceType: string;
  discrepancyDetails: string;
  consensusUrl: string;
}

export async function sendConsensusAlert({
  organizationId,
  idempotencyBase,
  ...content
}: ConsensusAlertParams) {
  return sendAlert("consensus", {
    organizationId,
    idempotencyBase,
    email: consensusAlertEmail(content),
  });
}

// ---------------------------------------------------------------------------
// 4. Schedule Needs Confirmation -- emailOnScheduleFailure (default on)
//    Trigger: inngest/functions/audit-schedules-cron.ts pauses a
//    schedule on the transition INTO 'needs_confirmation' only -- the
//    cron's own WHERE status = 'active' filter means this fires once
//    per pause, never once per missed night.
// ---------------------------------------------------------------------------

interface ScheduleNeedsConfirmationAlertParams extends AlertBase {
  brandName: string;
  confirmUrl: string;
}

export async function sendScheduleNeedsConfirmationAlert({
  organizationId,
  idempotencyBase,
  ...content
}: ScheduleNeedsConfirmationAlertParams) {
  return sendAlert("schedule_failure", {
    organizationId,
    idempotencyBase,
    email: scheduleNeedsConfirmationEmail(content),
  });
}

// ---------------------------------------------------------------------------
// 4b. Prompt Pack Generation Failed -- emailOnScheduleFailure, same switch
//    as #4: the owner cares about the same thing either way ("an audit
//    couldn't run for this brand, go look at its details").
//    Trigger: lib/audit/get-audit-prompts.ts, right before it throws
//    PromptPackGenerationError -- the ONE place every audit runner
//    funnels through, so no caller has to remember to send it itself.
// ---------------------------------------------------------------------------

interface PromptPackGenerationFailedAlertParams extends AlertBase {
  brandName: string;
  brandUrl: string;
}

export async function sendPromptPackGenerationFailedAlert({
  organizationId,
  idempotencyBase,
  ...content
}: PromptPackGenerationFailedAlertParams) {
  return sendAlert("schedule_failure", {
    organizationId,
    idempotencyBase,
    email: promptPackGenerationFailedEmail(content),
  });
}

// ---------------------------------------------------------------------------
// 5. Volatility Alert -- emailOnVolatility (default off). No caller sends it yet.
// ---------------------------------------------------------------------------

interface VolatilityAlertParams extends AlertBase {
  brandName: string;
  currentScore: number;
  trend: string;
  recommendedAction: string;
}

export async function sendVolatilityAlert({
  organizationId,
  idempotencyBase,
  ...content
}: VolatilityAlertParams) {
  return sendAlert("volatility", {
    organizationId,
    idempotencyBase,
    email: volatilityAlertEmail(content),
  });
}
