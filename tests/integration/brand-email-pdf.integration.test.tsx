/**
 * Rebrand (15 Nov), part 1 -- the emails and the report PDF say Vunnara: the sender a recipient sees, the
 * email's header (the mark and the name) and footer, and the PDF's running header, cover and closing line.
 *
 * S03 part 0 (LLD amendment 77): moved from tests/unit/brand/brand-email-pdf.test.tsx; the PDF is an invented business
 * seeded as real audits and rendered by the real path (tests/helpers/seeded-report-data.ts), no longer hand-composed
 * report data.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { describe, expect, it, vi } from "vitest";
import { BRAND_COLORS, BRAND_MARK, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import { checkFromAddress } from "@/lib/email/send";
import { auditCompleteEmail } from "@/lib/email/templates/audit-complete";
import { passwordResetEmail } from "@/lib/email/templates/auth";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { IRONSTONE_ALL_ENGINES, seededReportData } from "@/tests/helpers/seeded-report-data";

const report = seededReportData({ allEngines: IRONSTONE_ALL_ENGINES });

const OLD_NAME = /visible[\s_.-]?au/i;

describe("an email", () => {
  const audit = auditCompleteEmail({
    brandName: "Hero Plumbing",
    auditNumber: 50,
    mentionRate: 30,
    mentionedCount: 3,
    sampleCount: 10,
    completedAt: null,
    auditUrl: "https://vunnara.com.au/audits/1",
  });

  it("opens with the mark (the blue cell with the white letter) and the product's name", () => {
    const header = audit.html.slice(audit.html.indexOf("data-brand-mark") - 200);
    expect(audit.html).toContain("data-brand-mark");
    expect(header).toContain(`background:${BRAND_COLORS.mark}`);
    expect(header).toContain(`color:${BRAND_COLORS.markFg}`);
    expect(header).toMatch(new RegExp(`>${BRAND_MARK.letter}</td><td[^>]*>${PRODUCT_NAME}</td>`));
  });

  it("closes with the product and its line, and never names the old product (a notification and a transactional one)", () => {
    for (const email of [
      audit,
      passwordResetEmail({ url: "https://vunnara.com.au/r/x", expiresInMinutes: 60 }),
    ]) {
      expect(email.html).toContain(`${PRODUCT_NAME} · ${PRODUCT_TAGLINE}`);
      expect(email.text.split("\n")[0]).toBe(PRODUCT_NAME);
      expect(email.html).not.toMatch(OLD_NAME);
      expect(email.text).not.toMatch(OLD_NAME);
      expect(email.subject).not.toMatch(OLD_NAME);
    }
  });

  it("comes from Vunnara whatever display name RESEND_FROM_EMAIL carries", () => {
    expect(checkFromAddress("VisibleAU <audits@vunnara.com.au>")).toEqual({
      ok: true,
      from: "Vunnara <audits@vunnara.com.au>",
    });
    expect(checkFromAddress("audits@vunnara.com.au")).toEqual({
      ok: true,
      from: "Vunnara <audits@vunnara.com.au>",
    });
    // A name that already says Vunnara is kept.
    expect(checkFromAddress("Vunnara Audits <audits@vunnara.com.au>")).toEqual({
      ok: true,
      from: "Vunnara Audits <audits@vunnara.com.au>",
    });
    // The other checks still hold: the domain, and nothing shaped like a key.
    expect(checkFromAddress("Vunnara <audits@example.com>")).toEqual({
      ok: false,
      reason: "from_domain",
    });
  });

  it("the dev fallback sender says Vunnara too", () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const dev = checkFromAddress(undefined);
      expect(dev.ok && dev.from.startsWith(PRODUCT_NAME)).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("the report PDF", () => {
  it("every page's running header and the cover say Vunnara, and no page names the old product", () => {
    const pages = collectPdfPages(<ReportDocument data={report("allEngines")} />);
    expect(pages.length).toBe(7);
    const text = pages.flat().join("\n");
    // The cover's top bar: "Powered by" beside the mark and the name.
    expect(pages[0]).toContain("Powered by");
    expect(pages[0]).toContain(PRODUCT_NAME);
    // Every other page's running header.
    for (const [i, page] of pages.entries()) expect(page, `page ${i + 1}`).toContain(PRODUCT_NAME);
    expect(text).toContain(`by ${PRODUCT_NAME}`);
    expect(text).not.toMatch(OLD_NAME);
  });
});
