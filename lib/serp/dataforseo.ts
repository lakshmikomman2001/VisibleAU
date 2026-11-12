import type { GoogleSurface } from "@/lib/governance/google-surfaces";
import { dataForSeoCredentials } from "./credentials";
import { NO_PROVIDER_ANSWER } from "./dataforseo-errors";
import type {
  CitedLink,
  GoogleSurfaceProvider,
  LiveResult,
  PostedTask,
  SurfaceAnswer,
  SurfaceTarget,
  TaskPoll,
} from "./provider";

/**
 * Google AI surfaces, Phase 1, part 2 -- DataForSEO (Sri's choice, 8 Nov; docs/research/google-ai-surfaces.md
 * sections 1.2 and 8). Two endpoints per surface:
 * - AI Overviews: /v3/serp/google/organic/task_post (and /live/advanced), google.com.au, 10 results, and
 *   load_async_ai_overview: true -- every one of the 11 overviews in the 11 Nov sample loaded
 *   asynchronously, so without it there'd be none;
 * - AI Mode: /v3/serp/google/ai_mode/task_post (and /live/advanced); it has no se_domain and runs on
 *   google.com with gl=AU.
 * Both take the same location_code (no AI Mode-specific list exists: 404). "No AI Overview" is the
 * ai_overview item missing from `items`, with no flag (2 of 13 in the sample).
 *
 * The credentials go only into the Authorization header and are never logged or put in an error.
 */

const API = "https://api.dataforseo.com/v3";

/** Task Handed / Task In Queue (and the rest of 406xx): not done yet. */
const isPending = (code: number) => code >= 40600 && code < 40700;

/**
 * Worth one more attempt (DataForSEO's errors appendix): 40101 "search engine error after retries",
 * 40401 "Task Not Found." for a task it just accepted (recorded 11 Nov), any 5xxxx internal or service
 * error, and no answer at all (NO_PROVIDER_ANSWER: the request timed out or couldn't connect). Each attempt
 * is billed as the provider reports; everything else (an invalid field, 40102 "no search results", 40004
 * "this id is used by another function", an account problem) is final.
 */
const isRetryable = (code: number) =>
  code === NO_PROVIDER_ANSWER ||
  code === 40101 ||
  code === 40401 ||
  (code >= 50000 && code < 60000);

type Json = Record<string, unknown>;
interface DfsTask {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  data?: Json;
  result?: Json[] | null;
}
interface DfsResponse {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: DfsTask[];
}

function endpoint(surface: GoogleSurface, kind: "task_post" | "task_get" | "live"): string {
  const base = surface === "google_ai_overviews" ? "/serp/google/organic" : "/serp/google/ai_mode";
  if (kind === "task_post") return `${base}/task_post`;
  if (kind === "task_get") return `${base}/task_get/advanced`;
  return `${base}/live/advanced`;
}

function taskBody(
  surface: GoogleSurface,
  question: string,
  target: SurfaceTarget,
  priority?: 1 | 2,
): Json {
  const common: Json = {
    keyword: question,
    location_code: target.locationCode,
    language_code: target.languageCode,
    device: target.device,
    os: target.device === "mobile" ? "android" : "windows",
  };
  if (priority !== undefined) common.priority = priority;
  return surface === "google_ai_overviews"
    ? { ...common, se_domain: "google.com.au", depth: 10, load_async_ai_overview: true }
    : common;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** google.com, www.google.com, google.com.au, maps.google.com: Google's own pages, not a business. */
export function isGoogleLink(domain: string): boolean {
  return /(^|\.)google\.[a-z.]+$/i.test(domain.replace(/^www\./, ""));
}

function walk(node: unknown, visit: (o: Json) => void) {
  if (Array.isArray(node)) for (const n of node) walk(n, visit);
  else if (node && typeof node === "object") {
    visit(node as Json);
    for (const v of Object.values(node as Json)) walk(v, visit);
  }
}

/** "2026-11-11 04:57:22 +00:00" -> ISO. */
function isoOf(datetime: unknown): string | null {
  if (typeof datetime !== "string") return null;
  const d = new Date(datetime.replace(" ", "T").replace(" ", ""));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** One finished task's result, as Vunnara stores it. */
export function parseDataForSeoResult(result: Json | null | undefined): SurfaceAnswer {
  const items = Array.isArray(result?.items) ? (result.items as unknown[]) : [];
  const overview = items.find(
    (i): i is Json => !!i && typeof i === "object" && (i as Json).type === "ai_overview",
  );
  const seDomain = typeof result?.se_domain === "string" ? result.se_domain : null;
  const reportedLocationCode =
    typeof result?.location_code === "number" ? result.location_code : null;
  const fetchedAt = isoOf(result?.datetime);
  if (!overview) {
    return {
      shown: false,
      answerText: null,
      citedLinks: [],
      seDomain,
      reportedLocationCode,
      fetchedAt,
    };
  }
  const links: CitedLink[] = [];
  const seen = new Set<string>();
  walk(overview, (o) => {
    if (!Array.isArray(o.references)) return;
    for (const r of o.references as Json[]) {
      const url = typeof r?.url === "string" ? r.url : null;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      // As the provider reports it ("www.inthesuburbs.com.au"), without "www." like every stored source.
      const domain = (typeof r.domain === "string" && r.domain ? r.domain : hostOf(url))
        .toLowerCase()
        .replace(/^www\./, "");
      links.push({
        url,
        domain,
        title: typeof r.title === "string" ? r.title : null,
        position: links.length + 1,
        googleLink: isGoogleLink(domain) || isGoogleLink(hostOf(url)),
      });
    }
  });
  const markdown = typeof overview.markdown === "string" ? overview.markdown.trim() : "";
  const elementText = (Array.isArray(overview.items) ? (overview.items as Json[]) : [])
    .map((e) =>
      typeof e?.markdown === "string" ? e.markdown : typeof e?.text === "string" ? e.text : "",
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const answerText = markdown || elementText || null;
  return {
    shown: answerText !== null || links.length > 0,
    answerText,
    citedLinks: links,
    seDomain,
    reportedLocationCode,
    fetchedAt,
  };
}

/** What's kept of a task: its status and cost, the result's own fields, and only the AI answer item. */
export function rawForStorage(task: DfsTask): Json {
  const result = task.result?.[0] ?? null;
  return {
    id: task.id ?? null,
    status_code: task.status_code ?? null,
    status_message: task.status_message ?? null,
    cost: task.cost ?? null,
    data: task.data ?? null,
    result: result
      ? {
          ...Object.fromEntries(Object.entries(result).filter(([k]) => k !== "items")),
          items: (Array.isArray(result.items) ? (result.items as Json[]) : []).filter(
            (i) => i?.type === "ai_overview",
          ),
        }
      : null,
  };
}

/** A finished, pending or failed task, from a task_get or live answer. */
export function pollOfTask(task: DfsTask | undefined, top: DfsResponse): TaskPoll {
  const statusCode = Number(task?.status_code ?? top.status_code ?? 0);
  const message = String(
    task?.status_message ?? top.status_message ?? "No answer from the provider.",
  );
  if (isPending(statusCode)) return { state: "pending", statusCode };
  if (statusCode === 20000 && task) {
    return {
      state: "done",
      statusCode,
      answer: parseDataForSeoResult(task.result?.[0]),
      costUsd: typeof task.cost === "number" ? task.cost : null,
      raw: rawForStorage(task),
    };
  }
  return {
    state: "error",
    statusCode,
    message,
    retryable: isRetryable(statusCode),
    raw: task
      ? rawForStorage(task)
      : { status_code: top.status_code ?? null, status_message: top.status_message ?? null },
  };
}

export class DataForSeoProvider implements GoogleSurfaceProvider {
  readonly name = "dataforseo";

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<DfsResponse> {
    const creds = dataForSeoCredentials();
    if (!creds)
      return { status_code: 40100, status_message: "The provider's credentials aren't set." };
    const auth = `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString("base64")}`;
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}`, {
        method,
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      // No answer, so no status code of the provider's (NO_PROVIDER_ANSWER; stored as null). The request's
      // own error never carries the headers; only its kind is kept.
      const kind = err instanceof Error ? err.name : "error";
      return {
        status_code: NO_PROVIDER_ANSWER,
        status_message:
          kind === "TimeoutError" || kind === "AbortError"
            ? `No answer from the provider within 60 seconds (${kind}).`
            : `The provider couldn't be reached (${kind}).`,
      };
    }
    try {
      return (await res.json()) as DfsResponse;
    } catch {
      // Not the provider's JSON (a gateway's page): no status code of its own either.
      return {
        status_code: NO_PROVIDER_ANSWER,
        status_message: `HTTP ${res.status} without the provider's JSON answer.`,
      };
    }
  }

  async postTasks(
    surface: GoogleSurface,
    items: { promptIndex: number; question: string }[],
    target: SurfaceTarget,
    priority: 1 | 2,
  ): Promise<PostedTask[]> {
    if (items.length === 0) return [];
    const body = items.map((item) => ({
      ...taskBody(surface, item.question, target, priority),
      tag: String(item.promptIndex),
    }));
    const res = await this.call("POST", endpoint(surface, "task_post"), body);
    const tasks = res.tasks ?? [];
    return items.map((item, i) => {
      const task =
        tasks.find((t) => String(t.data?.tag ?? "") === String(item.promptIndex)) ?? tasks[i];
      const statusCode = Number(task?.status_code ?? res.status_code ?? 0);
      return {
        promptIndex: item.promptIndex,
        taskId: statusCode === 20100 && task?.id ? task.id : null,
        statusCode,
        message: String(
          task?.status_message ?? res.status_message ?? "No answer from the provider.",
        ),
        costUsd: typeof task?.cost === "number" ? task.cost : null,
      };
    });
  }

  async getTask(surface: GoogleSurface, taskId: string): Promise<TaskPoll> {
    const res = await this.call(
      "GET",
      `${endpoint(surface, "task_get")}/${encodeURIComponent(taskId)}`,
    );
    return pollOfTask(res.tasks?.[0], res);
  }

  private async live(
    surface: GoogleSurface,
    question: string,
    target: SurfaceTarget,
  ): Promise<LiveResult> {
    const res = await this.call("POST", endpoint(surface, "live"), [
      taskBody(surface, question, target),
    ]);
    const task = res.tasks?.[0];
    return {
      taskId: task?.id ?? null,
      costUsd: typeof task?.cost === "number" ? task.cost : null,
      poll: pollOfTask(task, res),
    };
  }

  aiOverview(question: string, target: SurfaceTarget): Promise<LiveResult> {
    return this.live("google_ai_overviews", question, target);
  }

  aiMode(question: string, target: SurfaceTarget): Promise<LiveResult> {
    return this.live("google_ai_mode", question, target);
  }
}
