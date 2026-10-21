/**
 * Vunnara (21 Oct, "directory listings... never scraping", Parts A/B)
 * -- hipages.com.au and serviceseeking.com.au never gave this product
 * permission for an automated lookup: hipages' robots.txt disallows "/"
 * for a generic (non-self-identifying) user agent, ServiceSeeking's
 * Terms and Conditions prohibit "automated scripting tools" and any
 * commercial use of information obtained from the site without written
 * approval, and the hipages URL this code used to build
 * ("/find/{brand-slug}") was a trade-CATEGORY page, not a business-name
 * search, so even a permitted request would never have answered the
 * right question. The live fetch() implementation (lib/brand-entity/
 * au-directory-aggregate.ts) is deleted, not feature-flagged off.
 *
 * Now guards EVERY directory this product recognises at all (Part B's
 * lib/directories/registry.ts), including the disabled US ones -- a
 * directory deserves this guarantee from the moment it's declared, not
 * only once it's switched on.
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
import { DIRECTORY_REGISTRY } from "@/lib/directories/registry";

const SCAN_DIRS = ["app", "components", "lib", "inngest", "scripts"];

// Vunnara (21 Oct, Part B): every domain in the registry, across every
// market (not just the enabled AU ones) -- a disabled US directory
// deserves the exact same guarantee the moment someone starts building
// against it, not only once it's switched on. lib/directories/
// registry.ts (which only ever DECLARES domains, never fetches one) is
// excluded from the scan.
//
// Google Business Profile's own domains (google.com, business.google.com,
// g.page) are deliberately excluded here -- unlike every dedicated
// directory above, Google's domains are already used pervasively and
// legitimately elsewhere in this codebase for unrelated first-party
// reasons (OAuth, referral-source detection, a generic-platform-domain
// exclusion list) that have nothing to do with directory scraping, so a
// blunt substring match on them would be noise, not signal -- there is
// no checkGoogleBusinessProfile fetcher to guard against in the first
// place, and Part C never fetches an owner-pasted link regardless of
// which directory it's for.
const GOOGLE_KEYS = new Set(["google_business_profile"]);
const BANNED_DOMAINS = Object.values(DIRECTORY_REGISTRY)
  .flat()
  .filter((entry) => !GOOGLE_KEYS.has(entry.key))
  .flatMap((entry) => entry.domains);
const ALLOWED_FILES = new Set(["lib/directories/registry.ts"]);

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

describe("no server-side code requests any registry directory's domain", () => {
  for (const domain of BANNED_DOMAINS) {
    it(`${domain} is never referenced in live (non-comment) source`, () => {
      const repoRoot = path.resolve(__dirname, "../../..");
      const offenders: string[] = [];

      for (const dir of SCAN_DIRS) {
        for (const relativePath of gitLsFiles(dir)) {
          if (ALLOWED_FILES.has(relativePath)) continue;
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
