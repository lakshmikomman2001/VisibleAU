/**
 * Google AI follow-ups (12 Nov), part 7 -- keep only what's used of the provider's answer. raw_response held
 * the whole AI answer item of every finished task (16 KB on average for the 11 Nov sample's 26). Now:
 * - a finished task keeps only the fields the display and the mention check read (lib/serp/dataforseo.ts
 *   answerForStorage): parsing what's kept gives exactly what parsing the whole answer gives, so the block
 *   renders the same; the shape is pinned by a golden (one real answer, kept);
 * - a failed task keeps the provider's whole answer, for the operator.
 * DataForSEO's REAL 11 Nov / 12 Nov answers (tests/fixtures/google-surfaces/dataforseo/).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleSearchAiSection } from "@/components/domain/audit/google-search-ai-section";
import {
  type GoogleQuestionResult,
  type GoogleSurfaceSummary,
  summarizeGoogleSurface,
} from "@/lib/audit/google-surfaces/summary";
import {
  answerForStorage,
  DataForSeoProvider,
  parseDataForSeoResult,
  pollOfTask,
} from "@/lib/serp/dataforseo";
import type { SurfaceAnswer } from "@/lib/serp/provider";
import { recordedDataForSeoFetch, recordedFixture } from "@/tests/helpers/dataforseo-recorded";

type Json = Record<string, unknown>;
const FIXTURES = ["q01", "q07", "q11", "q13"].flatMap((q) => [
  `aio-task-get-${q}.json`,
  `aim-task-get-${q}.json`,
]);
const taskOf = (name: string) => (recordedFixture(name).tasks as Json[])[0];
const GOLDEN = join(
  process.cwd(),
  "tests/unit/google-surfaces/__golden__/stored-answer-aio-q11.json",
);

beforeEach(() => {
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
});
afterEach(() => vi.unstubAllEnvs());

describe("a finished task keeps only what the display and the mention check use", () => {
  it.each(
    FIXTURES,
  )("%s: parsing what's kept gives exactly what parsing the whole answer gives", (name) => {
    const task = taskOf(name);
    const kept = answerForStorage(task) as { result: Json };
    expect(parseDataForSeoResult(kept.result)).toEqual(
      parseDataForSeoResult((task.result as Json[])[0]),
    );
    expect(JSON.stringify(kept).length).toBeLessThan(JSON.stringify(task).length);
  });

  it.each(FIXTURES)("%s: only the listed fields", (name) => {
    const kept = answerForStorage(taskOf(name)) as {
      result: { items: Json[] } & Json;
    } & Json;
    expect(Object.keys(kept).sort()).toEqual([
      "cost",
      "id",
      "result",
      "status_code",
      "status_message",
    ]);
    expect(Object.keys(kept.result).sort()).toEqual([
      "datetime",
      "items",
      "language_code",
      "location_code",
      "se_domain",
    ]);
    for (const item of kept.result.items) {
      expect(item.type).toBe("ai_overview");
      expect(
        Object.keys(item).every((k) => ["type", "markdown", "items", "references"].includes(k)),
      ).toBe(true);
      for (const ref of item.references as Json[]) {
        expect(Object.keys(ref).sort()).toEqual(["domain", "title", "url"]);
      }
    }
    // None of the page's other results.
    expect(JSON.stringify(kept)).not.toMatch(
      /"type":"(organic|local_pack|images|people_also_ask)"/,
    );
  });

  it("the shape, pinned: one real answer (AI Overview, question 11), as stored", () => {
    const kept = answerForStorage(taskOf("aio-task-get-q11.json"));
    if (process.env.UPDATE_GOLDEN === "1")
      writeFileSync(GOLDEN, `${JSON.stringify(kept, null, 2)}\n`);
    expect(kept).toEqual(JSON.parse(readFileSync(GOLDEN, "utf8")));
  });

  it("the block renders the same from what's kept as from the whole answers", () => {
    const render = (parse: (name: string) => SurfaceAnswer) => {
      const rows = (["google_ai_overviews", "google_ai_mode"] as const).map((surface) =>
        summarizeGoogleSurface({
          surface,
          status: "complete",
          directories: [],
          results: ["q01", "q07", "q11", "q13"].map((q, i): GoogleQuestionResult => {
            const a = parse(
              `${surface === "google_ai_overviews" ? "aio" : "aim"}-task-get-${q}.json`,
            );
            return {
              promptIndex: i,
              prompt: q,
              isBranded: i >= 2,
              outcome: a.shown ? "shown" : "not_shown",
              reason: null,
              mentioned: false,
              verified: false,
              links: a.citedLinks.length,
              googleLinks: a.citedLinks.filter((l) => l.googleLink).length,
            };
          }),
        }),
      );
      const summary: GoogleSurfaceSummary = {
        status: "complete",
        statusReason: null,
        location: { code: 9071744, label: "2153 NSW", kind: "postcode", precise: true, note: null },
        device: "desktop",
        labelLine: "2153 NSW · desktop · 11 Nov 2026",
        locationNote: null,
        countInHeadline: false,
        provider: "dataforseo",
        ranAt: "2026-11-11T05:00:00.000Z",
        rows,
      };
      return renderToStaticMarkup(<GoogleSearchAiSection auditId="a" summary={summary} />);
    };
    const whole = render((name) => parseDataForSeoResult((taskOf(name).result as Json[])[0]));
    const kept = render((name) =>
      parseDataForSeoResult((answerForStorage(taskOf(name)) as { result: Json }).result),
    );
    expect(kept).toBe(whole);
    expect(kept).toContain("AI Overviews: shown for 3 of 4 questions");
  });
});

describe("a failed task keeps the provider's whole answer, for the operator", () => {
  it("a fetch the provider failed (its real 40401 'Task Not Found.')", () => {
    const answer = recordedFixture("aio-task-get-unknown-task.json") as Json & { tasks: Json[] };
    const poll = pollOfTask(answer.tasks[0] as never, answer as never);
    expect(poll.state).toBe("error");
    if (poll.state === "error") expect(poll.raw).toEqual(answer);
  });

  it("a refused post (its real 401 / 40100): every refused task keeps the answer", async () => {
    const { fetchImpl } = recordedDataForSeoFetch({ rejected: true });
    const posted = await new DataForSeoProvider(fetchImpl).postTasks(
      "google_ai_mode",
      [{ promptIndex: 0, question: "a question" }],
      { locationCode: 9071744, device: "desktop", languageCode: "en" },
      1,
    );
    const { tasks: _none, ...answer } = recordedFixture("rejected-login-40100.json");
    expect(posted[0].raw).toEqual(answer);
  });

  it("an accepted post keeps nothing extra", async () => {
    const { fetchImpl } = recordedDataForSeoFetch();
    const posted = await new DataForSeoProvider(fetchImpl).postTasks(
      "google_ai_overviews",
      [
        {
          promptIndex: 0,
          question: (taskOf("aio-task-get-q01.json").data as { keyword: string }).keyword,
        },
      ],
      { locationCode: 9071744, device: "desktop", languageCode: "en" },
      1,
    );
    expect(posted[0].taskId).not.toBeNull();
    expect(posted[0].raw).toBeUndefined();
  });
});
