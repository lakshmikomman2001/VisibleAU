/**
 * Google AI surfaces, Phase 1, part 3:
 * - the public pages (methodology, privacy) and the Data Residency table name DataForSEO only once Google can
 *   actually run for a customer (the env switch on and its credentials set) -- before that no question goes
 *   to it, and the pages read exactly as they did;
 * - DataForSEO's residency entry says only what its own documents say (where it processes: not documented);
 * - the completion email is unchanged without Google, and carries the Google lines with it;
 * - drift never compares an audit with one that counted Google in its headline differently.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResidencyTable } from "@/components/domain/governance/residency-table";
import { driftBaseline } from "@/lib/drift/baseline";
import { auditCompleteEmail } from "@/lib/email/templates/audit-complete";
import {
  GOOGLE_SURFACES_RESIDENCY_ENTRY,
  RESIDENCY_CONFIG,
} from "@/lib/governance/residency-config";

afterEach(() => vi.unstubAllEnvs());

function on() {
  vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
}

async function render(path: "methodology" | "privacy"): Promise<string> {
  const Page = (
    path === "methodology"
      ? await import("@/app/(marketing)/methodology/page")
      : await import("@/app/(marketing)/privacy/page")
  ).default as () => Promise<React.ReactElement> | React.ReactElement;
  return renderToStaticMarkup(await Page()).replace(/<!-- -->/g, "");
}

describe("the public pages name the provider only once Google can run", () => {
  it("off (the default): methodology and privacy don't mention DataForSEO or the Google surfaces", async () => {
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
    for (const path of ["methodology", "privacy"] as const) {
      const html = await render(path);
      expect(html, path).not.toContain("DataForSEO");
      expect(html, path).not.toMatch(/data-(methodology|privacy)-google/);
    }
  });

  it("on without credentials: still not named (nothing can be sent)", async () => {
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
    vi.stubEnv("DATAFORSEO_LOGIN", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await render("methodology")).not.toContain("DataForSEO");
  });

  it("on: methodology says how Google is collected and what 'not shown' means; privacy names the processor", async () => {
    on();
    const methodology = await render("methodology");
    expect(methodology).toContain("data-methodology-google");
    expect(methodology).toContain("collected for us by DataForSEO");
    expect(methodology).toContain("logged out");
    expect(methodology).toContain("never the whole of Australia");
    expect(methodology).toContain("Not shown");
    const privacy = await render("privacy");
    expect(privacy).toContain("data-privacy-google");
    expect(privacy).toContain("DataForSEO (DataForSEO OÜ, Estonia)");
    expect(privacy).toContain("doesn&#x27;t say where it processes data");
  });
});

describe("Data Residency: DataForSEO, in its own documents' words", () => {
  it("the entry claims no processing region, and the 13 configured entries are unchanged", () => {
    expect(RESIDENCY_CONFIG).toHaveLength(13);
    expect(RESIDENCY_CONFIG.some((e) => e.provider === "dataforseo")).toBe(false);
    expect(GOOGLE_SURFACES_RESIDENCY_ENTRY.storageRegion).toMatch(/^Not documented by DataForSEO/);
    expect(GOOGLE_SURFACES_RESIDENCY_ENTRY.retentionPeriod).toContain("12 months");
  });

  it("the table shows it in its own group when the page is given it", () => {
    const html = renderToStaticMarkup(
      <ResidencyTable entries={[{ ...GOOGLE_SURFACES_RESIDENCY_ENTRY }]} />,
    );
    expect(html).toContain("Google Search AI");
    expect(html).toContain("DataForSEO");
  });
});

describe("the completion email", () => {
  const base = {
    brandName: "Bondi Plumbing",
    auditNumber: 7,
    mentionRate: 25,
    mentionedCount: 3,
    sampleCount: 12,
    completedAt: null,
    auditUrl: "https://example.test/audits/1",
  };

  it("without Google: exactly as before (absent and null are the same email)", () => {
    expect(auditCompleteEmail({ ...base, google: null })).toEqual(auditCompleteEmail(base));
  });

  it("with Google: its label and lines, and that it isn't in the Visibility %", () => {
    const email = auditCompleteEmail({
      ...base,
      google: {
        labelLine: "2153 NSW · desktop · 11 Nov 2026",
        lines: ["AI Mode: answered 4 of 4 · you were mentioned in 0 of the 2 everyday ones"],
      },
    });
    expect(email.text).toContain("Google Search AI (2153 NSW · desktop · 11 Nov 2026):");
    expect(email.text).toContain("AI Mode: answered 4 of 4");
    expect(email.text).toContain("Not counted in the Visibility % above unless the page says so.");
    expect(email.subject).toBe(auditCompleteEmail(base).subject);
  });
});

describe("drift compares like with like on Google too", () => {
  const audit = (id: string) => ({
    id,
    methodologyVersion: 4,
    engines: ["chatgpt"],
    promptsCount: 1,
    metadata: {},
  });
  const models = new Map([
    ["now", { models: { chatgpt: ["gpt-4.1-mini"] }, drift: [] }],
    ["before", { models: { chatgpt: ["gpt-4.1-mini"] }, drift: [] }],
  ]);

  it("no audit counted Google: the baseline is the earlier audit, as before", () => {
    const b = driftBaseline(audit("now"), [audit("before")], models as never);
    expect(b.previous?.id).toBe("before");
    expect(driftBaseline(audit("now"), [audit("before")], models as never, new Set())).toEqual(b);
  });

  it("one counted Google and the other didn't: no baseline -- a different headline basis", () => {
    const b = driftBaseline(audit("now"), [audit("before")], models as never, new Set(["now"]));
    expect(b).toEqual({ previous: null, reason: "methodology_changed" });
    const both = driftBaseline(
      audit("now"),
      [audit("before")],
      models as never,
      new Set(["now", "before"]),
    );
    expect(both.previous?.id).toBe("before");
  });
});
