import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Addendum: production functions run in iad1, not Sydney" (23 Oct),
 * corrected (23 Oct, follow-up): functions DO run in syd1, confirmed
 * via the Vercel dashboard (Settings -> Functions shows "You are
 * limited to 1 region on your current Hobby plan", syd1 selected).
 * "Overridden" means vercel.json's own `"regions"` value takes
 * precedence over the dashboard UI setting, not that the Hobby plan
 * was silently ignoring it -- Hobby's one-region limit is satisfied by
 * any single region of your choosing, syd1 included. The original
 * report's "most likely a Hobby-plan limitation" guess was wrong; the
 * iad1 seen in the original production error was most likely the
 * edge entry point Inngest's own US-hosted servers hit when calling
 * back into /api/webhooks/inngest, not the function's own region.
 *
 * None of that changes what this test guards: vercel.json has
 * specified `"regions": ["syd1"]` since the file was first created,
 * and no route file sets preferredRegion/runtime/regions to anything
 * else. This is the regression guard the task asked for regardless:
 * it fails loudly if a FUTURE route (or vercel.json itself) ever adds
 * a region/runtime override that isn't this one, documented value.
 *
 * An Edge runtime (`export const runtime = "edge"`) is deliberately
 * NOT allowed here either, undocumented: Edge functions run on
 * Vercel's global edge network, not a pinned serverless region, which
 * is its own kind of "not Sydney" this task is specifically about.
 */
const REPO_ROOT = path.resolve(__dirname, "../../..");
const ALLOWED_REGION = "syd1";

interface VercelConfig {
  regions?: string[];
  functions?: Record<string, { regions?: string[]; maxDuration?: number }>;
}

function readVercelConfig(): VercelConfig {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "vercel.json"), "utf-8"));
}

function gitLsFiles(dir: string): string[] {
  const out = execFileSync("git", ["ls-files", "--", dir], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".ts") || l.endsWith(".tsx"));
}

describe("production function region is syd1 everywhere (23 Oct addendum)", () => {
  it("vercel.json's project-level regions is exactly [\"syd1\"]", () => {
    const config = readVercelConfig();
    expect(config.regions).toEqual([ALLOWED_REGION]);
  });

  it("vercel.json's per-function entries never override the project-level region", () => {
    const config = readVercelConfig();
    const offenders = Object.entries(config.functions ?? {}).filter(
      ([, cfg]) => cfg.regions !== undefined,
    );
    expect(offenders).toEqual([]);
  });

  it("no route or page in app/ sets preferredRegion, runtime, or regions to anything but the allowed value", () => {
    const offenders: string[] = [];
    for (const relativePath of gitLsFiles("app")) {
      const code = readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");

      const regionMatch = code.match(/export\s+const\s+preferredRegion\s*=\s*(.+?);/);
      if (regionMatch && !regionMatch[1].includes(ALLOWED_REGION)) {
        offenders.push(`${relativePath}: preferredRegion = ${regionMatch[1]}`);
      }

      const runtimeMatch = code.match(/export\s+const\s+runtime\s*=\s*(.+?);/);
      if (runtimeMatch) {
        offenders.push(`${relativePath}: runtime = ${runtimeMatch[1]} (Edge runs globally, not a pinned region)`);
      }

      const regionsMatch = code.match(/export\s+const\s+regions\s*=\s*(.+?);/);
      if (regionsMatch && !regionsMatch[1].includes(ALLOWED_REGION)) {
        offenders.push(`${relativePath}: regions = ${regionsMatch[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
