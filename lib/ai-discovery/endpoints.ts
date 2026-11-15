import {
  combineOutcomes,
  type FetchOutcome,
  outcomeForError,
  outcomeForStatus,
} from "@/lib/crawler/fetch-outcome";

// Task WW: the single source of truth for AI Discovery weights -- the
// ai-discovery display page imports this instead of hand-maintaining its own
// copy, which is how it drifted to 2/2/1/1 against these real weights.
export const AI_DISCOVERY_WEIGHTS = {
  aiTxt: 3,
  aiSummary: 1,
  aiFaq: 1,
  aiService: 1,
} as const;

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
}

interface AiDiscoveryResult {
  score: number;
  findings: AiDiscoveryFindings;
  /** Every file was checked: the score is a measurement. False when any couldn't be (the score isn't stored). */
  measured: boolean;
}

/** How long each request gets (5 s made a slow site's files "missing"). */
const ENDPOINT_TIMEOUT_MS = 10_000;

async function checkEndpoint(url: string, expectedType: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(ENDPOINT_TIMEOUT_MS),
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
    measured: Object.keys(notChecked).length === 0,
    findings: {
      score,
      aiTxtPresent: present(aiTxt),
      aiSummaryPresent: present(aiSummary),
      aiFaqPresent: present(aiFaq),
      aiServicePresent: present(aiService),
      notChecked,
    },
  };
}
