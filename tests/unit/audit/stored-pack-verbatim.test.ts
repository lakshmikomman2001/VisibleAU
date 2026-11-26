/**
 * S00 part 3 (22 Nov; LLD 8.8.1, N1): the phrasing fixes write new questions only. A brand's stored pack is asked
 * exactly as stored, byte for byte and in its order, even when it still has NumbaTek IT's old wording
 * ("managed it services", "a managed it services"), and each question is typed branded or everyday by the real rule
 * (lib/audit/flag-branded-prompts.ts), as before.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ serviceDb: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({ brands: {}, verticalPackPrompts: {}, verticalPacks: {} }));
vi.mock("@/lib/brands/region-label", () => ({
  resolveRegionLabel: vi.fn(() => "Riverstone, NSW"),
}));
vi.mock("@/lib/prompts/regenerate-prompt-pack", () => ({ regeneratePromptPack: vi.fn() }));
// S02 part 3 (LLD 8.2.1: "If none, run today's logic unchanged"): these brands have no question set, so the stored
// pack is used as before; the set path is tests/integration/audit-prompts-from-set.integration.test.ts.
vi.mock("@/lib/questions/question-set-store", () => ({
  loadCurrentQuestionSet: vi.fn(async () => null),
}));
vi.mock("@/lib/communication/alert-composer", () => ({
  sendPromptPackGenerationFailedAlert: vi.fn(() => Promise.resolve(null)),
}));

import { getAuditPrompts } from "@/lib/audit/get-audit-prompts";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { regeneratePromptPack } from "@/lib/prompts/regenerate-prompt-pack";

/** A pack as stored before the fix, with the wording T3 reported, odd spacing and punctuation kept. */
const STORED = [
  "Best managed it services in Riverstone?",
  "Who's the most recommended managed it services in Riverstone?",
  "Top-rated managed it services in Riverstone on Google?",
  "Which managed it services in Riverstone has the best reviews?",
  "Most trusted managed it services in Riverstone?",
  "Affordable managed it services in Riverstone?",
  "Managed it services in Riverstone with good reviews?",
  "Best-value managed it services in Riverstone?",
  "Experienced managed it services in Riverstone?",
  "Highly rated managed it services near Riverstone?",
  "Is NumbaTek IT a good choice for a managed it services in Riverstone?",
  "What are the best alternatives to NumbaTek IT in Riverstone?",
  "Is NumbaTek IT popular in Riverstone?",
];

const BRAND = {
  id: "brand-numbatek",
  promptPack: STORED,
  promptPackGeneratorVersion: PROMPT_GENERATOR_VERSION,
  classification: {
    category: "general",
    buyerType: "smb",
    audience: "businesses",
    confidence: 0.82,
    intentSignals: [],
    competitors: [],
    auRelevance: "au_founded",
    service: "managed it services",
  },
  classificationStatus: "complete",
  categoryConfirmedAt: new Date(),
  locationConfirmedAt: new Date(),
  locationMode: "fixed",
  competitors: [],
  categories: ["general"],
  audience: "businesses",
  name: "NumbaTek IT",
  domain: "numbatekit.com.au",
  suburb: "Riverstone",
  state: "NSW",
};

describe("a stored pack is asked exactly as stored (N1)", () => {
  it("getAuditPrompts returns it byte for byte, in order, nothing regenerated", async () => {
    const prompts = await getAuditPrompts(BRAND as never, 10);
    expect(prompts.map((p) => p.text)).toEqual(STORED);
    expect(JSON.stringify(prompts.map((p) => p.text))).toBe(JSON.stringify(STORED));
    expect(regeneratePromptPack).not.toHaveBeenCalled();
  });

  it("each question is typed by the real branded rule, as before: the last three name the business", async () => {
    const prompts = await getAuditPrompts(BRAND as never, 10);
    expect(prompts.map((p) => p.isBranded)).toEqual([...Array(10).fill(false), true, true, true]);
  });
});
