/**
 * Google AI surfaces, Phase 1 -- a fetch that answers lib/serp/dataforseo.ts with DataForSEO's REAL responses
 * from the 11 Nov live sample (tests/fixtures/google-surfaces/dataforseo/, trimmed: fields dropped, nothing
 * changed or invented). No call leaves the machine.
 *
 * - task_post: each posted question gets its recorded task (matched by its text), in the order posted.
 * - task_get/advanced/<id>: the recorded result for that task id.
 * - `lostOnce`: those task ids first answer with the provider's real "40401 Task Not Found." response
 *   (recorded 11 Nov with a free task_get of an unknown id), then their result -- a billed retry.
 * - `unreachable`: every call fails as a network error does.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "tests/fixtures/google-surfaces/dataforseo");

type Json = Record<string, unknown>;
interface Task {
  id: string;
  data: { keyword: string };
}

export function recordedFixture(name: string): Json {
  return JSON.parse(readFileSync(join(DIR, name), "utf8")) as Json;
}

/** The recorded questions, in the sample's order (q01, q07, q11, q13). */
export function recordedQuestions(): string[] {
  return ((recordedFixture("aio-task-post.json").tasks as Task[]) ?? []).map((t) => t.data.keyword);
}

export interface RecordedCall {
  method: string;
  url: string;
  authorized: boolean;
  body: unknown;
}

export function recordedDataForSeoFetch(
  options: { lostOnce?: string[]; unreachable?: boolean } = {},
) {
  const calls: RecordedCall[] = [];
  const gets = new Map<string, Json>();
  for (const f of readdirSync(DIR).filter((n) => /task-get-q\d+\.json$/.test(n))) {
    const json = recordedFixture(f);
    gets.set(((json.tasks as Task[])[0] as Task).id, json);
  }
  const posts = {
    organic: recordedFixture("aio-task-post.json"),
    ai_mode: recordedFixture("aim-task-post.json"),
  };
  const lost = new Set(options.lostOnce ?? []);
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({
      method,
      url,
      authorized: /^Basic \S+$/.test(headers.get("Authorization") ?? ""),
      body,
    });
    if (options.unreachable) throw new TypeError("fetch failed");

    const surface = url.includes("/serp/google/organic/") ? "organic" : "ai_mode";
    if (url.endsWith("/task_post")) {
      const recorded = posts[surface];
      const tasks = (body as { keyword: string }[]).map((item) => {
        const task = (recorded.tasks as Task[]).find((t) => t.data.keyword === item.keyword);
        if (!task) throw new Error(`no recorded ${surface} task for "${item.keyword}"`);
        return task;
      });
      const cost = tasks.reduce(
        (sum, t) => sum + Number((t as unknown as { cost: number }).cost),
        0,
      );
      return Response.json({ ...recorded, cost, tasks_count: tasks.length, tasks });
    }
    const id = url.split("/").pop() ?? "";
    if (lost.has(id)) {
      lost.delete(id);
      return Response.json(
        recordedFixture(
          surface === "organic"
            ? "aio-task-get-unknown-task.json"
            : "aim-task-get-unknown-task.json",
        ),
      );
    }
    const json = gets.get(id);
    if (!json) throw new Error(`no recorded result for task ${id}`);
    return Response.json(json);
  }) as typeof fetch;
  return { fetchImpl, calls };
}
