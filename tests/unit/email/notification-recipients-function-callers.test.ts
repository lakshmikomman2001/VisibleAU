import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * B1 (Sri, 31 Oct): app_notification_recipients() (migration 0107) is a
 * SECURITY DEFINER function -- it reads past RLS to find the current
 * org's owner and admins, including those invited from another org.
 * Only the notification resolver may call it; anything else that wants
 * member emails needs its own review.
 */
const FUNCTION = "app_notification_recipients";
const ROOT = process.cwd();
const CODE_DIRS = ["app", "components", "lib", "inngest", "db", "scripts", "hooks", "middleware"];

/** The SQL that defines, checks or drops it, and the one caller. */
const ALLOWED = [
  /^lib\/email\/recipients\.ts$/,
  /^db\/migrations\/0107_app_notification_recipients\.sql$/,
  /^db\/prod-fixes\/0107-app-notification-recipients-[\w-]+\.sql$/,
];

/**
 * What git tracks, so it's what ships: untracked and ignored files (Sri's local copies
 * of prod-fix runs, under db/prod-fixes/email/) aren't code anyone runs. A file that
 * was deleted but not yet committed is skipped too.
 */
function trackedCodeFiles(): string[] {
  const tracked = execFileSync("git", ["ls-files", "--cached", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  })
    .split("\0")
    .filter(Boolean);
  return tracked.filter((file) => {
    const top = file.split("/")[0];
    const inScope = file.includes("/")
      ? CODE_DIRS.includes(top) && /\.(ts|tsx|js|mjs|cjs|sql)$/.test(file)
      : /\.(ts|tsx|js|mjs|cjs)$/.test(file);
    return inScope && !/\.(test|spec)\.\w+$/.test(file);
  });
}

function mentionsFunction(file: string): boolean {
  try {
    return readFileSync(join(ROOT, file), "utf-8").includes(FUNCTION);
  } catch {
    return false;
  }
}

describe("app_notification_recipients() has one caller", () => {
  const files = trackedCodeFiles();
  const referencing = files.filter(mentionsFunction).sort();

  it("scans the app's code (sanity check the scan itself runs)", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("lib/email/recipients.ts calls it", () => {
    expect(referencing).toContain("lib/email/recipients.ts");
  });

  it("doesn't scan what git doesn't track", () => {
    expect(files.some((file) => file.startsWith("db/prod-fixes/email/"))).toBe(false);
  });

  it("no other code references it -- only its own migration and prod-fix files", () => {
    const unexpected = referencing.filter((f) => !ALLOWED.some((re) => re.test(f)));
    expect(unexpected).toEqual([]);
  });
});
