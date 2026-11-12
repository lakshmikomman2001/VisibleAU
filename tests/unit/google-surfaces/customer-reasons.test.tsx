/**
 * Google AI follow-ups (12 Nov), part 2 -- customers never see the provider's raw error. Audit #44's block
 * printed "The provider refused the question: 40100 You are not authorized to access this resource. See your
 * login details here: https://app.dataforseo.com/api-access ." under each surface.
 *
 * - DataForSEO's documented codes fall into six categories (lib/serp/dataforseo-errors.ts);
 * - each category has one plain customer sentence, with no code, provider name or URL;
 * - the audit page's block and the plain lines (PDFs, email, client portal) show that sentence, never the
 *   stored operator reason;
 * - a source scan: only the operator's code reads the stored reason, code or raw response.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoogleSearchAiSection } from "@/components/domain/audit/google-search-ai-section";
import {
  GOOGLE_CUSTOMER_OWN_REASONS,
  GOOGLE_CUSTOMER_REASONS,
  GOOGLE_STORED_REASON,
  googleCustomerReason,
  googleCustomerStatusReason,
} from "@/lib/audit/google-surfaces/reasons";
import {
  type GoogleOutcome,
  type GoogleSurfaceSummary,
  googleSurfaceBlock,
  summarizeGoogleSurface,
} from "@/lib/audit/google-surfaces/summary";
import {
  DATAFORSEO_CATEGORY_CODES,
  dataForSeoErrorCategory,
  GOOGLE_PROVIDER_ERROR_CATEGORIES,
} from "@/lib/serp/dataforseo-errors";

/** The provider's real message for audit #44's tasks (and for a made-up login, recorded 12 Nov). */
const RAW_40100 =
  "The provider refused the question: 40100 You are not authorized to access this resource. See your login details here: https://app.dataforseo.com/api-access .";

const PROBLEM_ON_OUR_SIDE =
  "Google couldn't be checked this time because of a problem on our side. It will be checked again on the next audit.";

describe("DataForSEO's documented codes, by category", () => {
  it.each([
    [40100, "login_rejected"],
    [40104, "login_rejected"],
    [40201, "login_rejected"],
    [40204, "login_rejected"],
    [40207, "login_rejected"],
    [40208, "login_rejected"],
    [40200, "out_of_credit"],
    [40203, "out_of_credit"],
    [40210, "out_of_credit"],
    [40202, "rate_limited"],
    [40205, "rate_limited"],
    [40206, "rate_limited"],
    [40209, "rate_limited"],
    [40505, "location_or_language"],
    [50401, "timeout"],
    [50402, "timeout"],
    [0, "timeout"],
    [40101, "other"],
    [40102, "other"],
    [40401, "other"],
    [40501, "other"],
    [50000, "other"],
    [12345, "other"],
  ] as const)("%i -> %s", (code, category) => {
    expect(dataForSeoErrorCategory(code)).toBe(category);
  });

  it("no answer at all (no status code) is a timeout", () => {
    expect(dataForSeoErrorCategory(null)).toBe("timeout");
  });

  it("every category but 'other' lists codes, and no code is in two", () => {
    const all = Object.values(DATAFORSEO_CATEGORY_CODES).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const codes of Object.values(DATAFORSEO_CATEGORY_CODES))
      expect(codes.length).toBeGreaterThan(0);
  });
});

describe("each category's customer text", () => {
  it.each([
    ["login_rejected", PROBLEM_ON_OUR_SIDE],
    ["out_of_credit", PROBLEM_ON_OUR_SIDE],
    [
      "rate_limited",
      "Google couldn't be checked this time because the checking service was busy. It will be checked again on the next audit.",
    ],
    [
      "location_or_language",
      "Google couldn't be checked this time: the checking service doesn't support this location or language.",
    ],
    ["timeout", "Google didn't answer in time. It will be checked again on the next audit."],
    [
      "other",
      "Google couldn't be checked this time because of a problem with the checking service. It will be checked again on the next audit.",
    ],
  ] as const)("%s", (category, text) => {
    expect(GOOGLE_CUSTOMER_REASONS[category]).toBe(text);
    const code = category === "other" ? 40102 : (DATAFORSEO_CATEGORY_CODES[category][0] ?? 0);
    expect(
      googleCustomerReason({
        outcome: "failed",
        providerStatusCode: code,
        outcomeReason: RAW_40100,
      }),
    ).toBe(text);
  });

  it("no customer text names a code, the provider or a URL", () => {
    const texts = [
      ...GOOGLE_PROVIDER_ERROR_CATEGORIES.map((c) => GOOGLE_CUSTOMER_REASONS[c]),
      ...Object.values(GOOGLE_CUSTOMER_OWN_REASONS),
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/\d{3,}/);
      expect(t).not.toMatch(/dataforseo|https?:|www\.|GOOGLE_AI_SURFACES_ENABLED|api/i);
    }
  });

  it("the questions not sent after a refused login: the login's text", () => {
    expect(
      googleCustomerReason({
        outcome: "not_completed",
        providerStatusCode: 40100,
        outcomeReason: GOOGLE_STORED_REASON.stopped(40100, "login_rejected"),
      }),
    ).toBe(PROBLEM_ON_OUR_SIDE);
  });

  it("Vunnara's own reasons: plain words, never the env var; an unknown stored reason is generic", () => {
    const own = (outcome: GoogleOutcome, outcomeReason: string) =>
      googleCustomerReason({ outcome, providerStatusCode: null, outcomeReason });
    expect(own("skipped", GOOGLE_STORED_REASON.switchedOff)).toBe(
      GOOGLE_CUSTOMER_OWN_REASONS.switchedOff,
    );
    expect(own("skipped", GOOGLE_STORED_REASON.noCredentials)).toBe(PROBLEM_ON_OUR_SIDE);
    expect(own("skipped", GOOGLE_STORED_REASON.dailyCap)).toBe(
      GOOGLE_CUSTOMER_OWN_REASONS.dailyCap,
    );
    expect(own("skipped", GOOGLE_STORED_REASON.costCeiling(0.1))).toBe(
      GOOGLE_CUSTOMER_OWN_REASONS.costCeiling,
    );
    expect(own("not_completed", GOOGLE_STORED_REASON.notCompleted)).toBe(
      GOOGLE_CUSTOMER_REASONS.timeout,
    );
    expect(own("not_completed", GOOGLE_STORED_REASON.functionFailed)).toBe(PROBLEM_ON_OUR_SIDE);
    expect(own("skipped", "Something new: 40999 https://example.com")).toBe(
      GOOGLE_CUSTOMER_OWN_REASONS.notChecked,
    );
    expect(
      googleCustomerReason({ outcome: "shown", providerStatusCode: 20000, outcomeReason: null }),
    ).toBeNull();
  });

  it("a whole audit's reason: the location's own words, without the admin page", () => {
    expect(
      googleCustomerStatusReason(
        "The business has no state, so there's no Google location for it. Set a postcode on /admin/settings.",
      ),
    ).toBe("The business has no state, so there's no Google location for it.");
    expect(googleCustomerStatusReason("The provider has no Google location for NSW.")).toBe(
      "The checking service has no Google location for NSW.",
    );
    expect(googleCustomerStatusReason(GOOGLE_STORED_REASON.runnerUnreachable)).toBe(
      PROBLEM_ON_OUR_SIDE,
    );
    expect(googleCustomerStatusReason("anything else")).toBeNull();
  });
});

function audit44(): GoogleSurfaceSummary {
  const rows = (["google_ai_overviews", "google_ai_mode"] as const).map((surface) =>
    summarizeGoogleSurface({
      surface,
      status: "complete",
      directories: [],
      results: Array.from({ length: 13 }, (_, i) => ({
        promptIndex: i,
        prompt: `Question ${i + 1}`,
        isBranded: i >= 10,
        outcome: "failed" as const,
        reason: googleCustomerReason({
          outcome: "failed",
          providerStatusCode: 40100,
          outcomeReason: RAW_40100,
        }),
        mentioned: false,
        verified: false,
        links: 0,
        googleLinks: 0,
      })),
    }),
  );
  return {
    status: "complete",
    statusReason: null,
    location: { code: 9071744, label: "2153 NSW", kind: "postcode", precise: true, note: null },
    device: "desktop",
    labelLine: "2153 NSW · desktop · 12 Nov 2026",
    locationNote: null,
    countInHeadline: false,
    provider: "dataforseo",
    ranAt: "2026-11-12T03:00:00.000Z",
    rows,
  };
}

describe("audit #44 rendered for a customer: the plain reason, never the provider's message", () => {
  const RAW_BITS = [
    "40100",
    "not authorized",
    "app.dataforseo.com",
    "https://",
    "refused the question",
  ];

  it("the audit page's block", () => {
    const html = renderToStaticMarkup(<GoogleSearchAiSection auditId="a" summary={audit44()} />)
      .replace(/<!-- -->/g, "")
      .replace(/&#x27;/g, "'");
    expect(html).toContain("AI Overviews: couldn't be checked this time");
    expect(html).toContain(PROBLEM_ON_OUR_SIDE);
    // Once, not once per surface.
    expect(html.split(PROBLEM_ON_OUR_SIDE)).toHaveLength(2);
    for (const bit of RAW_BITS) expect(html).not.toContain(bit);
  });

  it("the plain lines the PDFs, the email and the client portal print", () => {
    const block = googleSurfaceBlock(audit44());
    expect(block.lines).toEqual([
      "AI Overviews: couldn't be checked this time",
      "AI Mode: couldn't be checked this time",
      PROBLEM_ON_OUR_SIDE,
    ]);
    for (const bit of RAW_BITS) expect(JSON.stringify(block)).not.toContain(bit);
  });
});

/** Every .ts/.tsx file under these folders (no tests, no node_modules). */
function sources(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name))
        out.push(relative(process.cwd(), full).replace(/\\/g, "/"));
    }
  };
  for (const d of dirs) walk(join(process.cwd(), d));
  return out;
}

describe("source scan: only the operator's code reads the stored reason, code or raw response", () => {
  // Every file that reads the Google results table. The collector and the dispatcher write the operator's
  // reason; the summary turns it into the customer's words; the headline reads outcomes only; the
  // operator's queries (shown on /admin/settings, operator-checked) read it as stored.
  const READERS = new Set([
    "db/schema/google-surfaces.ts",
    "db/schema/index.ts",
    "lib/audit/google-surfaces/collect.ts",
    "lib/audit/google-surfaces/dispatch.ts",
    "lib/audit/google-surfaces/reasons.ts",
    "lib/audit/google-surfaces/summary.ts",
    "lib/audit/google-surfaces/operator.ts",
    "lib/scoring/resolve-audit-dimensions.ts",
    // Part 14 (13 Nov): the operator's costs (/admin/costs, operator-checked) sum its cost_usd only.
    "lib/admin/costs.ts",
  ]);
  const RAW =
    /\b(outcomeReason|providerStatusCode|rawResponse|outcome_reason|provider_status_code|raw_response)\b/;

  it("no page, component, PDF, email, report or API file reads the Google results table itself", () => {
    const readers = sources(["app", "components", "lib", "inngest", "db/schema"]).filter((f) =>
      /\bgoogleSurfaceResults\b|\bgoogle_surface_results\b/.test(readFileSync(f, "utf8")),
    );
    expect(readers.filter((f) => !READERS.has(f))).toEqual([]);
  });

  it("the headline reads outcomes, never the stored reason, code or response", () => {
    expect(readFileSync("lib/scoring/resolve-audit-dimensions.ts", "utf8")).not.toMatch(RAW);
  });

  it("the summary hands the customer only googleCustomerReason's words, and never the raw response", () => {
    const summary = readFileSync("lib/audit/google-surfaces/summary.ts", "utf8");
    expect(summary).toMatch(/reason:\s*googleCustomerReason\(/);
    expect(summary).toMatch(/googleCustomerStatusReason\(/);
    expect(summary).not.toMatch(/\brawResponse\b|\braw_response\b/);
    // Read once (the select) and passed once (to googleCustomerReason).
    expect(summary.match(/\boutcomeReason\b/g)?.length ?? 0).toBeLessThanOrEqual(2);
  });
});
