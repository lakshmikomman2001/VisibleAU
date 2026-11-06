/**
 * One Share of Voice (7 Nov) -- every surface reads share of voice from lib/visibility/share-of-voice.ts:
 * the brand's verified everyday mentions against its configured competitors' mentions in the same
 * answers. The old definition (the brand against every site the answers cited, written to
 * share_of_voice_snapshots by lib/visibility/sov-calculator.ts on audit.complete) is retired, and
 * nothing computes a share any other way.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const COUNTER = "lib/visibility/share-of-voice.ts";
const DISPLAY = "lib/visibility/share-of-voice-display.ts";

const sources = execFileSync("git", ["ls-files", "lib", "app", "components", "inngest"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f) && existsSync(f));

/** The file's code without its comments, so a comment naming an old function isn't a use of it. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const offenders = (test: (file: string, text: string) => boolean) =>
  sources.filter((f) => test(f, code(f)));

describe("one Share of Voice counter", () => {
  it("the old definition is gone", () => {
    expect(existsSync("lib/visibility/sov-calculator.ts")).toBe(false);
    expect(existsSync("inngest/functions/calculate-share-of-voice.ts")).toBe(false);
    const RETIRED =
      /\b(calculateShareOfVoice|groupCitationsByEngine|aggregateShareOfVoice|calculateShareOfVoiceFn|brandMentionCount|competitorMentionCount|totalMentionCount)\b/;
    expect(offenders((f, text) => !f.startsWith("db/") && RETIRED.test(text))).toEqual([]);
  });

  it("nothing reads share_of_voice_snapshots (the table is kept, unread)", () => {
    expect(
      offenders((_f, text) => /shareOfVoiceSnapshots|share_of_voice_snapshots/.test(text)),
    ).toEqual([]);
  });

  it("only the counter counts competitor mentions", () => {
    expect(
      offenders((f, text) => f !== COUNTER && /\bcountCompetitorMentions\b/.test(text)),
    ).toEqual(["lib/audit/competitor-mentions.ts"]);
  });

  it("a file that shows a share gets it from the counter, and never works one out itself", () => {
    const usesShares = (text: string) => /\b(sharePct|brandSharePct)\b/.test(text);
    const importsCounter = (text: string) =>
      /from "@\/lib\/visibility\/share-of-voice(-display)?"/.test(text);
    expect(
      offenders(
        (f, text) => f !== COUNTER && f !== DISPLAY && usesShares(text) && !importsCounter(text),
      ),
    ).toEqual([]);
    // A share assigned from a division anywhere but the counter.
    expect(
      offenders((f, text) => f !== COUNTER && /\b\w*[sS]harePct\s*[:=][^,;\n]*\/(?!\/)/.test(text)),
    ).toEqual([]);
  });

  it("the counter has exactly one place that divides mentions into a share", () => {
    const text = code(COUNTER);
    expect(text.match(/\/ total\b/g)).toHaveLength(1);
    expect(text).toMatch(/function shareOf\(mentions: number, total: number\)/);
  });
});
