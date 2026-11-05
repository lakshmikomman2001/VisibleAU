/**
 * 6 Nov (Sri's decisions 3-5) -- the pricing page can't disagree with lib/pricing/tiers.ts
 * or with the server. For every plan, each tick on the page (the comparison table and
 * the plan's card) is what tiers.ts gives the plan, and for each server-checked feature
 * what the server's own check answers (workspaceHasFeature, with the plan as
 * effectiveTier reads it) and what the gates in tests/helpers/plan-gates.ts check.
 * Seats too. Any mismatch fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PricingTableClient from "@/components/domain/pricing/pricing-table-client";
import { TierComparisonTable } from "@/components/domain/pricing/tier-comparison-table";
import type { DbClient } from "@/db/client";
import { workspaceHasFeature } from "@/lib/pricing/plan-features";
import {
  COMPARISON_ROWS,
  PLAN_FEATURE_COPY,
  type PlanFeature,
  planIncludes,
  seatLimitFor,
  TIER_DEFINITIONS,
  tierRank,
} from "@/lib/pricing/tiers";
import { PLAN_FEATURE_GATES } from "@/tests/helpers/plan-gates";

const plan = vi.hoisted(() => ({ tier: "free" }));
vi.mock("@/lib/pricing/effective-tier", () => ({ effectiveTier: vi.fn(async () => plan.tier) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ROOT = join(__dirname, "../../..");
const PLANS = TIER_DEFINITIONS.map((t) => t.key);
const FEATURES = Object.keys(PLAN_FEATURE_COPY) as PlanFeature[];
const nameOf = (key: string) => TIER_DEFINITIONS.find((t) => t.key === key)?.name ?? key;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The comparison table, row by row: each plan's cell, ticked or not, and its text. */
function comparison(): Map<string, Map<string, { included: boolean | null; text: string }>> {
  const html = renderToStaticMarkup(createElement(TierComparisonTable, { showFreeTier: true }));
  const rows = new Map<string, Map<string, { included: boolean | null; text: string }>>();
  for (const row of html.matchAll(/<tr data-row="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = new Map<string, { included: boolean | null; text: string }>();
    for (const cell of row[2].matchAll(
      /<td data-plan="([^"]+)"(?: data-included="(true|false)")?[^>]*>([\s\S]*?)<\/td>/g,
    )) {
      cells.set(cell[1], {
        included: cell[2] === undefined ? null : cell[2] === "true",
        text: text(cell[3]),
      });
    }
    rows.set(row[1], cells);
  }
  return rows;
}

/** Each plan's card: its ticked lines. */
function cards(): Map<string, string[]> {
  const html = renderToStaticMarkup(
    createElement(PricingTableClient, { showFreeTier: true, defaultGstInclusive: true }),
  );
  const out = new Map<string, string[]>();
  const starts = [...html.matchAll(/data-plan-card="([^"]+)"/g)];
  starts.forEach((start, i) => {
    const body = html.slice(start.index, starts[i + 1]?.index ?? html.length);
    out.set(
      start[1],
      [...body.matchAll(/<li[^>]*data-card-line[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1])),
    );
  });
  return out;
}

/** What a card says a plan has: its own lines, and the plan it says it has everything in. */
function featuresOnCard(all: Map<string, string[]>, key: string): Set<PlanFeature> {
  const lines = all.get(key) ?? [];
  const own = FEATURES.filter((f) => lines.includes(PLAN_FEATURE_COPY[f].name));
  const everythingIn = lines.map((line) => line.match(/^Everything in (.+)$/)?.[1]).find(Boolean);
  const inherited = everythingIn
    ? featuresOnCard(all, TIER_DEFINITIONS.find((t) => t.name === everythingIn)?.key ?? "")
    : new Set<PlanFeature>();
  return new Set([...own, ...inherited]);
}

/** The feature each gate on the server checks, read from its source. */
function serverGatedFeatures(): Set<string> {
  const found = new Set<string>();
  for (const gate of PLAN_FEATURE_GATES) {
    const src = readFileSync(join(ROOT, gate), "utf8");
    for (const m of src.matchAll(/(?:planFeatureRefusal|workspaceHasFeature)\([^)]*?"(\w+)"/g)) {
      found.add(m[1]);
    }
  }
  return found;
}

const seatsShown = (key: string) => {
  const seats = seatLimitFor(key);
  return Number.isFinite(seats) ? String(seats) : "Unlimited";
};

describe("the comparison table", () => {
  it("has every row from tiers.ts, and a column for every plan, Enterprise included", () => {
    const rows = comparison();
    expect(rows.size).toBe(COMPARISON_ROWS.length);
    for (const row of rows.values()) expect([...row.keys()]).toEqual(PLANS);
  });

  it.each(
    FEATURES,
  )("%s: one row, ticked at exactly the plans the server allows", async (feature) => {
    const row = comparison().get(`feature:${feature}`);
    expect(row, `no row for ${feature}`).toBeDefined();
    for (const key of PLANS) {
      plan.tier = key;
      const server = await workspaceHasFeature({} as DbClient, "org", feature);
      expect(row?.get(key)?.included, `${feature} on ${key}`).toBe(server);
      expect(server).toBe(planIncludes(key, feature));
    }
  });

  it("every feature a server gate checks is priced, and every priced one is gated", () => {
    expect([...serverGatedFeatures()].sort()).toEqual([...FEATURES].sort());
  });

  it("every other row is ticked from its plan up", () => {
    const rows = comparison();
    for (const def of COMPARISON_ROWS) {
      if (!("from" in def)) continue;
      const row = rows.get(`from:${def.label}`);
      expect(row, def.label).toBeDefined();
      for (const key of PLANS) {
        expect(row?.get(key)?.included, `${def.label} on ${key}`).toBe(
          tierRank(key) >= tierRank(def.from),
        );
      }
    }
  });

  it("team seats: Free, Starter, Growth 1; Agency 5; Agency Pro 15; Enterprise Unlimited", () => {
    const row = comparison().get("value:Team seats");
    expect(
      Object.fromEntries([...(row ?? new Map()).entries()].map(([k, v]) => [k, v.text])),
    ).toEqual({
      free: "1",
      starter: "1",
      growth: "1",
      agency: "5",
      agency_pro: "15",
      enterprise: "Unlimited",
    });
    for (const key of PLANS) expect(row?.get(key)?.text).toBe(seatsShown(key));
  });

  it("Enterprise is ticked on every row", () => {
    const rows = comparison();
    expect(rows.size).toBeGreaterThan(0);
    for (const [label, row] of rows) {
      const cell = row.get("enterprise");
      if (cell?.included !== null) expect(cell?.included, label).toBe(true);
    }
  });

  it("branding is one row, at Agency and up, in the words the app uses", () => {
    const html = renderToStaticMarkup(createElement(TierComparisonTable, { showFreeTier: true }));
    const row = html.match(/<tr data-row="feature:white_label_reports"[^>]*>([\s\S]*?)<\/tr>/)?.[1];
    expect(text(row ?? "")).toContain("White-label report branding");
    expect(text(row ?? "")).toContain("Your agency name and logo on reports");
    expect(html).not.toMatch(/Custom branding/i);
  });
});

describe("each plan's card", () => {
  it.each(PLANS)("%s: lists the features the server gives it, and nothing above it", (key) => {
    expect(cards().has(key), `no card for ${key}`).toBe(true);
    const expected = FEATURES.filter((f) => planIncludes(key, f));
    expect([...featuresOnCard(cards(), key)].sort()).toEqual(expected.sort());
  });

  it.each(PLANS)("%s: says its seats", (key) => {
    const seats = seatsShown(key);
    const line =
      seats === "Unlimited"
        ? "Unlimited team seats"
        : `${seats} team ${seats === "1" ? "seat" : "seats"}`;
    expect(cards().get(key)).toContain(line);
  });

  it("no card names branding twice or calls it custom", () => {
    expect(cards().size).toBe(PLANS.length);
    for (const [key, lines] of cards()) {
      expect(
        lines.filter((l) => /brand(ing)?\b/i.test(l) && /white-label|custom/i.test(l)).length,
        key,
      ).toBeLessThanOrEqual(1);
      expect(lines.join(" "), key).not.toMatch(/Custom branding/i);
    }
  });

  it("Enterprise says it has everything in Agency Pro", () => {
    expect(cards().get("enterprise")).toContain(`Everything in ${nameOf("agency_pro")}`);
  });
});
