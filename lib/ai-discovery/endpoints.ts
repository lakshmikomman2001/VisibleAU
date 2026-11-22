import {
  combineOutcomes,
  type FetchOutcome,
  outcomeForError,
  outcomeForStatus,
} from "@/lib/crawler/fetch-outcome";
import { guardedFetch } from "@/lib/fetch/guarded-fetch";
import type { TechnicalScoringVersion } from "@/lib/technical-audit/scoring-version";

// Task WW: the single source of truth for AI Discovery weights -- the
// ai-discovery display page imports this instead of hand-maintaining its own
// copy, which is how it drifted to 2/2/1/1 against these real weights.
// 19 Nov (Sri's review): /ai/summary.json, /ai/faq.json and /ai/service.json are Vunnara's own format, and no AI
// engine is known to read them, so their absence lowers no score: each weighs 0 (they were 1 each, out of 6).
// 20 Nov (Sri's decision): ai.txt weighs 0 too -- the only document for it is an individual Internet-Draft, not a
// standard, and no AI provider has said its engine reads it (lib/methodology/verified-citations.ts). All four are
// still checked and shown ("Found / Not found · not scored"); nothing creates a task or a recommendation from them.
export const AI_DISCOVERY_WEIGHTS = {
  aiTxt: 0,
  aiSummary: 0,
  aiFaq: 0,
  aiService: 0,
} as const;

export type AiDiscoveryWeights = Record<keyof typeof AI_DISCOVERY_WEIGHTS, number>;

/**
 * What each file earned under each scoring version (lib/technical-audit/scoring-version.ts), so an older audit's
 * rows show the points it was scored with: ai.txt 3 and the /ai/ files 1 each until 19 Nov, ai.txt alone until 20 Nov,
 * nothing since.
 */
export const AI_DISCOVERY_WEIGHTS_BY_VERSION: Record<TechnicalScoringVersion, AiDiscoveryWeights> =
  {
    1: { aiTxt: 3, aiSummary: 1, aiFaq: 1, aiService: 1 },
    2: { aiTxt: 3, aiSummary: 1, aiFaq: 1, aiService: 1 },
    3: { aiTxt: 3, aiSummary: 0, aiFaq: 0, aiService: 0 },
    4: AI_DISCOVERY_WEIGHTS,
  };

/** The most the AI Discovery check scores now: 0 (it's checked, not scored). An older audit's is its version's. */
export const AI_DISCOVERY_MAX =
  AI_DISCOVERY_WEIGHTS.aiTxt +
  AI_DISCOVERY_WEIGHTS.aiSummary +
  AI_DISCOVERY_WEIGHTS.aiFaq +
  AI_DISCOVERY_WEIGHTS.aiService;

/** How the three /ai/ files are labelled wherever they're shown. */
export const OPTIONAL_AI_FILES_LABEL = "Optional, not read by any AI engine we know of";

/** How ai.txt is labelled wherever it's shown, from 20 Nov. */
export const AI_TXT_LABEL =
  "A proposal, not a standard, and no AI provider has said its engine reads it";

// Task FFF: both locations are real standards in the wild -- the June 2026
// IETF draft (draft-car-ai-txt-wellknown) standardises /.well-known/ai.txt,
// while the older Spawning convention uses the site root /ai.txt. Checking
// only one risked a false negative on sites using the other, AND the old
// on-screen copy told customers to create /ai.txt while the detector only
// ever checked /.well-known/ai.txt -- a customer who followed the UI's own
// instructions would re-audit and still score 0. This is the single source
// both the detector and the display import, so they can't drift apart
// again.
export const AI_TXT_PATHS = ["/.well-known/ai.txt", "/ai.txt"] as const;

/** The four files, by the field each one's result is stored under. */
export type AiDiscoveryKey =
  | "aiTxtPresent"
  | "aiSummaryPresent"
  | "aiFaqPresent"
  | "aiServicePresent";

/**
 * Leftovers task, part 3 (17 Nov): each file is true (found), false (a 404 or 410, or a page that isn't the file) or
 * null (couldn't check: a timeout, no answer, a 403/429, a 5xx), with why in `notChecked`. A failed request was
 * false -- "✗ 0/3" and "Not found" -- and the score counted it.
 */
export interface AiDiscoveryFindings {
  score: number;
  aiTxtPresent: boolean | null;
  aiSummaryPresent: boolean | null;
  aiFaqPresent: boolean | null;
  aiServicePresent: boolean | null;
  /** Why a file couldn't be checked, by its field (absent on audits from before 17 Nov). */
  notChecked?: Partial<Record<AiDiscoveryKey, string>>;
  /** false: the /ai/ files earned nothing (19 Nov on). Absent on audits that scored them, out of 6. */
  optionalFilesScored?: false;
}

interface AiDiscoveryResult {
  score: number;
  findings: AiDiscoveryFindings;
  /** Every file was checked: the score is a measurement. False when any couldn't be (the score isn't stored). */
  measured: boolean;
}

/** How long each request gets (5 s made a slow site's files "missing"). */
const ENDPOINT_TIMEOUT_MS = 10_000;
/** S00B part 3 (inventory F8): a file's size bound (none before); these are small text and JSON files. */
export const AI_FILE_MAX_BYTES = 10 * 1024 * 1024;

async function checkEndpoint(url: string, expectedType: string): Promise<FetchOutcome> {
  try {
    // S00B part 3: through the guarded fetcher (an internal address is refused: "couldn't check" below), with
    // fetch's own request headers and the same timeout as before.
    const res = await guardedFetch(url, {
      method: "GET",
      timeoutMs: ENDPOINT_TIMEOUT_MS,
      maxBytes: AI_FILE_MAX_BYTES,
    });
    if (!res.ok) return outcomeForStatus(res.status);
    // A 2xx that isn't the file (the site's own HTML page for an unknown path) is a missing file.
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes(expectedType)) return { state: "absent" };
    const body = await res.text();
    return body.length > 100 ? { state: "found" } : { state: "absent" };
  } catch (err) {
    return outcomeForError(err);
  }
}

async function checkAiTxt(base: string): Promise<FetchOutcome> {
  return combineOutcomes(
    await Promise.all(AI_TXT_PATHS.map((path) => checkEndpoint(`${base}${path}`, "text/plain"))),
  );
}

const WEIGHT_OF: Record<AiDiscoveryKey, number> = {
  aiTxtPresent: AI_DISCOVERY_WEIGHTS.aiTxt,
  aiSummaryPresent: AI_DISCOVERY_WEIGHTS.aiSummary,
  aiFaqPresent: AI_DISCOVERY_WEIGHTS.aiFaq,
  aiServicePresent: AI_DISCOVERY_WEIGHTS.aiService,
};

export async function checkAiDiscovery(domain: string): Promise<AiDiscoveryResult> {
  const base = `https://${domain}`;
  const [aiTxt, aiSummary, aiFaq, aiService] = await Promise.all([
    checkAiTxt(base),
    checkEndpoint(`${base}/ai/summary.json`, "application/json"),
    checkEndpoint(`${base}/ai/faq.json`, "application/json"),
    checkEndpoint(`${base}/ai/service.json`, "application/json"),
  ]);
  const outcomes: Record<AiDiscoveryKey, FetchOutcome> = {
    aiTxtPresent: aiTxt,
    aiSummaryPresent: aiSummary,
    aiFaqPresent: aiFaq,
    aiServicePresent: aiService,
  };

  const present = (o: FetchOutcome) =>
    o.state === "found" ? true : o.state === "absent" ? false : null;
  const notChecked: Partial<Record<AiDiscoveryKey, string>> = {};
  let score = 0;
  for (const key of Object.keys(outcomes) as AiDiscoveryKey[]) {
    const o = outcomes[key];
    if (o.state === "unchecked") notChecked[key] = o.reason;
    if (o.state === "found") score += WEIGHT_OF[key];
  }

  return {
    score,
    // 19 Nov: only a file that counts can leave the score unmeasured; an optional file that couldn't be fetched says
    // so on its own row.
    measured: (Object.keys(notChecked) as AiDiscoveryKey[]).every((key) => WEIGHT_OF[key] === 0),
    findings: {
      score,
      aiTxtPresent: present(aiTxt),
      aiSummaryPresent: present(aiSummary),
      aiFaqPresent: present(aiFaq),
      aiServicePresent: present(aiService),
      notChecked,
      optionalFilesScored: false,
    },
  };
}
