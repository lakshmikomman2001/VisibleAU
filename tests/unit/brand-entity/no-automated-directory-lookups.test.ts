/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part A) --
 * hipages.com.au and serviceseeking.com.au never gave this product
 * permission for an automated lookup: hipages' robots.txt disallows "/"
 * for a generic (non-self-identifying) user agent, ServiceSeeking's
 * Terms and Conditions prohibit "automated scripting tools" and any
 * commercial use of information obtained from the site without written
 * approval, and the hipages URL this code used to build
 * ("/find/{brand-slug}") was a trade-CATEGORY page, not a business-name
 * search, so even a permitted request would never have answered the
 * right question. The live fetch() implementation (lib/brand-entity/
 * au-directory-aggregate.ts) is deleted, not feature-flagged off -- this
 * guards that it, and every other directory this product will ever
 * recognise (lib/directories/registry.ts, Part B), never comes back.
 *
 * A grep for the literal domain string, across every server-side
 * source file, rather than importing and introspecting a specific
 * module -- so this fails on ANY new code path that requests one of
 * these domains, not just a reintroduction of the one deleted today.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const SCAN_DIRS = ["app", "components", "lib", "inngest", "scripts"];

// Vunnara (Part B follow-up): extended to iterate the full directory
// registry once it exists, instead of these two literals -- see that
// commit's own update to this file.
const BANNED_DOMAINS = ["hipages.com.au", "serviceseeking.com.au"];

function gitLsFiles(dir: string): string[] {
  const repoRoot = path.resolve(__dirname, "../../..");
  const out = execFileSync("git", ["ls-files", "--", dir], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => (l.endsWith(".ts") || l.endsWith(".tsx")) && !l.includes("/tests/"));
}

function stripComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlockComments.replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("no server-side code requests hipages.com.au or serviceseeking.com.au", () => {
  for (const domain of BANNED_DOMAINS) {
    it(`${domain} is never referenced in live (non-comment) source`, () => {
      const repoRoot = path.resolve(__dirname, "../../..");
      const offenders: string[] = [];

      for (const dir of SCAN_DIRS) {
        for (const relativePath of gitLsFiles(dir)) {
          const absolutePath = path.join(repoRoot, relativePath);
          const code = stripComments(readFileSync(absolutePath, "utf-8"));
          if (code.includes(domain)) {
            offenders.push(relativePath);
          }
        }
      }

      expect(offenders).toEqual([]);
    });
  }
});
