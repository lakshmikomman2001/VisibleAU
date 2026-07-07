import { describe, expect, it } from "vitest";
import { buildMentionSourceSection, formatRatio } from "@/lib/communication/format-helpers";

describe("buildMentionSourceSection (regression: bug 8 — was duplicating exec summary)", () => {
  const ARCHETYPES = [
    { key: "recognised_authority", label: "recognised authority", action: "maintain and defend" },
    { key: "known_but_untrusted", label: "known but untrusted", action: "fix content structure" },
    { key: "niche_authority", label: "niche authority", action: "expand prompt coverage" },
    { key: "invisible", label: "invisible", action: "full GEO strategy" },
  ];

  it.each(ARCHETYPES)(
    "$key → contains '$label' + '$action'",
    ({ key, label, action }) => {
      const s = buildMentionSourceSection(key, 1.5);
      expect(s).toContain(label);
      expect(s).toContain(action);
    },
  );

  it("unknown archetype falls back to invisible, no throw", () => {
    expect(() => buildMentionSourceSection("bogus_archetype", null)).not.toThrow();
    expect(buildMentionSourceSection("bogus_archetype", null)).toContain("full GEO strategy");
    expect(buildMentionSourceSection("bogus_archetype", null)).toContain("invisible");
  });

  it("null ratio renders N/A in the output", () => {
    const s = buildMentionSourceSection("invisible", null);
    expect(s).toContain("N/A");
  });

  it("real ratio renders as 2dp number", () => {
    const s = buildMentionSourceSection("recognised_authority", 1.5);
    expect(s).toContain("1.50");
  });

  it("is structurally distinct from exec summary — contains 'quadrant' + 'Priority:'", () => {
    const s = buildMentionSourceSection("niche_authority", 1.0);
    expect(s).toContain("quadrant");
    expect(s).toContain("Priority:");
  });

  it("mention-source summary is NOT byte-identical to a generic exec summary pattern", () => {
    const mentionSection = buildMentionSourceSection("recognised_authority", 2.0);
    expect(mentionSection).toContain("quadrant");
    expect(mentionSection).toContain("Mention-to-citation ratio:");
    expect(mentionSection).toContain("Priority:");
  });

  it("each archetype produces a unique output (no duplication)", () => {
    const outputs = ARCHETYPES.map((a) => buildMentionSourceSection(a.key, 1.0));
    const unique = new Set(outputs);
    expect(unique.size).toBe(ARCHETYPES.length);
  });

  it("ratio ties to formatRatio: null → same N/A string", () => {
    const s = buildMentionSourceSection("invisible", null);
    expect(s).toContain(formatRatio(null));
  });

  it("ratio ties to formatRatio: number → same 2dp string", () => {
    const s = buildMentionSourceSection("niche_authority", 3.14159);
    expect(s).toContain(formatRatio(3.14159));
  });
});
