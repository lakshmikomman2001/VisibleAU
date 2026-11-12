import type { GoogleSurface } from "@/lib/governance/google-surfaces";

/**
 * Google AI surfaces, Phase 1, part 2 -- what Vunnara needs from a SERP provider, so the provider can be
 * swapped (docs/research/google-ai-surfaces.md compared six; DataForSEO is the one built, lib/serp/
 * dataforseo.ts). Two ways to ask: the standard/priority queue (post the questions, then fetch each task
 * until it's done; waits of 0.1-2 minutes in the 11 Nov sample) and live (one call, seconds, dearer).
 */

export interface SurfaceTarget {
  /** The provider's location code (Google's geotarget id): 9071744 = "2153,New South Wales,Australia". */
  locationCode: number;
  device: "desktop" | "mobile";
  languageCode: "en";
}

export interface CitedLink {
  url: string;
  /** The domain the provider reports for the link (DataForSEO's `domain`), else the URL's host. */
  domain: string;
  title: string | null;
  /** 1-based, in the order the provider returned them (first seen, duplicates dropped). */
  position: number;
  /**
   * Google's own link (google.com/searchviewer, source "Google": 62 of 118 in the sample): it names no
   * business, so it's never directory evidence or a mention's proof, only counted.
   */
  googleLink: boolean;
}

export interface SurfaceAnswer {
  /** Google showed an AI answer (an AI Overview on the results page; an AI Mode answer). */
  shown: boolean;
  answerText: string | null;
  citedLinks: CitedLink[];
  /** The Google domain the provider says it used ("google.com.au" for AI Overviews, "google.com" for AI Mode). */
  seDomain: string | null;
  /** The location code the result echoes back. */
  reportedLocationCode: number | null;
  /** When the provider fetched it (ISO). */
  fetchedAt: string | null;
}

export type TaskPoll =
  | { state: "pending"; statusCode: number }
  | {
      state: "done";
      statusCode: number;
      answer: SurfaceAnswer;
      costUsd: number | null;
      raw: unknown;
    }
  | {
      state: "error";
      statusCode: number;
      message: string;
      /** The provider's documented codes worth one more (billed) attempt. */
      retryable: boolean;
      raw: unknown;
    };

export interface PostedTask {
  promptIndex: number;
  /** Null when the provider refused the task. */
  taskId: string | null;
  statusCode: number;
  message: string;
  /** What the provider says it charged for this task (US$); null when it didn't say. */
  costUsd: number | null;
}

export interface LiveResult {
  taskId: string | null;
  costUsd: number | null;
  poll: TaskPoll;
}

export interface GoogleSurfaceProvider {
  /** Stored with each result ("dataforseo"). */
  readonly name: string;
  /** Queues one task per question (standard: priority 1; priority: 2). */
  postTasks(
    surface: GoogleSurface,
    items: { promptIndex: number; question: string }[],
    target: SurfaceTarget,
    priority: 1 | 2,
  ): Promise<PostedTask[]>;
  /** One queued task's state: still waiting, done (with the answer), or an error. */
  getTask(surface: GoogleSurface, taskId: string): Promise<TaskPoll>;
  /** One question, answered in the same call (the live queue). */
  aiOverview(question: string, target: SurfaceTarget): Promise<LiveResult>;
  aiMode(question: string, target: SurfaceTarget): Promise<LiveResult>;
}

/**
 * Google AI follow-ups (12 Nov), part 4 -- what the provider says about the account itself, for the
 * operator's Test connection (a free call: DataForSEO's appendix/user_data, "Your account will not be
 * charged for using this API").
 */
export type ProviderAccountStatus =
  | { state: "accepted"; statusCode: number; balanceUsd: number | null }
  /** The login or password is wrong (or the account is refused): a login-rejected code. */
  | { state: "rejected"; statusCode: number; message: string }
  /** Anything else, or no answer (statusCode 0). */
  | { state: "error"; statusCode: number; message: string };
