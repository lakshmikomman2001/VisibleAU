/**
 * "Mention detection" (6 Nov), part 6 -- methodology version 3, shown as web-grounded (v2.1), and the label
 * a trend carries where it crosses into a newer methodology. The public Methodology page says what changed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  METHODOLOGY_VERSION,
  methodologyChangeNote,
  methodologyLabel,
} from "@/lib/llm/methodology";

describe("methodology versions", () => {
  it("new audits run under version 3, shown as web-grounded (v2.1)", () => {
    expect(METHODOLOGY_VERSION).toBe(3);
    expect(methodologyLabel(3)).toBe("web-grounded (v2.1)");
    expect(methodologyLabel(2)).toBe("web-grounded (v2)");
    expect(methodologyLabel(null)).toBe("memory-only (v1)");
  });

  it("the change label names what changed and the first audit's Sydney date", () => {
    // 6 Nov, 11 pm UTC is already 7 Nov in Sydney.
    const firstAudit = new Date("2026-11-06T23:00:00.000Z");
    expect(methodologyChangeNote(2, 3, firstAudit)).toBe("Detection improved on 7 Nov 2026");
    expect(methodologyChangeNote(1, 2, firstAudit)).toBe("Web search added on 7 Nov 2026");
  });

  it("no label without a change, or when either side's version is unknown", () => {
    const at = new Date("2026-11-06T23:00:00.000Z");
    expect(methodologyChangeNote(3, 3, at)).toBeNull();
    expect(methodologyChangeNote(null, 3, at)).toBeNull();
    expect(methodologyChangeNote(2, undefined, at)).toBeNull();
  });
});

describe("the Methodology page says what changed", () => {
  it("a 'What changed' note for the improved detection, and that earlier audits aren't compared", async () => {
    const Page = (await import("@/app/(marketing)/methodology/page")).default;
    const html = renderToStaticMarkup(await Page()).replace(/\s+/g, " ");

    expect(html).toContain("What changed");
    // Decision 3 (6 Nov): the label is methodologyLabel(3)'s, not spelled out on the page.
    expect(html).toContain(`detection improved — ${methodologyLabel(3)}`);
    expect(html).toContain("never compared with the ones after");
  });
});
