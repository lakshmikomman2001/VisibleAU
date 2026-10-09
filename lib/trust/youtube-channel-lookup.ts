/**
 * Real YouTube Data API v3 check, replacing the hardcoded stub. Three
 * honest, distinct outcomes -- never a fabricated score:
 *   "confirmed"   -- a channel matched above MATCH_CONFIDENCE_THRESHOLD.
 *   "not_found"   -- the API was reachable; no candidate matched
 *                    confidently (or there were no candidates at all).
 *                    A real, measured zero presence.
 *   "unavailable" -- couldn't check at all (missing YOUTUBE_API_KEY,
 *                    quota exceeded, or a network/API error). Must never
 *                    be presented as a measured 0 -- distinct from
 *                    "not_found".
 *
 * Integrity crux: never claim a channel is the brand's without a
 * confident match -- the top search result is NOT taken blindly.
 * Matching uses only signals available from search.list's own response
 * (title, description) to stay within the documented quota budget
 * (search ~100 units + channels.list 1 + playlistItems.list 1 = ~102
 * units per check, so a candidate-by-candidate channels.list lookup to
 * fetch customUrl is deliberately avoided).
 *
 * See docs/ops/post-launch-db-hardening.md section 35.
 */

export type YoutubeUnavailableReason = "missing_api_key" | "quota_exceeded" | "network_error";

export interface YoutubeChannelMatch {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  matchConfidence: number;
  subscriberCount: number;
  videoCount: number;
  lastUploadAt: string | null;
}

export type YoutubeCheckOutcome =
  | { status: "confirmed"; channel: YoutubeChannelMatch }
  | { status: "not_found"; bestCandidateConfidence: number }
  | { status: "unavailable"; reason: YoutubeUnavailableReason };

interface SearchCandidate {
  channelId: string;
  title: string;
  description: string;
}

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const FETCH_TIMEOUT_MS = 10000;

/** Conservative: an exact normalized title match alone clears this, but
 * a single weak signal (name substring OR domain-in-description) alone
 * does not -- two weak signals together are required. Never take the
 * top search result blindly. */
export const MATCH_CONFIDENCE_THRESHOLD = 0.6;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function domainRoot(domain: string): string {
  return normalize(domain.split(".")[0] ?? "");
}

/** Pure, testable match-confidence scorer (0-1). Signals: normalized
 * brand-name similarity to the candidate's title, and the brand's domain
 * root appearing in the candidate's description. Both derived only from
 * search.list's own snippet -- no extra per-candidate API call. */
export function scoreChannelMatch(
  brandName: string,
  brandDomain: string,
  candidate: { title: string; description: string },
): number {
  const nName = normalize(brandName);
  const nTitle = normalize(candidate.title);
  const nDomainRoot = domainRoot(brandDomain);
  const nDescription = normalize(candidate.description ?? "");

  let score = 0;

  if (nName.length >= 3 && nTitle === nName) {
    score += 0.6;
  } else if (nName.length >= 4 && (nTitle.includes(nName) || nName.includes(nTitle))) {
    score += 0.35;
  }

  if (nDomainRoot.length >= 4 && nDescription.includes(nDomainRoot)) {
    score += 0.35;
  }

  return Math.min(1, score);
}

function classifyFetchFailure(status: number, body: unknown): YoutubeUnavailableReason {
  const reason = (body as { error?: { errors?: { reason?: string }[] } } | null)?.error
    ?.errors?.[0]?.reason;
  if (status === 403 && reason === "quotaExceeded") return "quota_exceeded";
  return "network_error";
}

async function searchChannelCandidates(
  brandName: string,
  apiKey: string,
): Promise<SearchCandidate[] | { unavailable: YoutubeUnavailableReason }> {
  try {
    const url = `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&maxResults=5&q=${encodeURIComponent(brandName)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { unavailable: classifyFetchFailure(res.status, body) };
    }
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    return items
      .map((item: Record<string, unknown>) => {
        const id = item.id as Record<string, unknown> | undefined;
        const snippet = item.snippet as Record<string, unknown> | undefined;
        const channelId = id?.channelId;
        if (typeof channelId !== "string" || !snippet) return null;
        return {
          channelId,
          title: typeof snippet.title === "string" ? snippet.title : "",
          description: typeof snippet.description === "string" ? snippet.description : "",
        };
      })
      .filter((c: SearchCandidate | null): c is SearchCandidate => c !== null);
  } catch {
    return { unavailable: "network_error" };
  }
}

interface ChannelDetails {
  title: string;
  subscriberCount: number;
  videoCount: number;
  uploadsPlaylistId: string | null;
}

async function getChannelDetails(
  channelId: string,
  apiKey: string,
): Promise<ChannelDetails | { unavailable: YoutubeUnavailableReason }> {
  try {
    const url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(channelId)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { unavailable: classifyFetchFailure(res.status, body) };
    }
    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) return { unavailable: "network_error" };
    return {
      title: item.snippet?.title ?? "",
      subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
      videoCount: Number(item.statistics?.videoCount ?? 0),
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
    };
  } catch {
    return { unavailable: "network_error" };
  }
}

/** Recency is best-effort: a failure here degrades gracefully (the
 * channel match itself still stands) rather than discarding an
 * already-confirmed match. Returns null on any failure. */
async function getLastUploadDate(playlistId: string, apiKey: string): Promise<string | null> {
  try {
    const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&maxResults=1&playlistId=${encodeURIComponent(playlistId)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    const publishedAt = data?.items?.[0]?.snippet?.publishedAt;
    return typeof publishedAt === "string" ? publishedAt : null;
  } catch {
    return null;
  }
}

export async function checkYoutubePresence(
  brandName: string,
  brandDomain: string,
): Promise<YoutubeCheckOutcome> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { status: "unavailable", reason: "missing_api_key" };

  const candidates = await searchChannelCandidates(brandName, apiKey);
  if ("unavailable" in candidates) return { status: "unavailable", reason: candidates.unavailable };

  const scored = candidates
    .map((c) => ({ ...c, confidence: scoreChannelMatch(brandName, brandDomain, c) }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];

  if (!best || best.confidence < MATCH_CONFIDENCE_THRESHOLD) {
    return { status: "not_found", bestCandidateConfidence: best?.confidence ?? 0 };
  }

  const details = await getChannelDetails(best.channelId, apiKey);
  if ("unavailable" in details) return { status: "unavailable", reason: details.unavailable };

  const lastUploadAt = details.uploadsPlaylistId
    ? await getLastUploadDate(details.uploadsPlaylistId, apiKey)
    : null;

  return {
    status: "confirmed",
    channel: {
      channelId: best.channelId,
      channelTitle: details.title || best.title,
      channelUrl: `https://www.youtube.com/channel/${best.channelId}`,
      matchConfidence: best.confidence,
      subscriberCount: details.subscriberCount,
      videoCount: details.videoCount,
      lastUploadAt,
    },
  };
}
