/**
 * S01C part 5a (LLD amendment 64): "Report PDFs download, open from the portal and attach to emails as '{Brand} – AI
 * Visibility Report ({Tier name}) – Week {w} {yyyy}.pdf' (no tier with report_v2 off), not a UUID", sent through
 * Content-Disposition with an ASCII fallback and filename*.
 */
import { describe, expect, it } from "vitest";
import {
  asciiFileName,
  reportContentDisposition,
  reportFileName,
} from "@/lib/communication/report-file-name";

describe("reportFileName", () => {
  it("a report with a tier: brand, tier name and week", () => {
    expect(
      reportFileName({
        brandName: "Waratah Home Services",
        tierName: "Enhanced",
        periodLabel: "2026-W47",
      }),
    ).toBe("Waratah Home Services – AI Visibility Report (Enhanced) – Week 47 2026.pdf");
  });

  it("an agency's own tier name", () => {
    expect(
      reportFileName({
        brandName: "Bluegum Home Services",
        tierName: "Premium Audit",
        periodLabel: "2026-W05",
      }),
    ).toBe("Bluegum Home Services – AI Visibility Report (Premium Audit) – Week 5 2026.pdf");
  });

  it("report_v2 off: no tier", () => {
    expect(
      reportFileName({
        brandName: "Ironstone Property Services",
        tierName: null,
        periodLabel: "2026-W47",
      }),
    ).toBe("Ironstone Property Services – AI Visibility Report – Week 47 2026.pdf");
  });

  it("a monthly report names its month", () => {
    expect(
      reportFileName({
        brandName: "Kurrajong IT Solutions",
        tierName: "Basic",
        periodLabel: "2026-11",
      }),
    ).toBe("Kurrajong IT Solutions – AI Visibility Report (Basic) – November 2026.pdf");
  });

  it("characters a file name can't hold become spaces", () => {
    expect(
      reportFileName({ brandName: "A/B: Plumbing", tierName: null, periodLabel: "2026-W47" }),
    ).toBe("A B Plumbing – AI Visibility Report – Week 47 2026.pdf");
  });
});

describe("Content-Disposition", () => {
  const name = "Café Ōtaki Services – AI Visibility Report (Enhanced) – Week 47 2026.pdf";

  it("the ASCII fallback: hyphens for dashes, no accents, no quotes", () => {
    expect(asciiFileName(name)).toBe(
      "Cafe Otaki Services - AI Visibility Report (Enhanced) - Week 47 2026.pdf",
    );
    expect(asciiFileName('Say "hi" \\ there')).toBe("Say hi there");
  });

  it("attachment, the ASCII name, then the UTF-8 name as filename*", () => {
    const header = reportContentDisposition(name);
    expect(header).toBe(
      `attachment; filename="Cafe Otaki Services - AI Visibility Report (Enhanced) - Week 47 2026.pdf"; filename*=UTF-8''Caf%C3%A9%20%C5%8Ctaki%20Services%20%E2%80%93%20AI%20Visibility%20Report%20%28Enhanced%29%20%E2%80%93%20Week%2047%202026.pdf`,
    );
    expect(decodeURIComponent(header.split("UTF-8''")[1])).toBe(name);
    expect(header).toMatch(/^[\x20-\x7e]+$/);
  });
});
