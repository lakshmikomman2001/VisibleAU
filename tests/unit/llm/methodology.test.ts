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
  it("new audits run under version 4, shown as web-grounded (v2.2)", () => {
    // Methodology v2.2 (Sri's decision, 7 Nov): one version for the Gemini model, the output limit and
    // comparing the same models only.
    expect(METHODOLOGY_VERSION).toBe(4);
    expect(methodologyLabel(4)).toBe("web-grounded (v2.2)");
    expect(methodologyLabel(3)).toBe("web-grounded (v2.1)");
    expect(methodologyLabel(2)).toBe("web-grounded (v2)");
    expect(methodologyLabel(null)).toBe("memory-only (v1)");
  });

  it("the change label names what changed and the first audit's Sydney date", () => {
    // 6 Nov, 11 pm UTC is already 7 Nov in Sydney.
    const firstAudit = new Date("2026-11-06T23:00:00.000Z");
    expect(methodologyChangeNote(2, 3, firstAudit)).toBe("Detection improved on 7 Nov 2026");
    // One note for v2.2's three changes, never three.
    expect(methodologyChangeNote(3, 4, new Date("2026-11-30T23:00:00.000Z"))).toBe(
      "Detection updated on 1 Dec 2026",
    );
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

  it("v2.2: the Gemini model, the answer length limit, and only the same models compared", async () => {
    const Page = (await import("@/app/(marketing)/methodology/page")).default;
    const html = renderToStaticMarkup(await Page())
      .replace(/\s+/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"');

    expect(html).toContain(`detection updated — ${methodologyLabel(4)}`);
    expect(html).toContain("Gemini 3.5 Flash-Lite");
    expect(html).toContain("8,192 tokens");
    expect(html).toContain(
      "compared only with audits that asked the same engines for the same models",
    );
    expect(html).toContain('marked "Detection updated on"');
  });

  it("from 7 Nov, share of voice uses verified mentions on both sides (no new version)", async () => {
    const Page = (await import("@/app/(marketing)/methodology/page")).default;
    const html = renderToStaticMarkup(await Page())
      .replace(/\s+/g, " ")
      .replace(/&#x27;/g, "'");

    expect(html).toContain(
      "From 7 November 2026, share of voice uses verified mentions on both sides.",
    );
    expect(html).toContain("is among the sources the answer cited");
    expect(html).toContain("applies to earlier audits too");
  });
});
