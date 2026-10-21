/**
 * Audit reliability, Part C, item 7 -- sample-audit-cleanup.ts's
 * per-brand delete list was derived from lib/audit/run-audit-inline.ts's
 * own .insert() call sites (the only code path that ever writes data
 * for a __sample__ brand), not from memory. This statically re-derives
 * that same list from the runner's current source and cross-checks it
 * against the cleanup job's source, so a future table added to the
 * runner without updating the cleanup job fails HERE -- loudly, at
 * test time -- instead of building up another silent backlog the way
 * engine_call_failures did after Part A added it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RUNNER_SOURCE = readFileSync("lib/audit/run-audit-inline.ts", "utf8");
const CLEANUP_SOURCE = readFileSync("inngest/functions/sample-audit-cleanup.ts", "utf8");

// citations and audits are handled separately below -- audits IS the
// row being cleaned up (not a "child" of itself), and citations is
// asserted on explicitly alongside the others.
const EXPECTED_CHILD_TABLES = ["actionItems", "driftAlerts", "engineCallFailures", "citations"];

function tablesWrittenByRunner(source: string): Set<string> {
  const tables = new Set<string>();
  for (const m of source.matchAll(/\.insert\((\w+)\)/g)) {
    if (m[1] !== "audits") tables.add(m[1]);
  }
  return tables;
}

describe("sample-audit-cleanup.ts's delete list matches what run-audit-inline.ts actually writes", () => {
  it("every table run-audit-inline.ts inserts into (besides audits itself) is deleted by the cleanup job", () => {
    const written = tablesWrittenByRunner(RUNNER_SOURCE);
    expect(written.size).toBeGreaterThan(0); // the regex itself still matches something real

    for (const table of written) {
      expect(
        CLEANUP_SOURCE,
        `run-audit-inline.ts writes "${table}" -- sample-audit-cleanup.ts must delete it before deleting the brand`,
      ).toMatch(new RegExp(`\\.delete\\(${table}\\)`));
    }
  });

  it("the cleanup job's own expected table list has not silently shrunk", () => {
    // Guards the test above itself: if run-audit-inline.ts ever stopped
    // writing to one of these tables, the first assertion would stop
    // checking for it -- this pins the known-as-of-this-task set so
    // that kind of silent shrinkage is also caught.
    for (const table of EXPECTED_CHILD_TABLES) {
      expect(CLEANUP_SOURCE).toMatch(new RegExp(`\\.delete\\(${table}\\)`));
    }
  });

  it("deletes every child table before deleting audits, and audits before brands", () => {
    const auditsDeleteIdx = CLEANUP_SOURCE.indexOf(".delete(audits)");
    const brandsDeleteIdx = CLEANUP_SOURCE.indexOf(".delete(brands)");
    expect(auditsDeleteIdx).toBeGreaterThan(-1);
    expect(brandsDeleteIdx).toBeGreaterThan(auditsDeleteIdx);

    for (const table of EXPECTED_CHILD_TABLES) {
      if (table === "citations") continue; // ON DELETE CASCADE from audits -- order-independent, but still checked present above
      const idx = CLEANUP_SOURCE.indexOf(`.delete(${table})`);
      expect(idx, `${table} must be deleted`).toBeGreaterThan(-1);
      expect(idx, `${table} must be deleted before audits`).toBeLessThan(auditsDeleteIdx);
    }
  });

  it("runs the whole per-brand delete inside one transaction", () => {
    const txIdx = CLEANUP_SOURCE.indexOf("serviceDb.transaction(");
    const auditsDeleteIdx = CLEANUP_SOURCE.indexOf(".delete(audits)");
    const brandsDeleteIdx = CLEANUP_SOURCE.indexOf(".delete(brands)");
    expect(txIdx).toBeGreaterThan(-1);
    expect(auditsDeleteIdx).toBeGreaterThan(txIdx);
    expect(brandsDeleteIdx).toBeGreaterThan(txIdx);
  });
});
