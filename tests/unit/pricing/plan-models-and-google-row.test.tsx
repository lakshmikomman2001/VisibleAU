/**
 * 19 Nov (Sri's review of /pricing):
 * - The Claude model differs by plan (lib/llm/model-selector.ts: Free and Starter ask Claude Haiku 4.5, Growth and up
 *   Sonnet 4.6; ChatGPT and Perplexity change at Agency too), so "4 AI engines" on every paid plan hid a difference.
 *   The cards and Compare plans now name each engine's model, from the code that picks it; the methodology's example
 *   ("a plan change that moves Claude from Haiku to Sonnet") is a real plan change.
 * - Compare plans' Google row has the grey line the rows below it have: its own section, the score, where it's
 *   checked from -- the methodology's facts, from one source (lib/marketing/google-ai.ts GOOGLE_AI_LOCATION_TEXT).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GoogleAiMethodology } from "@/components/domain/google-ai/google-ai-methodology";
import PricingTableClient from "@/components/domain/pricing/pricing-table-client";
import { TierComparisonTable } from "@/components/domain/pricing/tier-comparison-table";
import type { Tier } from "@/db/schema/enums";
import { ENGINE_DISPLAY_NAMES, type Engine } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { modelName } from "@/lib/llm/model-set";
import { TIER_ENGINES } from "@/lib/llm/tier-engines";
import { GOOGLE_AI_LOCATION_TEXT, type PublicGoogleAi } from "@/lib/marketing/google-ai";
import { cardFeatures, planModel, planModelsLine, TIER_DEFINITIONS } from "@/lib/pricing/tiers";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ENGINES: Engine[] = ["chatgpt", "claude", "gemini", "perplexity"];
const ON: PublicGoogleAi = {
  surfaces: ["google_ai_overviews", "google_ai_mode"],
  fromTier: "growth",
  fromPlan: "Growth",
  countedInScore: false,
  device: "desktop",
  queueMode: "standard",
};
const GOOGLE_ROW = "Google AI Overviews and AI Mode, checked from your postcode";

const html = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(el)
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

/** One comparison row's cells, by plan: the text in each `data-plan` cell. */
function rowCells(table: string, key: string): Record<string, string> {
  const start = table.indexOf(`data-row="${key}"`);
  if (start < 0) throw new Error(`no row ${key}`);
  const row = table.slice(start, table.indexOf("</tr>", start));
  return Object.fromEntries(
    [...row.matchAll(/data-plan="([a-z_]+)"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => [
      m[1],
      (m[2] ?? "").replace(/<[^>]+>/g, "").trim(),
    ]),
  );
}

beforeAll(() => {
  renderToStaticMarkup(
    createElement(PricingTableClient, { showFreeTier: true, defaultGstInclusive: true }),
  );
}, 60_000);

describe("each plan's models, from the code that picks them", () => {
  it("planModel is the audit's own model (selectModel brand_mention) where the plan uses the engine", () => {
    for (const tier of TIER_DEFINITIONS) {
      for (const engine of ENGINES) {
        const uses = (TIER_ENGINES[tier.key] ?? []).includes(engine);
        expect(planModel(tier.key, engine), `${tier.key} ${engine}`).toBe(
          uses ? modelName(selectModel(tier.key as Tier, engine, "brand_mention")) : null,
        );
      }
    }
  });

  it("the Claude model does differ by plan: Haiku on Free and Starter, Sonnet from Growth up", () => {
    expect(planModel("free", "claude")).toBeNull();
    expect(planModel("starter", "claude")).toBe("Haiku 4.5");
    for (const key of ["growth", "agency", "agency_pro", "enterprise"]) {
      expect(planModel(key, "claude"), key).toBe("Sonnet 4.6");
    }
    expect(planModel("starter", "chatgpt")).toBe("GPT-4.1 mini");
    expect(planModel("agency", "chatgpt")).toBe("GPT-4.1");
    expect(planModel("growth", "perplexity")).toBe("Sonar");
    // S04B part 1 (LLD amendment 99): the Agent API has no Sonar Pro; every plan asks Perplexity's own Sonar.
    expect(planModel("agency", "perplexity")).toBe("Sonar");
  });

  it("every card names its models after its highlights", () => {
    expect(planModelsLine("starter")).toBe(
      "Models: ChatGPT (GPT-4.1 mini), Claude (Haiku 4.5), Gemini (3.5 Flash-Lite), Perplexity (Sonar)",
    );
    expect(planModelsLine("free")).toBe("Models: ChatGPT (GPT-4.1 mini), Perplexity (Sonar)");
    for (const tier of TIER_DEFINITIONS) {
      const lines = cardFeatures(tier);
      expect(lines[tier.highlights.length], tier.key).toBe(planModelsLine(tier.key));
    }
    const cards = html(
      createElement(PricingTableClient, { showFreeTier: true, defaultGstInclusive: true }),
    );
    for (const tier of TIER_DEFINITIONS) {
      expect(cards, tier.key).toContain(planModelsLine(tier.key));
    }
  });

  it("Compare plans has a model row per engine, each plan's model or a dash", () => {
    const table = html(createElement(TierComparisonTable, { showFreeTier: true }));
    for (const engine of ENGINES) {
      const cells = rowCells(table, `value:${ENGINE_DISPLAY_NAMES[engine]} model`);
      for (const tier of TIER_DEFINITIONS) {
        expect(cells[tier.key], `${engine} ${tier.key}`).toBe(planModel(tier.key, engine) ?? "—");
      }
    }
    expect(rowCells(table, "value:Claude model")).toMatchObject({
      free: "—",
      starter: "Haiku 4.5",
      growth: "Sonnet 4.6",
    });
  });

  it("the methodology's example is a real plan change (Starter's Haiku, Growth's Sonnet)", () => {
    const page = readFileSync(
      join(process.cwd(), "app/(marketing)/methodology/page.tsx"),
      "utf8",
    ).replace(/\s+/g, " ");
    expect(page).toContain("a plan change that moves Claude from Haiku to Sonnet");
    expect(planModel("starter", "claude")).toMatch(/^Haiku/);
    expect(planModel("growth", "claude")).toMatch(/^Sonnet/);
  });
});

describe("Compare plans' Google row has its grey line, in the methodology's words", () => {
  it("setting on: under the row, its own section, not in the score, and where it's checked from", () => {
    const table = html(createElement(TierComparisonTable, { showFreeTier: true, googleAi: ON }));
    const start = table.indexOf(`data-row="from:${GOOGLE_ROW}"`);
    expect(start).toBeGreaterThan(-1);
    const row = table.slice(start, table.indexOf("</tr>", start));
    expect(row).toContain(
      '<span class="block text-xs" style="color:var(--text-tertiary)" data-row-description="">Shown in its own section, not counted in your Visibility score. From your postcode where Google supports it, otherwise your suburb, city or state capital.</span>',
    );
  });

  it("counted in the headline: the line says so", () => {
    const table = html(
      createElement(TierComparisonTable, {
        showFreeTier: true,
        googleAi: { ...ON, countedInScore: true },
      }),
    );
    expect(table).toContain("Shown in its own section and counted in your Visibility score.");
  });

  it("setting off: no Google row and no grey line", () => {
    const table = html(createElement(TierComparisonTable, { showFreeTier: true, googleAi: null }));
    expect(table).not.toContain(GOOGLE_ROW);
    expect(table).not.toContain("data-row-description");
  });

  it("the methodology says the same place, from the same constant", () => {
    const section = html(createElement(GoogleAiMethodology, { googleAi: ON }));
    expect(section).toContain(`checked ${GOOGLE_AI_LOCATION_TEXT} (the audit then says`);
    expect(GOOGLE_AI_LOCATION_TEXT).toBe(
      "from your postcode where Google supports it, otherwise your suburb, city or state capital",
    );
  });
});
