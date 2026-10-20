import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Vunnara (21 Oct), item 3 -- a literal " -- " leftover in the audit
 * page's "When you're mentioned" intro survived two earlier wording
 * fixes because nothing ever checked RENDERED copy for it -- every
 * previous grep only ran once, by hand, against whatever the author
 * remembered to look at. This runs against the actual files, every
 * time the suite runs, across every page/component named in the
 * hotfix (audit, brand, sample, client-portal, PDF).
 *
 * Comments in this codebase use " -- " constantly as an ordinary prose
 * dash (not a bug) -- stripped before checking, so this only ever
 * fails on a dash that would actually reach a screen, email, or PDF.
 * Heuristic, not a full parser: block comments (/* ... *\/, including
 * JSX {/* ... *\/}) are stripped outright; line comments are stripped
 * only when `//` is preceded by whitespace or starts the line, so a
 * genuine `http://`-style URL inside rendered text is never clipped.
 */
const TARGET_FILES = [
  "app/(auth)/audits/[auditId]/page.tsx",
  "app/(auth)/brands/[brandId]/page.tsx",
  "app/(marketing)/sample-audit/page.tsx",
  "app/(marketing)/sample-audit/running/page.tsx",
  "app/(marketing)/sample-audit/result/[id]/page.tsx",
  "app/(marketing)/sample-audit/result/[id]/sample-result-view.tsx",
  "app/client-portal/[inviteToken]/page.tsx",
  "lib/pdf/render.tsx",
];

function stripComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Only a `//` preceded by whitespace or at line-start counts as a
  // line comment -- never a `//` glued directly to other text (e.g.
  // "https://..." inside a rendered string).
  return noBlockComments.replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("no literal ' -- ' survives into rendered user-facing copy", () => {
  for (const relativePath of TARGET_FILES) {
    it(`${relativePath}`, () => {
      const absolutePath = path.resolve(__dirname, "../../..", relativePath);
      const source = readFileSync(absolutePath, "utf-8");
      const code = stripComments(source);
      const match = code.match(/.{0,40} -- .{0,40}/);
      expect(match?.[0] ?? null, match ? `found: "${match[0]}"` : "").toBeNull();
    });
  }
});
