/**
 * Task 15, item 5 -- every email that can be sent from an Inngest step
 * carries an idempotency key, so a replayed step can't send it twice
 * (email-replay.integration.test.ts proves what the key does). This
 * reads the sources so a new call site without one fails here, and so a
 * new Inngest function that sends email can't skip the check.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/** Each call's full argument text: from "name(" to its matching ")". */
function calls(source: string, name: RegExp): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(new RegExp(`${name.source}\\(`, "g"))) {
    const before = source.slice(Math.max(0, (match.index ?? 0) - 16), match.index);
    if (/function\s+$|import[^;]*$/.test(before)) continue;
    let depth = 0;
    let end = (match.index ?? 0) + match[0].length - 1;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")" && --depth === 0) break;
    }
    found.push(source.slice(match.index, end + 1));
  }
  return found;
}

const DIRECT_SENDERS = [
  "inngest/functions/send-audit-complete-email.ts",
  "inngest/functions/send-scheduled-reports.ts",
  "lib/digest/send.ts",
  "lib/communication/alert-composer.ts",
];
const ALERT_CALLERS = [
  "inngest/functions/detect-hallucinations.ts",
  "inngest/functions/audit-schedules-cron.ts",
  "inngest/functions/check-cross-platform-consensus.ts",
  "lib/audit/get-audit-prompts.ts",
];

describe("every email sent from an Inngest step has an idempotency key", () => {
  for (const file of DIRECT_SENDERS) {
    it(`${file}: every send passes idempotencyKey`, () => {
      const sends = calls(read(file), /\bsendEmail(?:OrThrow)?/);
      expect(sends.length).toBeGreaterThan(0);
      for (const call of sends) expect(call).toContain("idempotencyKey");
    });
  }

  for (const file of ALERT_CALLERS) {
    it(`${file}: every alert passes idempotencyBase`, () => {
      const alerts = calls(read(file), /\bsend\w+Alert/);
      expect(alerts.length).toBeGreaterThan(0);
      for (const call of alerts) expect(call).toContain("idempotencyBase");
    });
  }

  it("no Inngest function sends email outside the files above", () => {
    const covered = new Set([...DIRECT_SENDERS, ...ALERT_CALLERS]);
    const dir = resolve(ROOT, "inngest/functions");
    const senders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `inngest/functions/${f}`)
      .filter((f) =>
        /from "@\/lib\/(email\/send|communication\/alert-composer|digest\/send)"/.test(read(f)),
      );
    expect(senders.length).toBeGreaterThan(0);
    for (const file of senders) {
      if (file.endsWith("weekly-digest-cron.ts")) continue; // sends via lib/digest/send.ts
      expect(covered.has(file), file).toBe(true);
    }
  });
});
