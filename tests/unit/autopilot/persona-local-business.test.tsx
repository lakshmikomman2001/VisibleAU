/**
 * 17 Nov, part 1 (Sri's decision) -- every local business gets the Autopilot overview's "Local Business Insights":
 * tradies (who got the small-business view: the overview's word list had "plumber" and "tradie" but never the
 * vertical key "tradies"), the café, gym, salon, shop, accountant and general local types, and the rest of the local
 * types -- from the one definition of a local type (lib/prompts/templates.ts LOCAL_CATEGORY_KEYS). Software doesn't.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PersonaDashboard } from "@/components/domain/autopilot/persona-dashboard";
import { isLocalBusiness } from "@/lib/brands/local-business";
import { getDirectoriesForBrand } from "@/lib/directories/registry";
import { CATEGORY_KEYS, LOCAL_CATEGORY_KEYS } from "@/lib/prompts/templates";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const LOCAL_VIEW = "Local Business Insights";
const SMB_VIEW = "Harbour Bean Overview";

function view(vertical: string, categories: string[], tier = "growth") {
  return renderToStaticMarkup(
    <PersonaDashboard
      brandId="b1"
      brandName="Harbour Bean"
      vertical={vertical}
      categories={categories}
      tier={tier}
    />,
  );
}

describe("the one definition of a local business type", () => {
  it("is every type whose questions name the suburb: trades, allied health, legal, real estate, hospitality and the new local types", () => {
    for (const type of [
      "trades_plumbing",
      "trades_general",
      "allied_health_dental",
      "legal_services",
      "real_estate_agency",
      "hospitality_restaurant",
      "cafe",
      "fitness_gym",
      "beauty_salon",
      "retail_shop",
      "accounting_practice",
      "general",
    ]) {
      expect(LOCAL_CATEGORY_KEYS, type).toContain(type);
    }
    for (const type of [
      "saas_design_tools",
      "crm_software",
      "accounting_software",
      "legal_tech",
      "ecommerce_platform",
    ]) {
      expect(LOCAL_CATEGORY_KEYS, type).not.toContain(type);
    }
  });

  it("is what the directory registry checks: every local type gets the six local directories, every software type none", () => {
    for (const type of CATEGORY_KEYS) {
      const names = getDirectoriesForBrand("au", [type]).map((d) => d.name);
      if (LOCAL_CATEGORY_KEYS.includes(type)) expect(names, type).toContain("Yellow Pages");
      else expect(names, type).toEqual([]);
    }
  });
});

describe("the Autopilot overview's local view", () => {
  it.each(LOCAL_CATEGORY_KEYS)("a brand confirmed as %s gets Local Business Insights", (type) => {
    const html = view("local_business", [type]);
    expect(html).toContain(LOCAL_VIEW);
    expect(html).not.toContain(SMB_VIEW);
  });

  it("a tradie gets it before and after confirming its type", () => {
    expect(view("tradies", [])).toContain(LOCAL_VIEW);
    expect(view("tradies", ["trades_plumbing"])).toContain(LOCAL_VIEW);
    expect(view("allied_health", [])).toContain(LOCAL_VIEW);
    expect(view("local_business", [])).toContain(LOCAL_VIEW);
  });

  it("software doesn't: a SaaS brand, or one confirmed as a software type, gets its own overview", () => {
    expect(view("saas", [])).toContain(SMB_VIEW);
    expect(view("saas", ["crm_software"])).toContain(SMB_VIEW);
    expect(view("tradies", ["accounting_software"])).toContain(SMB_VIEW);
    expect(view("saas", [])).not.toContain(LOCAL_VIEW);
  });

  it("the confirmed type decides over the vertical", () => {
    expect(isLocalBusiness({ vertical: "saas", categories: ["cafe"] })).toBe(true);
    expect(isLocalBusiness({ vertical: "local_business", categories: ["hr_software"] })).toBe(
      false,
    );
  });

  it("an agency keeps its workspace-wide view", () => {
    expect(view("tradies", [], "agency")).toContain("Agency Command Centre");
  });

  it("the local view assumes no trade: nothing in it names one", () => {
    const html = view("local_business", ["cafe"]);
    expect(html).not.toMatch(/plumb|electrician|tradie|hipages|call-?out/i);
  });
});
