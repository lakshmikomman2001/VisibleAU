/**
 * Google AI surfaces, Phase 1, part 2 -- lib/serp/dataforseo.ts maps DataForSEO's real responses (the 11 Nov
 * live sample, tests/fixtures/google-surfaces/dataforseo/) into what Vunnara stores: shown or not, the answer,
 * the cited links in order with Google's own links flagged, the Google domain and location it reports, the
 * cost it reports, and its errors (one retryable, one final).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DataForSeoProvider,
  isGoogleLink,
  parseDataForSeoResult,
  pollOfTask,
} from "@/lib/serp/dataforseo";
import {
  recordedDataForSeoFetch,
  recordedFixture,
  recordedQuestions,
} from "@/tests/helpers/dataforseo-recorded";

type Json = Record<string, unknown>;
const resultOf = (name: string) =>
  ((recordedFixture(name).tasks as Json[])[0].result as Json[])[0] as Json;
const taskOf = (name: string) => (recordedFixture(name).tasks as Json[])[0];

const TARGET = { locationCode: 9071744, device: "desktop" as const, languageCode: "en" as const };

beforeEach(() => {
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
});
afterEach(() => vi.unstubAllEnvs());

describe("parseDataForSeoResult: recorded answers", () => {
  it("an AI Overview with Google's own links: shown, 6 links in order, 4 of them Google's", () => {
    const a = parseDataForSeoResult(resultOf("aio-task-get-q01.json"));
    expect(a.shown).toBe(true);
    expect(a.answerText?.length).toBeGreaterThan(200);
    expect(a.citedLinks.map((l) => l.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(a.citedLinks.filter((l) => l.googleLink)).toHaveLength(4);
    expect(a.citedLinks.filter((l) => !l.googleLink).map((l) => l.domain)).toEqual([
      "inthesuburbs.com.au",
      "bestplumbers.com",
    ]);
    expect(a.seDomain).toBe("google.com.au");
    expect(a.reportedLocationCode).toBe(9071744);
    expect(a.fetchedAt).toBe("2026-11-11T04:58:25.000Z");
  });

  it("no AI Overview: the ai_overview item is simply absent (organic and local pack still there)", () => {
    const r = resultOf("aio-task-get-q07.json");
    expect(r.item_types).not.toContain("ai_overview");
    expect(r.item_types).toContain("local_pack");
    const a = parseDataForSeoResult(r);
    expect(a).toMatchObject({
      shown: false,
      answerText: null,
      citedLinks: [],
      seDomain: "google.com.au",
    });
  });

  it("a branded AI Overview: names Omega and cites its site, and a different business's", () => {
    const a = parseDataForSeoResult(resultOf("aio-task-get-q11.json"));
    expect(a.answerText).toMatch(/Omega Services/);
    const domains = a.citedLinks.map((l) => l.domain);
    expect(domains).toContain("omegaservices.com.au");
    expect(domains).toContain("omega-plumbing.com.au");
    expect(a.citedLinks.some((l) => l.googleLink)).toBe(false);
  });

  it("AI Mode: answered on google.com, at the same location code", () => {
    const a = parseDataForSeoResult(resultOf("aim-task-get-q13.json"));
    expect(a.shown).toBe(true);
    expect(a.seDomain).toBe("google.com");
    expect(a.reportedLocationCode).toBe(9071744);
    expect(a.citedLinks.map((l) => [l.domain, l.googleLink])).toEqual([
      ["omegaservices.com.au", false],
      ["google.com", true],
    ]);
    const all = parseDataForSeoResult(resultOf("aim-task-get-q01.json"));
    expect(all.citedLinks.every((l) => l.googleLink)).toBe(true);
  });

  it("Google's own links are recognised by domain, and a business's aren't", () => {
    expect(isGoogleLink("www.google.com")).toBe(true);
    expect(isGoogleLink("google.com.au")).toBe(true);
    expect(isGoogleLink("maps.google.com")).toBe(true);
    expect(isGoogleLink("omegaservices.com.au")).toBe(false);
    expect(isGoogleLink("googleplumbing.com.au")).toBe(false);
  });
});

describe("pollOfTask: done and the provider's errors", () => {
  it("done: the answer, the cost it reports, and only the AI answer item kept as the raw response", () => {
    const poll = pollOfTask(taskOf("aio-task-get-q01.json"), {});
    expect(poll.state).toBe("done");
    if (poll.state !== "done") return;
    expect(poll.costUsd).toBe(0.0012);
    const raw = poll.raw as { result: { items: { type: string }[] } };
    expect(raw.result.items.map((i) => i.type)).toEqual(["ai_overview"]);
  });

  it("40401 Task Not Found (recorded): an error worth one more attempt", () => {
    const poll = pollOfTask(taskOf("aio-task-get-unknown-task.json"), {});
    expect(poll).toMatchObject({
      state: "error",
      statusCode: 40401,
      message: "Task Not Found.",
      retryable: true,
    });
  });

  it("40004 (recorded): final", () => {
    const poll = pollOfTask(taskOf("aim-task-get-unknown-task.json"), {});
    expect(poll).toMatchObject({ state: "error", statusCode: 40004, retryable: false });
  });
});

describe("DataForSeoProvider: the requests it makes", () => {
  it("posts AI Overviews with google.com.au, 10 results and async overviews; AI Mode without se_domain", async () => {
    const { fetchImpl, calls } = recordedDataForSeoFetch();
    const provider = new DataForSeoProvider(fetchImpl);
    const questions = recordedQuestions();
    const items = questions.map((question, promptIndex) => ({ promptIndex, question }));
    const aio = await provider.postTasks("google_ai_overviews", items, TARGET, 1);
    const aim = await provider.postTasks("google_ai_mode", items, TARGET, 1);
    expect(aio.map((t) => [t.statusCode, t.costUsd, typeof t.taskId])).toEqual(
      questions.map(() => [20100, 0.0012, "string"]),
    );
    expect(aim.every((t) => t.statusCode === 20100 && t.costUsd === 0.0012)).toBe(true);

    expect(calls[0].url).toBe("https://api.dataforseo.com/v3/serp/google/organic/task_post");
    expect(calls[0].authorized).toBe(true);
    expect((calls[0].body as Json[])[0]).toMatchObject({
      keyword: questions[0],
      location_code: 9071744,
      language_code: "en",
      device: "desktop",
      os: "windows",
      priority: 1,
      se_domain: "google.com.au",
      depth: 10,
      load_async_ai_overview: true,
      tag: "0",
    });
    expect(calls[1].url).toBe("https://api.dataforseo.com/v3/serp/google/ai_mode/task_post");
    expect((calls[1].body as Json[])[0]).not.toHaveProperty("se_domain");
    expect((calls[1].body as Json[])[0]).not.toHaveProperty("load_async_ai_overview");
  });

  it("fetches a task by id and maps it", async () => {
    const { fetchImpl, calls } = recordedDataForSeoFetch();
    const provider = new DataForSeoProvider(fetchImpl);
    const id = taskOf("aim-task-get-q13.json").id as string;
    const poll = await provider.getTask("google_ai_mode", id);
    expect(poll.state).toBe("done");
    expect(calls[0].url).toBe(
      `https://api.dataforseo.com/v3/serp/google/ai_mode/task_get/advanced/${id}`,
    );
    expect(calls[0].method).toBe("GET");
  });

  it("an unreachable provider is a retryable error, with no header or credential in its message", async () => {
    const { fetchImpl } = recordedDataForSeoFetch({ unreachable: true });
    const poll = await new DataForSeoProvider(fetchImpl).getTask("google_ai_overviews", "x");
    expect(poll).toMatchObject({ state: "error", statusCode: 50000, retryable: true });
    if (poll.state === "error") expect(poll.message).not.toMatch(/test-login|test-password|Basic/);
  });

  it("no credentials: no request at all", async () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "");
    const { fetchImpl, calls } = recordedDataForSeoFetch();
    const posted = await new DataForSeoProvider(fetchImpl).postTasks(
      "google_ai_mode",
      [{ promptIndex: 0, question: recordedQuestions()[0] }],
      TARGET,
      1,
    );
    expect(calls).toEqual([]);
    expect(posted[0]).toMatchObject({ taskId: null, statusCode: 40100 });
  });
});
