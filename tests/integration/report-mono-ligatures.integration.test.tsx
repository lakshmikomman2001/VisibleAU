/**
 * S03 part 0 (LLD amendment 76): the report PDF's code font is JetBrains Mono NL, the official build without
 * ligatures. react-pdf's fontkit threw "Offset is outside the bounds of the DataView" laying out any JetBrains Mono
 * ligature sequence ("--", "...", "::", "//", "->", "==", "++", "</"), found in S02 part 0: an Agency tier name typed
 * with one made the whole PDF fail.
 *
 * Every mono run the PDF prints carries the sequences here, through the real path (an invented business seeded as real
 * audits, the generator, loadReportRenderData -> buildReportPdf; LLD amendment 51), and every tier lays out:
 * - the cover's report name (an Agency tier name);
 * - evidence lines (rule h quotes the answer's own sentence: up to its first full stop and without Markdown marks, as
 *   lib/reports/could-not-find.ts has it, so "..." and "->" can't reach a quote; the cover's name, the agency's action
 *   and the entity name carry those two);
 * - the agency's own action, printed whole in mono under RECOMMENDED BY {agency};
 * - the audit tags (" · audit #n", digits only: no sequence can reach them, but they're laid out in the same font);
 * - the Beyond AI answers tiles (Enhanced: the entity name on the identity tile).
 * The Method page prints no mono run (checked below), so nothing there can reach the font.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import type { ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FONT } from "@/lib/reports/pdf/tokens";
import { missingGlyphs, printedRuns } from "@/tests/helpers/pdf-fonts";
import { BLUEGUM, type SeededReportBrand, seedReportBrand } from "@/tests/helpers/report-seeds";
import { type RenderedReport, renderSeededReport } from "@/tests/helpers/seeded-report-render";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  // The seeded checks are all within their windows, so an Enhanced report re-runs nothing.
  enhancedRunners: () => ({ site: async () => undefined, youtube: async () => undefined }),
}));

/** The ligature sequences JetBrains Mono draws as one glyph, and the tier name S02 found. */
const SEQUENCES = ["--", "...", "::", "//", "->", "==", "++", "</", "A++"] as const;
const SEQ = "A++ -- ... :: // -> == ++ </";
/** The same sequences within a tier name's 24 characters, one name per tier (report_tier_names_ok, 0154). */
const TIER = "A++ --...::// ->==++</";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let seed: SeededReportBrand;
const r: Partial<Record<"today" | "basic" | "standard" | "enhanced", RenderedReport>> = {};
const errors: Record<string, string> = {};

const monoRuns = (x: RenderedReport) =>
  printedRuns(x.doc as ReactNode, { fontFamily: "Inter", fontWeight: 400 }).filter(
    (run) => run.fontFamily === FONT.mono,
  );
const withEvery = (text: string) => SEQUENCES.every((s) => text.includes(s));

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  seed = await seedReportBrand(sql, {
    ...BLUEGUM,
    // Rule h quotes the sentence the engine wrote: here it holds every sequence.
    brandedAnswer: {
      claude:
        "I was unable to find any verified information about a company called Bluegum Home Services (A++ -- :: // -> == ++ </ ...) in Chatswood.",
    },
    entity: { verified: true, status: "Active", name: `BLUEGUM ${SEQ} PTY LTD` },
  });
  await sql`
    UPDATE agency_brand_assets SET report_tier_names = ${sql.json({ basic: `${TIER} B`, standard: `${TIER} S`, enhanced: `${TIER} E` })}
    WHERE organization_id = ${seed.orgId} AND brand_id IS NULL`;
  // The seed hides one open item, picked by created_at then a random id, so some runs had no other action to tag:
  // nothing is hidden here, so OTHER ACTIONS FROM THIS AUDIT always prints its audit tags.
  await sql`DELETE FROM report_action_choices WHERE organization_id = ${seed.orgId} AND included = false`;
  await sql`
    UPDATE agency_actions SET detail = ${`Send the review link (${SEQ}) with each invoice this month.`}
    WHERE organization_id = ${seed.orgId}`;
  for (const version of ["today", "basic", "standard", "enhanced"] as const) {
    try {
      r[version] = await renderSeededReport(sql, seed, version);
    } catch (e) {
      errors[version] = e instanceof Error ? e.message : String(e);
    }
  }
}, 600_000);

afterAll(async () => {
  await seed?.cleanup();
  await sql.end();
});

const get = (version: keyof typeof r) => {
  expect(errors[version], `${version} didn't render`).toBeUndefined();
  const x = r[version];
  if (!x) throw new Error(`${version} wasn't rendered`);
  return x;
};

describe("JetBrains Mono NL: ligature sequences in every mono run lay out (amendment 76)", () => {
  it.each([
    "today",
    "basic",
    "standard",
    "enhanced",
  ] as const)("%s: the PDF is laid out, with no DataView error", (version) => {
    const x = get(version);
    expect(x.pdf.length).toBeGreaterThan(0);
    expect(x.pageCount).toBeGreaterThan(0);
  });

  it("the cover's report name prints every sequence, in mono (Agency tier names)", () => {
    for (const version of ["basic", "standard", "enhanced"] as const) {
      const cover = monoRuns(get(version)).filter((run) => run.text.startsWith(TIER.toUpperCase()));
      expect(cover, version).toHaveLength(1);
      expect(withEvery(cover[0].text), version).toBe(true);
    }
  });

  // Report v2 tiers only: with report_v2 off the report keeps today's findings (a-f), so rule h prints nothing.
  it("an evidence line quotes the answer's sentence with every sequence, in mono (rule h)", () => {
    for (const version of ["basic", "standard", "enhanced"] as const) {
      const quoted = monoRuns(get(version)).filter(
        (run) =>
          run.text.includes("unable to find any verified information") &&
          SEQUENCES.filter((q) => q !== "..." && q !== "->").every((q) => run.text.includes(q)),
      );
      expect(quoted.length, version).toBeGreaterThan(0);
    }
  });

  it("the agency's own action prints every sequence, in mono (Standard and Enhanced)", () => {
    for (const version of ["standard", "enhanced"] as const) {
      const action = monoRuns(get(version)).filter(
        (run) => run.text.startsWith("Send the review link") && withEvery(run.text),
      );
      expect(action, version).toHaveLength(1);
    }
  });

  it("the audit tags are mono runs laid out in the same font", () => {
    for (const version of ["standard", "enhanced"] as const) {
      const tags = monoRuns(get(version)).filter((run) => /^ · audit #\d+$/.test(run.text));
      expect(tags.length, version).toBeGreaterThan(0);
    }
  });

  it("the identity tile prints the entity name with every sequence, in mono (Enhanced)", () => {
    const tile = monoRuns(get("enhanced")).filter(
      (run) => run.text.includes(`BLUEGUM ${SEQ} PTY LTD`) && withEvery(run.text),
    );
    expect(tile).toHaveLength(1);
  });

  it("the Method section prints no mono run, so nothing on it reaches the code font", () => {
    for (const version of ["today", "basic", "standard", "enhanced"] as const) {
      const x = get(version);
      const heading = /^\d\d · Method and notes$/;
      const page = x.pages.find((p) => p.some((t) => heading.test(t))) ?? [];
      // Method and notes is the last section and kept whole (amendment 52): from its heading to the page's end.
      const method = page.slice(page.findIndex((t) => heading.test(t)));
      expect(method.length, version).toBeGreaterThan(1);
      const mono = monoRuns(x)
        .map((run) => run.text.trim())
        .filter((t) => t.length >= 4);
      expect(
        method.filter((line) => mono.some((t) => line.includes(t))),
        version,
      ).toEqual([]);
    }
  });

  it("the code font is the NL family and has a glyph for every character it prints", async () => {
    expect(FONT.mono).toBe("JetBrains Mono NL");
    for (const version of ["today", "basic", "standard", "enhanced"] as const) {
      const x = get(version);
      expect(await missingGlyphs(monoRuns(x)), version).toEqual([]);
      expect(x.pdf.toString("latin1"), version).toMatch(
        /\/BaseFont \/[A-Z]{6}\+JetBrainsMonoNL-(Regular|Medium)\b/,
      );
      expect(x.pdf.toString("latin1"), version).not.toMatch(
        /\/BaseFont \/[A-Z]{6}\+JetBrainsMono-/,
      );
    }
  });
});
