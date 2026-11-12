/**
 * Google AI follow-ups (12 Nov), part 1 -- a failed check never reads like a result. Audit #44's 26 refused
 * tasks read "AI Overviews: shown for 0 of 13 questions · no everyday question had an answer to be mentioned
 * in · 13 questions couldn't be checked": a count of answers Google was never asked for.
 *
 * - every question failed: "couldn't be checked this time", no counts, no mention line;
 * - some failed: the counts are over the questions checked, and the rest are stated;
 * - none failed: as before ("shown for 3 of 4 questions · you were mentioned in ...");
 * the same for the audit page's block, its "Each question" list, and the plain lines the PDFs, email and
 * client portal print (googleSurfaceBlock).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoogleSearchAiSection } from "@/components/domain/audit/google-search-ai-section";
import {
  type GoogleOutcome,
  type GoogleQuestionResult,
  type GoogleSurfaceSummary,
  googleSurfaceBlock,
  summarizeGoogleSurface,
} from "@/lib/audit/google-surfaces/summary";
import { GOOGLE_SURFACES, type GoogleSurface } from "@/lib/governance/google-surfaces";

const COULD_NOT = ["failed", "not_completed", "skipped"] as const;

function result(
  promptIndex: number,
  outcome: GoogleOutcome,
  extra: Partial<GoogleQuestionResult> = {},
): GoogleQuestionResult {
  return {
    promptIndex,
    prompt: `Question ${promptIndex + 1}`,
    isBranded: false,
    outcome,
    reason: null,
    mentioned: false,
    verified: false,
    links: outcome === "shown" ? 3 : 0,
    googleLinks: 0,
    ...extra,
  };
}

function row(surface: GoogleSurface, results: GoogleQuestionResult[]) {
  return summarizeGoogleSurface({ surface, results, directories: [], status: "complete" });
}

function summary(rows: ReturnType<typeof row>[]): GoogleSurfaceSummary {
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

function html(s: GoogleSurfaceSummary): string {
  return renderToStaticMarkup(<GoogleSearchAiSection auditId="a" summary={s} />)
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'");
}

/** A count of answers: "0 of 13", "shown for 0", "answered 0". */
const ZERO_COUNT = /\b0 of \d+|shown for 0\b|answered 0\b/;
const NO_EVERYDAY = "no everyday question had an answer to be mentioned in";

describe("every question failed: the surface couldn't be checked, with no counts", () => {
  it.each(GOOGLE_SURFACES)("%s, 13 of 13 refused", (surface) => {
    const r = row(
      surface,
      Array.from({ length: 13 }, (_, i) => result(i, "failed", { isBranded: i >= 10 })),
    );
    const name = surface === "google_ai_overviews" ? "AI Overviews" : "AI Mode";
    expect(r.line).toBe(`${name}: couldn't be checked this time`);
    expect(r.checked).toBe(0);
    expect(r.couldNotCheck).toBe(13);
  });

  it("never '0 of N' or the mention line, for any N, any mix of failed / not completed / skipped, on every surface", () => {
    for (const surface of GOOGLE_SURFACES) {
      for (let n = 1; n <= 13; n++) {
        const results = Array.from({ length: n }, (_, i) =>
          result(i, COULD_NOT[i % COULD_NOT.length], { isBranded: i % 4 === 3 }),
        );
        const r = row(surface, results);
        expect(r.line).not.toMatch(ZERO_COUNT);
        expect(r.line).not.toContain(NO_EVERYDAY);
        expect(r.line).not.toMatch(/couldn't be checked\b.*\d+ questions? couldn't be checked/);
        const s = summary([r]);
        for (const line of googleSurfaceBlock(s).lines) {
          expect(line).not.toMatch(ZERO_COUNT);
          expect(line).not.toContain(NO_EVERYDAY);
        }
        const page = html(s);
        expect(page).not.toMatch(ZERO_COUNT);
        expect(page).not.toContain(NO_EVERYDAY);
      }
    }
  });

  it("both surfaces failed: the page says so for each, and lists no questions", () => {
    const failed = (surface: GoogleSurface) =>
      row(
        surface,
        Array.from({ length: 13 }, (_, i) => result(i, "failed")),
      );
    const s = summary([failed("google_ai_overviews"), failed("google_ai_mode")]);
    const page = html(s);
    expect(page).toContain("AI Overviews: couldn't be checked this time");
    expect(page).toContain("AI Mode: couldn't be checked this time");
    expect(page).not.toContain("data-google-question");
    expect(page).not.toContain("Each question");
    expect(googleSurfaceBlock(s).lines).toEqual([
      "AI Overviews: couldn't be checked this time",
      "AI Mode: couldn't be checked this time",
    ]);
  });
});

describe("some failed: counts over the questions checked, the rest stated", () => {
  // 13 questions: 2 refused; of the 11 checked, 9 shown (1 everyday one mentioned, verified), 2 not shown.
  const mixed = (): GoogleQuestionResult[] => [
    result(0, "failed"),
    result(1, "not_completed"),
    result(2, "not_shown"),
    result(3, "not_shown"),
    ...Array.from({ length: 9 }, (_, i) =>
      result(4 + i, "shown", {
        isBranded: i >= 7,
        mentioned: i === 0 || i >= 7,
        verified: i === 0 || i >= 7,
      }),
    ),
  ];

  it("AI Overviews: shown for 9 of 11 checked · ... · 2 questions couldn't be checked", () => {
    expect(row("google_ai_overviews", mixed()).line).toBe(
      "AI Overviews: shown for 9 of 11 checked · you were mentioned in 1 of the 7 everyday ones · 2 questions couldn't be checked",
    );
  });

  it("AI Mode: answered 9 of 11 checked · ... · 2 questions couldn't be checked", () => {
    expect(row("google_ai_mode", mixed()).line).toBe(
      "AI Mode: answered 9 of 11 checked · you were mentioned in 1 of the 7 everyday ones · 2 questions couldn't be checked",
    );
  });

  it("checked, but no answer shown: the count, and no mention line", () => {
    const r = row("google_ai_overviews", [
      result(0, "failed"),
      result(1, "not_shown"),
      result(2, "not_shown"),
    ]);
    expect(r.line).toBe("AI Overviews: shown for 0 of 2 checked · 1 question couldn't be checked");
  });

  it("the page lists each question, the failed ones as 'Couldn't be checked'", () => {
    const s = summary([row("google_ai_overviews", mixed()), row("google_ai_mode", mixed())]);
    const page = html(s);
    expect(page.match(/data-google-question=/g)).toHaveLength(13);
    expect(page).toContain("Couldn't be checked");
    expect(page).toContain("Not completed");
  });
});

describe("none failed: as before", () => {
  const recorded = (): GoogleQuestionResult[] => [
    result(0, "shown"),
    result(1, "not_shown"),
    result(2, "shown", { isBranded: true, mentioned: true, verified: true }),
    result(3, "shown", { isBranded: true, mentioned: true, verified: true }),
  ];

  it("AI Overviews: shown for 3 of 4 questions · you were mentioned in 0 of the 1 everyday one", () => {
    expect(row("google_ai_overviews", recorded()).line).toBe(
      "AI Overviews: shown for 3 of 4 questions · you were mentioned in 0 of the 1 everyday one",
    );
  });

  it("AI Mode: answered 4 of 4 · you were mentioned in 0 of the 2 everyday ones", () => {
    const all = recorded().map((r) =>
      r.outcome === "not_shown" ? { ...r, outcome: "shown" as const } : r,
    );
    expect(row("google_ai_mode", all).line).toBe(
      "AI Mode: answered 4 of 4 · you were mentioned in 0 of the 2 everyday ones",
    );
  });

  it("only questions naming the business shown: the everyday line says none had an answer", () => {
    const r = row("google_ai_overviews", [
      result(0, "not_shown"),
      result(1, "shown", { isBranded: true }),
    ]);
    expect(r.line).toBe(`AI Overviews: shown for 1 of 2 questions · ${NO_EVERYDAY}`);
  });
});
