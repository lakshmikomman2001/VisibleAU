/**
 * Task 15, item 4 -- every email template, HTML and text, as snapshots,
 * plus the rules they all share: notification emails link to the
 * notification settings (in both versions), transactional ones don't;
 * the page is accessible (lang, title, headings); content is escaped;
 * no "undefined", "NaN" or "null" ever reaches a real email; dates are
 * Sydney time.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { consensusAlertEmail } from "@/lib/email/templates/alerts/consensus";
import { driftAlertEmail } from "@/lib/email/templates/alerts/drift";
import { hallucinationAlertEmail } from "@/lib/email/templates/alerts/hallucination";
import { promptPackGenerationFailedEmail } from "@/lib/email/templates/alerts/prompt-pack-generation-failed";
import { scheduleNeedsConfirmationEmail } from "@/lib/email/templates/alerts/schedule-needs-confirmation";
import { volatilityAlertEmail } from "@/lib/email/templates/alerts/volatility";
import { auditCompleteEmail } from "@/lib/email/templates/audit-complete";
import {
  emailVerificationEmail,
  passwordResetEmail,
  teamInviteEmail,
} from "@/lib/email/templates/auth";
import { escapeHtml, type RenderedEmail } from "@/lib/email/templates/layout";
import { scheduledReportEmail } from "@/lib/email/templates/scheduled-report";
import { weeklyDigestEmail } from "@/lib/email/templates/weekly-digest";

const APP = "https://app.vunnara.com.au";
const SETTINGS = `${APP}/settings/notifications`;
// 04:42 UTC on 25 Oct 2026 is 3:42 PM in Sydney (AEDT, UTC+11).
const SYDNEY_AFTERNOON = new Date("2026-10-25T04:42:00Z");

// At module level: the emails below are rendered while the tests are collected.
vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
afterAll(() => vi.unstubAllEnvs());

function notificationEmails(): Record<string, RenderedEmail> {
  return {
    auditComplete: auditCompleteEmail({
      brandName: "Omega Services",
      auditNumber: 36,
      mentionRate: 7.5,
      mentionedCount: 3,
      sampleCount: 40,
      completedAt: SYDNEY_AFTERNOON,
      auditUrl: `${APP}/audits/a1`,
    }),
    scheduledReport: scheduledReportEmail({
      brandName: "Omega Services",
      frequency: "monthly",
      periodLabel: "October 2026",
      audit: { auditNumber: 36, mentionRate: 7.5, mentionedCount: 3, sampleCount: 40 },
      reportUrl: `${APP}/brands/b1/reports/r1`,
      pdfUrl: "https://files.example.com/signed/r1.pdf?token=abc",
      pdfLinkDays: 7,
      schedulesUrl: `${APP}/organizations/o1/delivery-schedules`,
    }),
    weeklyDigest: weeklyDigestEmail({
      date: SYDNEY_AFTERNOON,
      brands: [
        { brandName: "Omega Services", mentionRate: 7.5, mentionedCount: 3, sampleCount: 40 },
        { brandName: "Delta Plumbing", mentionRate: null, mentionedCount: 0, sampleCount: 0 },
      ],
    }),
    hallucination: hallucinationAlertEmail({
      brandName: "Omega Services",
      auditNumber: 36,
      criticalCount: 1,
      warningCount: 2,
      reviewUrl: `${APP}/brands/b1/trust/hallucinations`,
    }),
    scheduleNeedsConfirmation: scheduleNeedsConfirmationEmail({
      brandName: "Omega Services",
      confirmUrl: `${APP}/brands/b1#confirm-business-details`,
    }),
    promptPackFailed: promptPackGenerationFailedEmail({
      brandName: "Omega Services",
      brandUrl: `${APP}/brands/b1`,
    }),
    consensus: consensusAlertEmail({
      brandName: "Omega Services",
      sourceType: "google_business, yelp",
      discrepancyDetails: "Average consistency score is 52/100 across 4 sources.",
      consensusUrl: `${APP}/brands/b1/trust/consensus`,
    }),
    drift: driftAlertEmail({
      brandName: "Omega Services",
      dimension: "Visibility",
      scoreBefore: 20,
      scoreAfter: 8,
      auditUrl: `${APP}/audits/a1`,
    }),
    volatility: volatilityAlertEmail({
      brandName: "Omega Services",
      currentScore: 18.4,
      trend: "Three of the five most-cited sources changed since last month.",
      recommendedAction: "Keep your directory listings up to date.",
    }),
  };
}

function transactionalEmails(): Record<string, RenderedEmail> {
  return {
    passwordReset: passwordResetEmail({
      url: `${APP}/api/auth/reset-password/tok123?callbackURL=%2Freset-password`,
      expiresInMinutes: 60,
    }),
    emailVerification: emailVerificationEmail({
      url: `${APP}/api/auth/verify-email?token=tok456&callbackURL=%2Fdashboard`,
    }),
    teamInvite: teamInviteEmail({
      inviterName: "Sri",
      orgName: "Vunnara Agency",
      role: "admin",
      acceptUrl: `${APP}/invite/accept?org=o1&token=tok789`,
      expiresAt: SYDNEY_AFTERNOON,
    }),
  };
}

describe("every notification email links to the notification settings", () => {
  for (const [name, email] of Object.entries(notificationEmails())) {
    it(`${name}: in the HTML and the text`, () => {
      expect(email.html).toContain(`href="${SETTINGS}"`);
      expect(email.text).toContain(`Notification settings: ${SETTINGS}`);
    });
  }
});

describe("transactional emails don't (they say why they came instead)", () => {
  for (const [name, email] of Object.entries(transactionalEmails())) {
    it(name, () => {
      expect(email.html).not.toContain(SETTINGS);
      expect(email.text).not.toContain(SETTINGS);
    });
  }
});

describe("every email", () => {
  const all = { ...notificationEmails(), ...transactionalEmails() };
  for (const [name, email] of Object.entries(all)) {
    it(`${name}: accessible HTML, a text version, nothing made up`, () => {
      expect(email.html).toMatch(/^<!DOCTYPE html>\n<html lang="en-AU">/);
      expect(email.html).toContain(`<title>${escapeHtml(email.subject)}</title>`);
      expect(email.html).toMatch(/<h1 /);
      expect(email.html).not.toMatch(/<img /);
      expect(email.text.startsWith("Vunnara\n")).toBe(true);
      for (const version of [email.subject, email.html, email.text]) {
        expect(version).not.toMatch(/\bundefined\b|\bNaN\b|\bnull\b/);
      }
    });
  }
});

describe("details", () => {
  it("escapes anything that comes from the database", () => {
    const email = scheduleNeedsConfirmationEmail({
      brandName: `<script>alert("x")</script> & Co`,
      confirmUrl: `${APP}/brands/b1`,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co");
  });

  it("the invite's expiry is Sydney time", () => {
    expect(transactionalEmails().teamInvite.text).toContain(
      "The invitation expires 25 Oct 2026, 3:42 PM (Sydney time).",
    );
  });

  it("the digest says 'No successful answers yet', never 0%", () => {
    const { text } = notificationEmails().weeklyDigest;
    expect(text).toContain("- Omega Services: 8% · 3 of 40 answers");
    expect(text).toContain("- Delta Plumbing: No successful answers yet");
  });

  it("the scheduled report shows only the audit's real headline, nothing it can't back up", () => {
    const withAudit = notificationEmails().scheduledReport;
    expect(withAudit.text).toContain("Visibility 8% · mentioned in 3 of 40 answers");
    const noAudit = scheduledReportEmail({
      brandName: "Omega Services",
      frequency: "weekly",
      periodLabel: null,
      audit: null,
      reportUrl: `${APP}/brands/b1/reports/r1`,
      pdfUrl: null,
      pdfLinkDays: 7,
      schedulesUrl: `${APP}/organizations/o1/delivery-schedules`,
    });
    expect(noAudit.text).not.toMatch(/Visibility|%|pts/);
    expect(noAudit.text).not.toContain("Download the PDF");
  });
});

describe("snapshots (HTML and text)", () => {
  const all = { ...notificationEmails(), ...transactionalEmails() };
  for (const [name, email] of Object.entries(all)) {
    it(name, () => {
      expect(email).toMatchSnapshot();
    });
  }
});
