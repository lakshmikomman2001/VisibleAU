/**
 * 17 Nov, part 2 (Sri): no placeholder on a customer page. "Query simulation is being rebuilt and will return soon"
 * sat in the middle of the Visibility page; the sweep found the same kind on the brand page (a TikTok row "Coming
 * v1.1"), the technical audit (a "Performance -- Coming v1.1" tile), the trust pages ("Not yet available", "hasn't
 * been built yet -- this tile will populate once it ships"), Citation Failure ("Deeper diagnosis available after..."),
 * Autopilot ("Explanation will appear after gap analysis"), the wizard and report templates ("Coming soon"), and a
 * vertical's "Prompt authoring -- Coming v1.1". A feature that doesn't work is hidden until it does; nothing
 * promises "soon".
 *
 * Every page a signed-in customer or a client-portal viewer sees, and the components and lib copy they render.
 * The marketing site (app/(marketing), components/domain/landing) is public roadmap copy, outside this guard.
 * Comments are ignored; the text a page can show is what's checked.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app/(auth)", "app/client-portal", "components", "lib"];
const SKIP = [
  /^components[\\/]domain[\\/]landing[\\/]/,
  /^components[\\/]ui[\\/]/,
  // Operator-only pages and their copy.
  /^app[\\/]\(auth\)[\\/]admin[\\/]/,
  /^lib[\\/]marketing[\\/]/,
];

const PLACEHOLDER =
  /coming soon|coming v\d|being rebuilt|will return( soon)?\b|not yet available|available (after|yet)|hasn't been built|will populate|will appear after|\bbeta\b|demo coming/i;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

/** The code without its comments: block comments (and JSX {/* ... *\/}), then line comments not inside a URL. */
function withoutComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

const scanned = ROOTS.flatMap((root) => files(root)).filter(
  (path) => !SKIP.some((re) => re.test(path)),
);

describe("no placeholder copy on customer pages", () => {
  it("scans the app's pages, components and lib", () => {
    expect(scanned.length).toBeGreaterThan(300);
    expect(scanned.some((p) => p.includes("visibility") && p.endsWith("page.tsx"))).toBe(true);
  });

  it("no 'coming soon', 'being rebuilt', 'will return', 'not yet available', 'beta' or 'will appear after'", () => {
    const hits: string[] = [];
    for (const path of scanned) {
      const lines = withoutComments(readFileSync(path, "utf-8")).split("\n");
      lines.forEach((line, i) => {
        if (PLACEHOLDER.test(line)) hits.push(`${path}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("catches each placeholder it replaced", () => {
    for (const old of [
      "Query simulation is being rebuilt and will return soon",
      "Coming v1.1",
      "Not yet available",
      "hasn't been built yet — this tile will populate once it ships",
      "Explanation will appear after gap analysis",
      "Measured impact will appear after the re-audit completes.",
      "Coming soon",
      "coming soon",
      "Prompt authoring — Coming v1.1",
      "demo coming soon",
      "Cross-platform consensus isn't available yet",
      "Deeper diagnosis available after trust + comparison data is collected",
      "No referral data available yet. Connect a referral source",
    ]) {
      expect(PLACEHOLDER.test(old), old).toBe(true);
    }
  });
});

describe("a feature that doesn't work is hidden, not announced", () => {
  it("the Visibility page shows no fan-out section while query simulation is paused", () => {
    const page = readFileSync("app/(auth)/brands/[brandId]/visibility/page.tsx", "utf-8");
    expect(page).toContain("!data.fanOutPaused && data.fanOut.length > 0");
    expect(page).not.toMatch(/fanOutPaused && \(\s*<EmptyState/);
  });

  it("a trust check that isn't built has no page: its route's layout answers 404", () => {
    for (const [folder, flag] of [
      ["consensus", "consensusScore"],
      ["hallucinations", "hallucinationDetection"],
      ["linkedin-presence", "linkedinPresence"],
      ["youtube-presence", "youtubePresence"],
    ]) {
      const layout = readFileSync(
        `app/(auth)/brands/[brandId]/trust/${folder}/layout.tsx`,
        "utf-8",
      );
      expect(layout, folder).toContain(`if (!TRUST_CHECK_IMPLEMENTED.${flag}) notFound();`);
    }
  });
});
