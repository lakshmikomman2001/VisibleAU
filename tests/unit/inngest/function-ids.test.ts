/**
 * N13 (LLD section 4): the Inngest app id `visibleau` and every existing function id stay as they are; functions are
 * only ever added. A renamed id is a new function to Inngest -- the old one's in-flight runs and history are orphaned
 * -- so this snapshot lists every id the serve route registers. Adding a function adds its id here (and a resync);
 * never rename or remove one.
 *
 * S01B part 1 added `refresh-enhanced-checks` (LLD amendment 49). The 47 ids before it are S01's, as pushed
 * (`bb5248d5`).
 */
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourceFiles, sourceText } from "@/tests/helpers/source-files";

const FUNCTION_IDS = [
  "aggregate-visibility-trend",
  "audit-data-retention",
  "audit-entity-home",
  "audit-linkedin-presence",
  "audit-schedules-cron",
  "audit-youtube-presence",
  "build-citation-source-intelligence",
  "bulk-reaudit-orchestrate",
  "calculate-topical-gaps",
  "capture-evidence-snapshot",
  "check-cross-platform-consensus",
  "classify-citation-sources",
  "classify-existing-brands",
  "classify-on-brand-create",
  "cleanup-orphan-logos",
  "collect-google-surfaces",
  "content-structure-audit",
  "crawler-log-ingest",
  "deliver-webhook",
  "detect-drift",
  "detect-hallucinations",
  "fanout-webhooks",
  "ga4-push",
  "generate-content-draft",
  "generate-narrative-report",
  "generate-recommendations",
  "ingest-ai-referrals",
  "llmstxt-refresh",
  "notify-engine-total-failure",
  "notify-model-drift",
  "parse-crawler-log",
  "refresh-bot-ip-ranges",
  "refresh-enhanced-checks",
  "refresh-entity-score",
  "render-report-pdf",
  "run-audit",
  "run-comparison-prompts",
  "run-journey",
  "sample-audit-cleanup",
  "schedule-workflow-runs",
  "score-agent-readiness",
  "send-audit-complete-email",
  "send-scheduled-reports",
  "simulate-query-fan-out",
  "track-brand-web-mentions",
  "trigger-validation-reaudit",
  "verify-crawler-hits",
  "weekly-digest-cron",
];

const ROUTE = "app/api/webhooks/inngest/route.ts";

readSourcesBeforeAll([ROUTE, "inngest/functions", "lib/inngest/client.ts"]);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** Every function the serve route registers, with the file it's imported from. */
function registered(): Array<{ name: string; file: string }> {
  const route = stripComments(sourceText(ROUTE));
  const list = route.match(/functions:\s*\[([\s\S]*?)\]/);
  if (!list) throw new Error(`${ROUTE}: no functions list`);
  const names = list[1].match(/[A-Za-z_$][\w$]*/g) ?? [];
  return names.map((name) => {
    const imp = route.match(
      new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"@/([^"]+)"`),
    );
    if (!imp) throw new Error(`${ROUTE}: ${name} isn't imported`);
    return { name, file: `${imp[1]}.ts` };
  });
}

function functionId(name: string, file: string): string {
  const text = stripComments(sourceText(file));
  const at = text.search(new RegExp(`export const ${name}\\s*=\\s*inngest\\.createFunction\\(`));
  if (at < 0) throw new Error(`${file}: ${name} isn't an inngest.createFunction`);
  const id = text.slice(at).match(/\bid:\s*"([^"]+)"/);
  if (!id) throw new Error(`${file}: ${name} has no id`);
  return id[1];
}

describe("N13: Inngest ids", () => {
  it('the app id is "visibleau"', () => {
    expect(sourceText("lib/inngest/client.ts")).toMatch(/new Inngest\(\{\s*id:\s*"visibleau"/);
  });

  it("the serve route registers exactly these function ids: existing ones unchanged, new ones only added", () => {
    const ids = registered()
      .map(({ name, file }) => functionId(name, file))
      .sort();
    expect(ids).toEqual(FUNCTION_IDS);
  });

  it("every function defined under inngest/functions is registered (none defined and left unserved)", () => {
    const served = new Set(registered().map((r) => r.file));
    const defined = sourceFiles(["inngest/functions"])
      .filter((f) => /inngest\.createFunction\(/.test(stripComments(f.text)))
      .map((f) => f.path);
    expect(defined.filter((path) => !served.has(path))).toEqual([]);
  });
});
