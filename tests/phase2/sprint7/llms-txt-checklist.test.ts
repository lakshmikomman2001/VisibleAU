/**
 * ⚠️ GG — the llms.txt generator page's "Current state" checklist must read
 * the real per-component flags, never guess a breakdown from the summed
 * score.
 *
 * Task FF proved lib/llms-txt/depth-score.ts was always correct; the bug
 * was entirely in app/(auth)/brands/[brandId]/llms-txt-generator/page.tsx,
 * which reconstructed h1Blockquote/sections/links/depth from `score >=
 * 6/9/12/15` thresholds -- an assumption that the 6 components are awarded
 * in a fixed cumulative order, which is false (they're independent
 * booleans). For Bondi Plumbing's real file (score 9 from
 * present+links+depth), that produced the exact inverse display:
 * blockquote/sections shown passing, links/depth shown failing.
 */
import { describe, expect, it } from "vitest";
import {
  buildLlmsTxtChecklist,
  type LlmsTxtChecklistRow,
} from "@/app/(auth)/brands/[brandId]/llms-txt-generator/page";

function findRow(rows: LlmsTxtChecklistRow[], label: string) {
  const row = rows.find((r) => r.label === label);
  if (!row) throw new Error(`row not found: ${label}`);
  return row;
}

describe("⚠️ GG — buildLlmsTxtChecklist", () => {
  it("Bondi's real flags (score 9 from present+links+depth) render correctly, not inverted", () => {
    const rows = buildLlmsTxtChecklist({
      present: true,
      h1Blockquote: false,
      sections: false,
      links: true,
      depth: true,
      fullTxt: false,
    });

    expect(rows).not.toBeNull();
    const checklist = rows as LlmsTxtChecklistRow[];

    expect(findRow(checklist, "llms.txt present").pass).toBe(true);
    expect(findRow(checklist, "H1 + blockquote intro").pass).toBe(false);
    expect(findRow(checklist, "Sections (## headings)").pass).toBe(false);
    expect(findRow(checklist, "Links to canonical pages").pass).toBe(true);
    expect(findRow(checklist, "Content depth (≥1500 chars)").pass).toBe(true);
    expect(findRow(checklist, "llms-full.txt companion").pass).toBe(false);

    const total = checklist.reduce((sum, r) => sum + (r.pass ? r.pts : 0), 0);
    expect(total).toBe(9);
  });

  it("regression: the old score>=N threshold display (blockquote✓/sections✓/links✗/depth✗ at score 9) is gone", () => {
    // The pre-fix bug derived these four purely from the total (9), which
    // would have shown blockquote=Yes, sections=Yes, links=No, depth=No --
    // the exact opposite of Bondi's real flags. Confirm the new function
    // reads the real flags instead and produces the true result.
    const rows = buildLlmsTxtChecklist({
      present: true,
      h1Blockquote: false,
      sections: false,
      links: true,
      depth: true,
      fullTxt: false,
    }) as LlmsTxtChecklistRow[];

    expect(findRow(rows, "H1 + blockquote intro").pass).not.toBe(true);
    expect(findRow(rows, "Sections (## headings)").pass).not.toBe(true);
    expect(findRow(rows, "Links to canonical pages").pass).not.toBe(false);
    expect(findRow(rows, "Content depth (≥1500 chars)").pass).not.toBe(false);
  });

  it("a different flag combination (e.g. blockquote+sections true, links+depth false) renders correctly too", () => {
    // Guards against a fix that merely hardcodes Bondi's specific pattern.
    const rows = buildLlmsTxtChecklist({
      present: true,
      h1Blockquote: true,
      sections: true,
      links: false,
      depth: false,
      fullTxt: true,
    }) as LlmsTxtChecklistRow[];

    expect(findRow(rows, "H1 + blockquote intro").pass).toBe(true);
    expect(findRow(rows, "Sections (## headings)").pass).toBe(true);
    expect(findRow(rows, "Links to canonical pages").pass).toBe(false);
    expect(findRow(rows, "Content depth (≥1500 chars)").pass).toBe(false);
    expect(findRow(rows, "llms-full.txt companion").pass).toBe(true);

    // present(3) + h1Blockquote(3) + sections(3) + fullTxt(3) = 12.
    const total = rows.reduce((sum, r) => sum + (r.pass ? r.pts : 0), 0);
    expect(total).toBe(12);
  });

  it("legacy audit (components absent) -> null, never a fabricated breakdown", () => {
    expect(buildLlmsTxtChecklist(undefined)).toBeNull();
  });
});
