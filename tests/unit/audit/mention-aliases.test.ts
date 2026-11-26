/**
 * S00 part 4 (22 Nov; LLD 8.8.2, N3): mention detection and the branded-question rule read a brand's aliases with
 * its name, through the same patterns (lib/brands/normalize.ts brandNamePattern, detect-mention.ts
 * spacingFreeNamePattern).
 *
 * N3 (existing audits' figures unchanged): a stored audit's mentions are never detected again -- the two read-time
 * recomputes (ranks only) still pass the name and domain alone -- and for every existing brand (aliases '{}')
 * detection with aliases [] is exactly detection without them. The audits #50, #51, #54 and #55 answers are
 * production data (not in the repo), so the identity is proven over answers written the way those engines answer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";

const NUMBATEK = { name: "NumbaTek IT", domain: "numbatekit.com.au" };

describe("NumbaTek IT is found however an answer writes it", () => {
  it('"NumbaTek IT" and "NumbaTekIT" (the name, with its spacing ignored) -- no alias needed', async () => {
    for (const text of [
      "1. **NumbaTek IT** -- managed IT for Western Sydney businesses.",
      "Many reviewers recommend NumbaTekIT for Microsoft 365 support.",
      "Numbatek IT is a smaller provider.",
    ]) {
      const m = await detectBrandMention(text, NUMBATEK);
      expect(m.found, text).toBe(true);
      expect(m.detectionMethod).toBe("regex");
    }
  });

  it('"numbatekit" (the domain label) is found too, as before', async () => {
    const m = await detectBrandMention("See numbatekit.com.au for details.", NUMBATEK);
    expect(m.found).toBe(true);
  });

  it("an alias that is a different name counts only once it's listed", async () => {
    const text = "Quollen Group runs a well-reviewed IT support desk in Riverstone.";
    expect((await detectBrandMention(text, NUMBATEK)).found).toBe(false);
    const withAlias = await detectBrandMention(text, { ...NUMBATEK, aliases: ["Quollen Group"] });
    expect(withAlias).toMatchObject({ found: true, detectionMethod: "regex", confidence: "high" });
    expect(withAlias.matchIndex).toBe(0);
  });

  it("the earliest of the name and its aliases counts (the rank is that position's)", async () => {
    const text = "Top picks:\n1. Quollen Group\n2. Someone Else\n3. NumbaTek IT";
    const m = await detectBrandMention(text, { ...NUMBATEK, aliases: ["Quollen Group"] });
    expect(m.matchIndex).toBe(text.indexOf("Quollen Group"));
  });
});

describe("the branded-question rule reads aliases too", () => {
  it("a question naming the business by an alias names the business", () => {
    const q = "Is Quollen Group a good choice for managed IT services in Riverstone?";
    expect(isBrandedPrompt(q, NUMBATEK)).toBe(false);
    expect(isBrandedPrompt(q, { ...NUMBATEK, aliases: ["Quollen Group"] })).toBe(true);
  });

  it("an everyday question stays everyday", () => {
    const q = "Best managed IT services in Riverstone?";
    expect(isBrandedPrompt(q, { ...NUMBATEK, aliases: ["numbatekit", "NumbaTekIT"] })).toBe(false);
  });
});

/** Answers written the way the engines answer (lists, bold, possessives, near-misses, the domain). */
const ANSWERS = [
  "Here are some options:\n1. **Wren Home Services** (Yennora-based) -- handyman work.\n2. Fixit Bros.",
  "Wren-Home-Services is often recommended for small repairs.",
  "I couldn't find information about a business called Wren Home Services.",
  "Yabby Services' plumbers cover Norwest.",
  "**Omega** Services is listed on hipages.",
  "SuperYabby Services is a different company.",
  "Visit yabby-services.com.au to book.",
  "Popular choices include Jim's Plumbing and Norwest Plumbing Co.",
  "",
];
const BRANDS = [
  { name: "Wren Home Services", domain: "wrenhomeservices.com.au" },
  { name: "wrenhomeservices", domain: "wrenhomeservices.com.au" },
  { name: "Yabby Services", domain: "yabby-services.com.au" },
  { name: "Omega", domain: "omega.com.au" },
];

describe("N3: for a brand without aliases (every existing brand), nothing it detects or types changes", () => {
  it("detection with aliases [] is detection without them, answer by answer", async () => {
    for (const brand of BRANDS)
      for (const text of ANSWERS) {
        const before = await detectBrandMention(text, brand);
        const after = await detectBrandMention(text, { ...brand, aliases: [] });
        expect(after, `${brand.name}: ${text}`).toEqual(before);
      }
  });

  it("the branded rule with aliases [] is the rule without them", () => {
    for (const brand of BRANDS)
      for (const q of [
        "Is Wren Home Services a good choice for a handyman in Yennora?",
        "Best handyman in Yennora?",
        "Is Yabby Services popular in Norwest?",
        "Tell me about yabby-services.com.au",
      ])
        expect(isBrandedPrompt(q, { ...brand, aliases: [] })).toBe(isBrandedPrompt(q, brand));
  });

  it("the read-time recomputes (ranks of stored mentions) still pass the name and domain alone", () => {
    const root = resolve(__dirname, "../../..");
    for (const file of [
      "lib/scoring/resolve-audit-dimensions.ts",
      "lib/audit/recompute-citation-positions.ts",
    ]) {
      const code = readFileSync(resolve(root, file), "utf8");
      expect(code, file).toContain("detectBrandMention(");
      expect(code, file).not.toMatch(/aliases/);
    }
  });
});
