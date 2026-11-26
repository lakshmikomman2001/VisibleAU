/**
 * S02 part 0 (LLD backlog "Serve manifest and invariants script"): scripts/qa/inngest-serve-manifest.txt lists the
 * functions the Inngest serve route registers, by variable name, for scripts/qa/sprint9-invariants.sh A3 and the
 * production endpoint check that counts it. It had drifted (a retired function listed, three missing) and A3 read the
 * array's comment words as names. N13 itself (ids only ever added) is tests/unit/inngest/function-ids.test.ts; this
 * keeps the manifest equal to the array, so a new function updates both in the same commit.
 */
import { describe, expect, it } from "vitest";
import { sourceText } from "@/tests/helpers/source-files";

const SERVE = "app/api/webhooks/inngest/route.ts";
const MANIFEST = "scripts/qa/inngest-serve-manifest.txt";

/** The serve() array's names, comments ignored -- what A3 extracts. */
function served(): string[] {
  const code = sourceText(SERVE);
  const start = code.indexOf("functions: [");
  const end = code.indexOf("]", start);
  expect(start, "serve() functions array").toBeGreaterThan(0);
  return code
    .slice(start + "functions: [".length, end)
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .flatMap((line) => line.match(/[A-Za-z][A-Za-z0-9]+/g) ?? [])
    .sort();
}

describe("the Inngest serve manifest", () => {
  it("lists exactly the functions serve() registers, once each", () => {
    const manifest = sourceText(MANIFEST)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
    expect(manifest).toEqual(served());
    expect(new Set(manifest).size).toBe(manifest.length);
  });

  it("serve() registers one function per function id in the N13 snapshot (48 since S01B)", () => {
    expect(served()).toHaveLength(48);
  });
});
