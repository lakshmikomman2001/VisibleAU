import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ serviceDb: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({ brands: {}, verticalPackPrompts: {}, verticalPacks: {} }));
vi.mock("@/lib/brands/region-label", () => ({ resolveRegionLabel: vi.fn(() => "Australia") }));
vi.mock("@/lib/prompts/build-prompt-pack", () => ({ buildPromptPack: vi.fn(() => []) }));
vi.mock("@/lib/prompts/regenerate-prompt-pack", () => ({ regeneratePromptPack: vi.fn() }));
vi.mock("@/lib/communication/alert-composer", () => ({
  sendPromptPackGenerationFailedAlert: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/verticals/expand-prompt", () => ({ expandPrompt: vi.fn(() => []) }));
vi.mock("@/lib/audit/flag-branded-prompts", () => ({ isBrandedPrompt: vi.fn(() => false) }));

import { serviceDb } from "@/db/client";
import { sendPromptPackGenerationFailedAlert } from "@/lib/communication/alert-composer";
import {
  BrandNeedsConfirmationError,
  getAuditPrompts,
  PromptPackGenerationError,
} from "@/lib/audit/get-audit-prompts";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { regeneratePromptPack } from "@/lib/prompts/regenerate-prompt-pack";

const READY_BRAND = {
  id: "brand-1",
  promptPack: ["a frozen question"],
  // Vunnara hotfix 2 (19 Oct, post-609e323), item 4: already stamped
  // CURRENT, so getAuditPrompts' own regenerate-if-stale check is a
  // no-op here -- that behaviour has its own dedicated test file
  // (tests/unit/audit/get-audit-prompts-regenerate.test.ts); this
  // fixture stays about the frozen-pack shortcut it was always about.
  promptPackGeneratorVersion: PROMPT_GENERATOR_VERSION,
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

// Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 4: what happens when the
// auto-regenerate-if-stale branch (hotfix 2, item 4) itself fails --
// either regeneratePromptPack throws, or it returns without error but
// the brand is still stamped behind PROMPT_GENERATOR_VERSION afterwards
// (regeneratePromptPack no-ops, with no write and no throw, for a brand
// whose classification is null -- reachable here since brandReadyForAudit's
// "owner confirmed" path never requires a non-null classification).
const STALE_BRAND = {
  id: "brand-stale",
  organizationId: "org-1",
  name: "Stale Co",
  domain: "staleco.example.com.au",
  promptPack: ["an old stale question"],
  promptPackGeneratorVersion: 1,
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
  categories: ["trades_plumbing"],
  audience: "households",
};

function mockRefreshedBrandRow(row: Record<string, unknown> | undefined) {
  const mockWhere = vi.fn().mockResolvedValue(row ? [row] : []);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  vi.mocked(serviceDb.select).mockReturnValue({ from: mockFrom } as never);
}

describe("getAuditPrompts -- a failed pack regeneration never runs the audit on the stale pack", () => {
  it("wraps a thrown regeneratePromptPack error in PromptPackGenerationError, and notifies the owner once", async () => {
    vi.mocked(regeneratePromptPack).mockRejectedValueOnce(new Error("buildPromptPack blew up"));
    vi.mocked(sendPromptPackGenerationFailedAlert).mockClear();

    const promise = getAuditPrompts(STALE_BRAND as never, 10);
    await expect(promise).rejects.toThrow(PromptPackGenerationError);
    await expect(promise).rejects.toThrow(/buildPromptPack blew up/);

    expect(sendPromptPackGenerationFailedAlert).toHaveBeenCalledTimes(1);
    expect(sendPromptPackGenerationFailedAlert).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", brandName: "Stale Co" }),
    );
  });

  it("treats a still-stale brand after a no-op regeneration as an invalid pack, and notifies the owner once", async () => {
    vi.mocked(regeneratePromptPack).mockResolvedValueOnce(undefined);
    vi.mocked(sendPromptPackGenerationFailedAlert).mockClear();
    // regeneratePromptPack silently no-op'd (e.g. classification is
    // null) -- the re-read row is still stamped at the OLD version.
    mockRefreshedBrandRow({ ...STALE_BRAND, promptPackGeneratorVersion: 1 });

    const promise = getAuditPrompts(STALE_BRAND as never, 10);
    await expect(promise).rejects.toThrow(PromptPackGenerationError);
    await expect(promise).rejects.toThrow(/still stamped with an old generator version/);

    expect(sendPromptPackGenerationFailedAlert).toHaveBeenCalledTimes(1);
  });

  it("treats a regenerated pack that came back empty as invalid, and notifies the owner once", async () => {
    vi.mocked(regeneratePromptPack).mockResolvedValueOnce(undefined);
    vi.mocked(sendPromptPackGenerationFailedAlert).mockClear();
    mockRefreshedBrandRow({
      ...STALE_BRAND,
      promptPackGeneratorVersion: PROMPT_GENERATOR_VERSION,
      promptPack: [],
    });

    const promise = getAuditPrompts(STALE_BRAND as never, 10);
    await expect(promise).rejects.toThrow(PromptPackGenerationError);
    await expect(promise).rejects.toThrow(/came back empty/);

    expect(sendPromptPackGenerationFailedAlert).toHaveBeenCalledTimes(1);
  });

  it("proceeds normally, with no notification, once regeneration actually brings the brand current", async () => {
    vi.mocked(regeneratePromptPack).mockResolvedValueOnce(undefined);
    vi.mocked(sendPromptPackGenerationFailedAlert).mockClear();
    mockRefreshedBrandRow({
      ...STALE_BRAND,
      promptPackGeneratorVersion: PROMPT_GENERATOR_VERSION,
      promptPack: ["a freshly regenerated question"],
    });

    const result = await getAuditPrompts(STALE_BRAND as never, 10);

    expect(result).toEqual([{ text: "a freshly regenerated question", isBranded: false }]);
    expect(sendPromptPackGenerationFailedAlert).not.toHaveBeenCalled();
  });
});
