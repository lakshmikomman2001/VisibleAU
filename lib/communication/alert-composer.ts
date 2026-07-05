import { eq } from "drizzle-orm";
import { resend } from "@/lib/email/client";
import { notificationPreferences } from "@/db/schema";
import { serviceDb } from "@/db/client";
import { buildHallucinationAlertHtml } from "@/lib/email/templates/alerts/hallucination";
import { buildDriftAlertHtml } from "@/lib/email/templates/alerts/drift";
import { buildConsensusAlertHtml } from "@/lib/email/templates/alerts/consensus";
import { buildVolatilityAlertHtml } from "@/lib/email/templates/alerts/volatility";

const FROM = "noreply@visibleau.com";

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

// ---------------------------------------------------------------------------
// 1. Hallucination Alert
//    Gate: COALESCE(emailOnHallucination, true) = true
//    Trigger: detect-hallucinations creates severity='critical' incident (S5)
// ---------------------------------------------------------------------------

interface HallucinationAlertParams {
  organizationId: string;
  brandName: string;
  engine: string;
  incorrectClaim: string;
  correctValue: string;
  acknowledgeUrl: string;
}

export async function sendHallucinationAlert({
  organizationId,
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

  return resend.emails.send({ from: FROM, to: email, subject, html });
}

// ---------------------------------------------------------------------------
// 2. Drift Alert
//    Gate: emailOnDrift = true
//    Trigger: 'drift/detected' event (Phase 1 Sprint 8)
// ---------------------------------------------------------------------------

interface DriftAlertParams {
  organizationId: string;
  brandName: string;
  dimension: string;
  scoreBefore: number;
  scoreAfter: number;
  auditUrl: string;
}

export async function sendDriftAlert({
  organizationId,
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

  return resend.emails.send({ from: FROM, to: email, subject, html });
}

// ---------------------------------------------------------------------------
// 3. Consensus Alert
//    Gate: COALESCE(emailOnConsensus, false) = true
//    Trigger: consistency_score < 60 (S5)
// ---------------------------------------------------------------------------

interface ConsensusAlertParams {
  organizationId: string;
  brandName: string;
  sourceType: string;
  discrepancyDetails: string;
  consensusUrl: string;
}

export async function sendConsensusAlert({
  organizationId,
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

  return resend.emails.send({ from: FROM, to: email, subject, html });
}

// ---------------------------------------------------------------------------
// 4. Volatility Alert
//    Gate: COALESCE(emailOnVolatility, false) = true
//    Trigger: citation_volatility_score > 15.0 (S3)
// ---------------------------------------------------------------------------

interface VolatilityAlertParams {
  organizationId: string;
  brandName: string;
  currentScore: number;
  trend: string;
  recommendedAction: string;
}

export async function sendVolatilityAlert({
  organizationId,
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

  return resend.emails.send({ from: FROM, to: email, subject, html });
}
