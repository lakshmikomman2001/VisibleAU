/**
 * Part 14 (Sri, 13 Nov): what Vunnara pays its providers is for operators only, and only on /admin pages.
 * No customer-facing file -- a page, a component, an API route outside /api/admin, the report PDF, emails,
 * the client portal, the dashboard's cards, the Google block's summary -- names a cost field, a cost
 * formatter or a cost loader. Comments are left out (they may explain why a figure isn't shown).
 * The operator's own files (app/(auth)/admin, app/api/admin, components/domain/admin, lib/admin) are the
 * only place these may appear; lib/costs/customer-safe.ts is what strips stored rows.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = [
  "app",
  "components",
  "lib/dashboard",
  "lib/reports",
  "lib/pdf",
  "lib/email",
  "lib/communication",
  "lib/webhooks",
  "lib/audit/google-surfaces/summary.ts",
];
const OPERATOR_ONLY = [
  /^app\/\(auth\)\/admin\//,
  /^app\/api\/admin\//,
  /^components\/domain\/admin\//,
];

/** What a cost looks like in code: its fields, its loaders and formatters, and its old labels. */
const COST_NAMES = [
  /\b(?:total|llm)?[cC]ost(?:Usd|Aud)\b/,
  /\bcostSoFar\w*/,
  /\bknownUsd\b/,
  /\bfollowUpAudCents\b/,
  /\bgetAuditCosts?\b/,
  /\bformatAudFromUsd\b/,
  /\bcostIncompleteNote\b|\bCOST_INCOMPLETE_LABEL\b/,
  /\bProviderUsageCost\b/,
  /\bspendCard\b|\bSPEND_CARD_LABEL\b/,
  /\b(?:llm|total)_cost_(?:usd|aud)\b/,
  /Provider usage|LLM spend|LLM Spend|Cost so far/,
];

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return /\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => files(join(path, name).replace(/\\/g, "/")));
}

function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const CUSTOMER_FILES = ROOTS.flatMap(files).filter((f) => !OPERATOR_ONLY.some((re) => re.test(f)));

describe("no customer-facing file carries what the providers cost us", () => {
  it("scans the customer-facing files (and not the operator's)", () => {
    expect(CUSTOMER_FILES.length).toBeGreaterThan(100);
    expect(CUSTOMER_FILES).toContain("app/(auth)/dashboard/page.tsx");
    expect(CUSTOMER_FILES).toContain("app/api/audits/[auditId]/full/route.ts");
    expect(CUSTOMER_FILES).not.toContain("app/(auth)/admin/costs/page.tsx");
  });

  it.each(CUSTOMER_FILES)("%s", (file) => {
    const code = withoutComments(readFileSync(file, "utf8"));
    const found = COST_NAMES.filter((re) => re.test(code)).map((re) => code.match(re)?.[0]);
    expect(found, `${file} names a cost`).toEqual([]);
  });

  it("the operator's page and API are where the costs are", () => {
    expect(readFileSync("app/(auth)/admin/costs/page.tsx", "utf8")).toMatch(
      /checkPlatformAdmin\(\)/,
    );
    expect(readFileSync("app/api/admin/costs/route.ts", "utf8")).toMatch(/checkPlatformAdmin\(\)/);
    expect(readFileSync("lib/admin/costs.ts", "utf8")).toMatch(/googleSurfaceResults\.costUsd/);
  });
});
