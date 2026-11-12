// @vitest-environment jsdom
/**
 * Google AI follow-ups (12 Nov), part 6 -- plan names, not plan codes. The sidebar's workspace card showed
 * "Agency_pro · AU", the user card "Agency_pro tier · AU", and /admin/settings "Plan: agency_pro".
 *
 * - tierDisplayName (lib/pricing/tiers.ts) maps every plan code to its name;
 * - the sidebar's two cards and the admin page show the name;
 * - a source scan: no page or component formats or prints a plan code itself.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TIER_DEFINITIONS, tierDisplayName } from "@/lib/pricing/tiers";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth/client", () => ({ signOut: vi.fn() }));

describe("tierDisplayName", () => {
  it.each(TIER_DEFINITIONS.map((t) => [t.key, t.name]))("%s -> %s", (code, name) => {
    expect(tierDisplayName(code)).toBe(name);
  });

  it("the six plans, by name", () => {
    expect(TIER_DEFINITIONS.map((t) => tierDisplayName(t.key))).toEqual([
      "Free",
      "Starter",
      "Growth",
      "Agency",
      "Agency Pro",
      "Enterprise",
    ]);
  });

  it("a name passed in is found too; a code that isn't a plan is shown in words, never as stored", () => {
    expect(tierDisplayName("Agency")).toBe("Agency");
    expect(tierDisplayName("Agency Pro")).toBe("Agency Pro");
    expect(tierDisplayName("some_new_plan")).toBe("Some New Plan");
    expect(tierDisplayName("some_new_plan")).not.toContain("_");
  });
});

describe("where a plan is shown", () => {
  it("the sidebar's workspace and user cards: 'Agency Pro · AU', 'Agency Pro plan · AU'", async () => {
    const { AppSidebar } = await import("@/components/domain/app-sidebar");
    render(<AppSidebar orgName="Splice" orgTier="agency_pro" userName="Sri" />);
    expect(screen.getByText("Agency Pro · AU")).toBeInTheDocument();
    expect(screen.getByText("Agency Pro plan · AU")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/agency_pro|Agency_pro/);
  }, 30_000);
});

/** Every .tsx file under app/ and components/. */
function tsxFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".tsx")) out.push(relative(process.cwd(), full).replace(/\\/g, "/"));
    }
  };
  for (const d of ["app", "components"]) walk(join(process.cwd(), d));
  return out;
}

describe("source scan: no page or component prints or formats a plan code itself", () => {
  const PLAN = "(?:tier|orgTier|planTier|requiredTier|tierKey|tierCode|tierName)";
  const PATTERNS = [
    // Formatting a code by hand: orgTier.charAt(0).toUpperCase(), tier.replace(/_/g, " ") ...
    new RegExp(`\\b${PLAN}\\.(?:charAt|replace|slice|toUpperCase|toLowerCase|split)\\(`),
    // capitalize(tier)
    new RegExp(`capitali[sz]e\\(\\s*(?:[\\w?.]+\\.)?${PLAN}\\s*\\)`),
    // {tier} or {view.selected.tier} as a JSX child (an attribute, tier={tier}, is fine)
    new RegExp(`(?<![=\\w])\\{\\s*(?:[\\w?.]+\\.)?${PLAN}\\s*\\}`),
  ];
  // Not plans: a crawler's tier on the robots.txt page.
  const NOT_PLANS = ["app/(auth)/brands/[brandId]/robots-txt-config/page.tsx: Tier {tier}"];

  it("every plan shown goes through tierDisplayName", () => {
    const found: string[] = [];
    for (const file of tsxFiles()) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (PATTERNS.some((re) => re.test(line))) {
            const at = `${file}: ${line.trim()}`;
            if (!NOT_PLANS.some((n) => at.startsWith(n)))
              found.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(found).toEqual([]);
  });
});
