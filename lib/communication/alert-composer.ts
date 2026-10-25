import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { notificationPreferences } from "@/db/schema";
import { idempotencyKeyFor, type SendEmailResult, sendEmail } from "@/lib/email/send";
import { buildConsensusAlertHtml } from "@/lib/email/templates/alerts/consensus";
import { buildDriftAlertHtml } from "@/lib/email/templates/alerts/drift";
import { buildHallucinationAlertHtml } from "@/lib/email/templates/alerts/hallucination";
import { buildPromptPackGenerationFailedHtml } from "@/lib/email/templates/alerts/prompt-pack-generation-failed";
import { buildScheduleNeedsConfirmationHtml } from "@/lib/email/templates/alerts/schedule-needs-confirmation";
import { buildVolatilityAlertHtml } from "@/lib/email/templates/alerts/volatility";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getPrefs(organizationId: string) {
  const rows = await serviceDb
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

async function getDigestEmail(organizationId: string): Promise<string | null> {
  const prefs = await getPrefs(organizationId);
  return prefs?.digestEmail ?? null;
}

function sendAlert(a: {
  organizationId: string;
  idempotencyBase?: string;
  email: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: a.email,
    subject: a.subject,
    html: a.html,
    category: "alert",
    organizationId: a.organizationId,
    idempotencyKey: a.idempotencyBase ? idempotencyKeyFor(a.idempotencyBase, a.email) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 1. Hallucination Alert
//    Gate: COALESCE(emailOnHallucination, true) = true
//    Trigger: detect-hallucinations creates severity='critical' incident (S5)
// ---------------------------------------------------------------------------

interface HallucinationAlertParams {
  organizationId: string;
  /** Names this alert for its idempotency key -- set by every caller
   * that sends from an Inngest step, so a replay never sends twice. */
  idempotencyBase?: string;
  brandName: string;
  engine: string;
  incorrectClaim: string;
  correctValue: string;
  acknowledgeUrl: string;
}

export async function sendHallucinationAlert({
  organizationId,
  idempotencyBase,
  brandName,
  engine,
  incorrectClaim,
  correctValue,
  acknowledgeUrl,
}: HallucinationAlertParams) {
  const prefs = await getPrefs(organizationId);
  // COALESCE(emailOnHallucination, true) — default to true when null or no prefs
  if (prefs && prefs.emailOnHallucination === false) return null;

  const email = prefs?.digestEmail;
  if (!email) return null;

  const subject = `[${brandName}] AI Hallucination Detected — Immediate Review Needed`;
  const html = buildHallucinationAlertHtml({
    brandName,
    engine,
    incorrectClaim,
    correctValue,
    acknowledgeUrl,
  });

  return sendAlert({ organizationId, idempotencyBase, email, subject, html });
}

// ---------------------------------------------------------------------------
// 2. Drift Alert
//    Gate: emailOnDrift = true
//    Trigger: 'drift/detected' event (Phase 1 Sprint 8)
// ---------------------------------------------------------------------------

interface DriftAlertParams {
  organizationId: string;
  /** Names this alert for its idempotency key -- set by every caller
   * that sends from an Inngest step, so a replay never sends twice. */
  idempotencyBase?: string;
  brandName: string;
  dimension: string;
  scoreBefore: number;
  scoreAfter: number;
  auditUrl: string;
}

export async function sendDriftAlert({
  organizationId,
  idempotencyBase,
  brandName,
  dimension,
  scoreBefore,
  scoreAfter,
  auditUrl,
}: DriftAlertParams) {
  const prefs = await getPrefs(organizationId);
  if (!prefs || prefs.emailOnDrift !== true) return null;

  const email = prefs.digestEmail;
  if (!email) return null;

  const subject = `[${brandName}] AI Visibility Drift Alert — ${dimension} dropped`;
  const html = buildDriftAlertHtml({
    brandName,
    dimension,
    scoreBefore,
    scoreAfter,
    auditUrl,
  });

  return sendAlert({ organizationId, idempotencyBase, email, subject, html });
}

// ---------------------------------------------------------------------------
// 3. Consensus Alert
//    Gate: COALESCE(emailOnConsensus, false) = true
//    Trigger: consistency_score < 60 (S5)
// ---------------------------------------------------------------------------

interface ConsensusAlertParams {
  organizationId: string;
  /** Names this alert for its idempotency key -- set by every caller
   * that sends from an Inngest step, so a replay never sends twice. */
  idempotencyBase?: string;
  brandName: string;
  sourceType: string;
  discrepancyDetails: string;
  consensusUrl: string;
}

export async function sendConsensusAlert({
  organizationId,
  idempotencyBase,
  brandName,
  sourceType,
  discrepancyDetails,
  consensusUrl,
}: ConsensusAlertParams) {
  const prefs = await getPrefs(organizationId);
  // COALESCE(emailOnConsensus, false) — default to false when null or no prefs
  if (!prefs || prefs.emailOnConsensus !== true) return null;

  const email = prefs.digestEmail;
  if (!email) return null;

  const subject = `[${brandName}] Brand Consistency Issue Detected — ${sourceType}`;
  const html = buildConsensusAlertHtml({
    brandName,
    sourceType,
    discrepancyDetails,
    consensusUrl,
  });

  return sendAlert({ organizationId, idempotencyBase, email, subject, html });
}

// ---------------------------------------------------------------------------
// 4. Schedule Needs Confirmation (Build 1 follow-up, entry-point check)
//    Gate: COALESCE(emailOnScheduleFailure, true) = true -- the one
//    existing preference flag meant for exactly this ("something is
//    wrong with your schedule"), previously stored but never wired to
//    a real send.
//    Trigger: inngest/functions/audit-schedules-cron.ts pauses a
//    schedule on the transition INTO 'needs_confirmation' only -- the
//    cron's own WHERE status = 'active' filter means this fires once
//    per pause, never once per missed night.
// ---------------------------------------------------------------------------

interface ScheduleNeedsConfirmationAlertParams {
  organizationId: string;
  /** Names this alert for its idempotency key -- set by every caller
   * that sends from an Inngest step, so a replay never sends twice. */
  idempotencyBase?: string;
  brandName: string;
  confirmUrl: string;
}

export async function sendScheduleNeedsConfirmationAlert({
  organizationId,
  idempotencyBase,
  brandName,
  confirmUrl,
}: ScheduleNeedsConfirmationAlertParams) {
  const prefs = await getPrefs(organizationId);
  // COALESCE(emailOnScheduleFailure, true) -- default to true when null
  // or no prefs, matching this column's own schema default.
  if (prefs && prefs.emailOnScheduleFailure === false) return null;

  const email = prefs?.digestEmail;
  if (!email) return null;

  const subject = `[${brandName}] Scheduled audits paused — confirm business details to resume`;
  const html = buildScheduleNeedsConfirmationHtml({ brandName, confirmUrl });

  return sendAlert({ organizationId, idempotencyBase, email, subject, html });
}

// ---------------------------------------------------------------------------
// 4b. Prompt Pack Generation Failed (Vunnara hotfix 3, item 4)
//    Gate: COALESCE(emailOnScheduleFailure, true) = true -- same flag as
//    #4 above. The owner cares about the same thing either way: "an
//    audit couldn't run for this brand, go look at its details" --
//    this doesn't warrant a second, near-identical preference column.
//    Trigger: lib/audit/get-audit-prompts.ts, right before it throws
//    PromptPackGenerationError -- the ONE place every caller (the
//    Inngest run-audit function, run-audit-inline.ts's half-dozen
//    callers) funnels through, so this fires exactly once per failed
//    attempt no matter which entry point triggered it, without each
//    caller having to remember to send it itself.
// ---------------------------------------------------------------------------

interface PromptPackGenerationFailedAlertParams {
  organizationId: string;
  /** Names this alert for its idempotency key -- set by every caller
   * that sends from an Inngest step, so a replay never sends twice. */
  idempotencyBase?: string;
  brandName: string;
  brandUrl: string;
}

export async function sendPromptPackGenerationFailedAlert({
  organizationId,
  idempotencyBase,
  brandName,
  brandUrl,
}: PromptPackGenerationFailedAlertParams) {
  const prefs = await getPrefs(organizationId);
  // COALESCE(emailOnScheduleFailure, true) -- default to true when null or no prefs
  if (prefs && prefs.emailOnScheduleFailure === false) return null;

  const email = prefs?.digestEmail;
  if (!email) return null;

  const subject = `[${brandName}] Audit not run — couldn't prepare its questions`;
  const html = buildPromptPackGenerationFailedHtml({ brandName, brandUrl });

  return sendAlert({ organizationId, idempotencyBase, email, subject, html });
}

// ---------------------------------------------------------------------------
// 5. Volatility Alert
//    Gate: COALESCE(emailOnVolatility, false) = true
//    Trigger: citation_volatility_score > 15.0 (S3)
// ---------------------------------------------------------------------------

interface VolatilityAlertParams {
  organizationId: string;
  /** Names this alert for its idempotency key -- set by every caller
   * that sends from an Inngest step, so a replay never sends twice. */
  idempotencyBase?: string;
  brandName: string;
  currentScore: number;
  trend: string;
  recommendedAction: string;
}

export async function sendVolatilityAlert({
  organizationId,
  idempotencyBase,
  brandName,
  currentScore,
  trend,
  recommendedAction,
}: VolatilityAlertParams) {
  const prefs = await getPrefs(organizationId);
  // COALESCE(emailOnVolatility, false) — default to false when null or no prefs
  if (!prefs || prefs.emailOnVolatility !== true) return null;

  const email = prefs.digestEmail;
  if (!email) return null;

  const subject = `[${brandName}] Citation Volatility Warning — Sources Changing Rapidly`;
  const html = buildVolatilityAlertHtml({
    brandName,
    currentScore,
    trend,
    recommendedAction,
  });

  return sendAlert({ organizationId, idempotencyBase, email, subject, html });
}
