import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ serviceDb: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({ verticalPackPrompts: {}, verticalPacks: {} }));
vi.mock("@/lib/brands/region-label", () => ({ resolveRegionLabel: vi.fn(() => "Australia") }));
vi.mock("@/lib/prompts/build-prompt-pack", () => ({ buildPromptPack: vi.fn(() => []) }));
vi.mock("@/lib/verticals/expand-prompt", () => ({ expandPrompt: vi.fn(() => []) }));
vi.mock("@/lib/audit/flag-branded-prompts", () => ({ isBrandedPrompt: vi.fn(() => false) }));

import { BrandNeedsConfirmationError, getAuditPrompts } from "@/lib/audit/get-audit-prompts";

const READY_BRAND = {
  id: "brand-1",
  promptPack: ["a frozen question"],
  classification: {
    category: "trades_plumbing",
    buyerType: "smb",
    confidence: 0.95,
    intentSignals: [],
    competitors: [],
    auRelevance: "au_present",
  },
  classificationStatus: "complete",
  categoryConfirmedAt: new Date(),
  locationMode: "fixed",
  competitors: [],
  categories: [],
  audience: null,
  name: "Test Brand",
  domain: "test.example.com.au",
};

// Build 1 addendum, item 9: never silently fall back -- throws instead
// of reaching ANY of the three existing branches (frozen pack, live
// pack, generic vertical pack), so a stale pre-Build-1 brand.promptPack
// (the "old random questions") is never silently reused either.
describe("getAuditPrompts -- the needs-confirmation gate (Build 1 addendum, item 9)", () => {
  it("throws BrandNeedsConfirmationError for a brand with no location confirmed, even with a frozen promptPack already stored", async () => {
    await expect(
      getAuditPrompts({ ...READY_BRAND, locationMode: null } as never, 10),
    ).rejects.toThrow(BrandNeedsConfirmationError);
  });

  it("throws for a brand still pending classification", async () => {
    await expect(
      getAuditPrompts(
        {
          ...READY_BRAND,
          classificationStatus: "pending",
          classification: null,
          promptPack: [],
        } as never,
        10,
      ),
    ).rejects.toThrow(BrandNeedsConfirmationError);
  });

  it("throws for an Omega-shaped brand (complete, category not a real key, confidence < 0.7, never confirmed)", async () => {
    await expect(
      getAuditPrompts(
        {
          ...READY_BRAND,
          classification: {
            category: "trades_general_services",
            buyerType: "smb",
            confidence: 0.62,
            intentSignals: [],
            competitors: [],
            auRelevance: "au_present",
          },
          categoryConfirmedAt: null,
        } as never,
        10,
      ),
    ).rejects.toThrow(BrandNeedsConfirmationError);
  });

  it("does not throw for a fully confirmed, ready brand -- uses its frozen pack", async () => {
    const result = await getAuditPrompts(READY_BRAND as never, 10);
    expect(result).toEqual([{ text: "a frozen question", isBranded: false }]);
  });
});
