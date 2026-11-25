/**
 * S01C part 3d (LLD amendment 62): a page map of report PDFs -- for each physical page, the sections that start or
 * continue on it and how full it is -- measured from the rendered PDF itself with poppler's pdftotext:
 * - fill: the lowest text line on the page (`pdftotext -bbox`, the largest word yMax), ignoring the running header
 *   and footer, as a share of the content area (A4 842 pt; content from the top padding at 42 pt to the bottom
 *   padding at 787.9 pt, lib/reports/pdf/tokens.ts PAGE). A page whose text ends halfway down is 50%.
 * - sections: each section eyebrow ("06 · Over time") printed on the page, from `pdftotext -layout`; a page with
 *   none continues the section before it.
 *
 *   npx tsx scripts/qa/pdf-page-map.ts <dir with PDFs> [--json out.json]
 *
 * Needs poppler's pdftotext on PATH (xpdf's has no -bbox). Reads the PDFs only.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGE_HEIGHT = 841.89;
const CONTENT_TOP = 56 * 0.75;
const CONTENT_BOTTOM = PAGE_HEIGHT - 72 * 0.75;
/** The running header sits above the content area and the footer below it. */
const isBody = (yMin: number) => yMin >= CONTENT_TOP - 4 && yMin <= CONTENT_BOTTOM + 2;

export interface PageMapEntry {
  page: number;
  sections: string[];
  fill: number;
}

function pdftotext(args: string[]): string {
  return execFileSync("pdftotext", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Section eyebrows as printed (capitals, letter-spaced), keyed by their letters without spaces. */
const SECTIONS: Record<string, string> = {
  EXECUTIVESUMMARY: "Executive summary",
  ENGINEBYENGINE: "Engine by engine",
  GOOGLESEARCHAI: "Google Search AI",
  WHEREAILOOKS: "Where AI looks",
  COMPETITORS: "Competitors",
  DIAGNOSIS: "Diagnosis",
  "WHY,ANDWHATTODONEXT": "Why, and what to do next",
  OVERTIME: "Over time",
  BEYONDAIANSWERS: "Beyond AI answers",
  METHODANDNOTES: "Method and notes",
};

export function pageMap(pdfPath: string): PageMapEntry[] {
  const bbox = pdftotext(["-bbox", pdfPath, "-"]);
  const pages = bbox.split(/<page /).slice(1);
  let current = "Cover";
  return pages.map((page, i) => {
    let lowest = CONTENT_TOP;
    const lines = new Map<number, Array<{ x: number; text: string }>>();
    for (const m of page.matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">([^<]*)<\/word>/g,
    )) {
      const yMin = Number(m[2]);
      if (isBody(yMin)) lowest = Math.max(lowest, Number(m[3]));
      const key = Math.round(yMin);
      lines.set(key, [...(lines.get(key) ?? []), { x: Number(m[1]), text: m[4] }]);
    }
    const started: string[] = [];
    for (const words of lines.values()) {
      const joined = [...words]
        .sort((a, b) => a.x - b.x)
        .map((w) => w.text)
        .join("")
        .replace(/&amp;/g, "&");
      const m = joined.match(/^(\d{2})·([A-Z,]+)/);
      if (!m) continue;
      const name = Object.entries(SECTIONS).find(([letters]) => m[2].startsWith(letters))?.[1];
      if (name) started.push(`${m[1]} ${name}`);
    }
    const sections = i === 0 ? ["Cover"] : started.length > 0 ? started : [`(${current}, cont.)`];
    if (started.length > 0) current = started[started.length - 1];
    const fill = Math.round(((lowest - CONTENT_TOP) / (CONTENT_BOTTOM - CONTENT_TOP)) * 100);
    return { page: i + 1, sections, fill: Math.max(0, Math.min(100, fill)) };
  });
}

if (process.argv[1]?.endsWith("pdf-page-map.ts")) {
  const [dir, flag, out] = process.argv.slice(2);
  if (!dir) {
    console.error("usage: npx tsx scripts/qa/pdf-page-map.ts <dir> [--json out.json]");
    process.exit(2);
  }
  const all: Record<string, PageMapEntry[]> = {};
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".pdf"))
    .sort()) {
    const map = pageMap(join(dir, file));
    all[file.replace(/\.pdf$/, "")] = map;
    console.log(`${file} (${map.length} pages)`);
    for (const p of map)
      console.log(`  ${p.page}  ${String(p.fill).padStart(3)}%  ${p.sections.join(" · ")}`);
  }
  if (flag === "--json" && out) writeFileSync(out, `${JSON.stringify(all, null, 2)}\n`);
}
