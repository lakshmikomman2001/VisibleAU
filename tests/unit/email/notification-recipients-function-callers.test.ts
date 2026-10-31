import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
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
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

/** The SQL that defines, checks or drops it, and the one caller. */
const ALLOWED = [
  /^lib\/email\/recipients\.ts$/,
  /^db\/migrations\/0107_app_notification_recipients\.sql$/,
  /^db\/prod-fixes\/0107-app-notification-recipients-[\w-]+\.sql$/,
];

function listCodeFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listCodeFiles(full));
    else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(entry) && !/\.(test|spec)\.\w+$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function rootFiles(): string[] {
  return readdirSync(ROOT)
    .filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f))
    .map((f) => join(ROOT, f))
    .filter((f) => statSync(f).isFile());
}

describe("app_notification_recipients() has one caller", () => {
  const files = [...CODE_DIRS.flatMap((d) => listCodeFiles(join(ROOT, d))), ...rootFiles()];
  const referencing = files
    .filter((f) => readFileSync(f, "utf-8").includes(FUNCTION))
    .map((f) => relative(ROOT, f).split(sep).join("/"))
    .sort();

  it("scans the app's code (sanity check the scan itself runs)", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("lib/email/recipients.ts calls it", () => {
    expect(referencing).toContain("lib/email/recipients.ts");
  });

  it("no other code references it -- only its own migration and prod-fix files", () => {
    const unexpected = referencing.filter((f) => !ALLOWED.some((re) => re.test(f)));
    expect(unexpected).toEqual([]);
  });
});
