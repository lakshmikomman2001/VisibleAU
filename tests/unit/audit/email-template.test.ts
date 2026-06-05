import { describe, expect, it } from "vitest";
import { renderAuditCompleteEmail } from "@/lib/email/templates/audit-complete";

describe("renderAuditCompleteEmail", () => {
  it("renders HTML with brand name and score", () => {
    const html = renderAuditCompleteEmail({
      brandName: "Bondi Plumbing",
      auditNumber: 1,
      compositeScore: 70.5,
      auditResultsUrl: "http://localhost:3000/audits/abc",
      promptCount: 10,
      engine: "chatgpt",
    });
    expect(html).toContain("Bondi Plumbing");
    expect(html).toContain("70.5/100");
    expect(html).toContain("Audit #1");
    expect(html).toContain("http://localhost:3000/audits/abc");
  });

  it("shows Calculating when score is null", () => {
    const html = renderAuditCompleteEmail({
      brandName: "Test",
      auditNumber: 2,
      compositeScore: null,
      auditResultsUrl: "http://localhost:3000/audits/xyz",
      promptCount: 10,
      engine: "chatgpt",
    });
    expect(html).toContain("Calculating");
  });

  it("returns valid HTML document", () => {
    const html = renderAuditCompleteEmail({
      brandName: "X",
      auditNumber: 1,
      compositeScore: 50,
      auditResultsUrl: "/",
      promptCount: 10,
      engine: "chatgpt",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });
});
