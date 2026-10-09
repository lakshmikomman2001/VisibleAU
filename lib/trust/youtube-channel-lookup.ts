/**
 * Real YouTube Data API v3 check. Integrity crux: never claim a channel
 * is the brand's without a confident match -- name is NOT identity.
 *
 * Found in live testing: a name-only match (brand "Bondi Plumbing"
 * against a channel literally titled "Bondi Plumbing" whose actual
 * content -- video descriptions linking getplumbing.com.au -- belongs to
 * a different company) was scored and fed into the Overall Trust Score.
 * A name match alone is now NEVER "confirmed" -- confirmation requires
 * either domain corroboration (the brand's own domain mentioned in the
 * channel's description/customUrl/recent video descriptions) or a
 * user-confirmed channel URL (see buildYoutubePresenceAuditRow).
 *
 * Four honest, distinct outcomes -- never a fabricated score:
 *   "confirmed"    -- domain-corroborated, or user-confirmed directly.
 *   "unconfirmed"  -- a name-only candidate: either no domain signal
 *                     either way, or (worse) a DIFFERENT company's
 *                     domain found and the brand's own absent. Shown to
 *                     the user to confirm/correct; never scored, never
 *                     fed into the Overall Trust Score.
 *   "not_found"    -- the API was reachable; no candidate had even
 *                     nonzero name relevance. A real measured result.
 *   "unavailable"  -- couldn't check at all (missing key / quota /
 *                     network error). Never presented as a measured 0.
 *
 * See docs/ops/post-launch-db-hardening.md section 35 (original build)
 * and section 36 (this tightening).
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

export interface YoutubeChannelCandidate {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  subscriberCount: number;
  videoCount: number;
}

export type YoutubeCheckOutcome =
  | { status: "confirmed"; channel: YoutubeChannelMatch; confirmedVia: "domain" | "user_url" }
  | {
      status: "unconfirmed";
      reason: "no_domain_signal" | "domain_mismatch";
      candidate: YoutubeChannelCandidate;
      matchConfidence: number;
    }
  | { status: "not_found" }
  | { status: "unavailable"; reason: YoutubeUnavailableReason };

interface SearchCandidate {
  channelId: string;
  title: string;
  description: string;
}

interface ChannelDetails {
  title: string;
  description: string;
  customUrl: string | null;
  subscriberCount: number;
  videoCount: number;
  uploadsPlaylistId: string | null;
}

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const FETCH_TIMEOUT_MS = 10000;

/** Generic platform/social domains that routinely appear in channel and
 * video descriptions regardless of what the channel is actually about --
 * never treated as corroborating OR conflicting evidence. */
const GENERIC_DOMAINS = new Set([
  "youtube.com",
  "youtu.be",
  "google.com",
  "goo.gl",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
  "bit.ly",
  "linktr.ee",
  "patreon.com",
  "discord.gg",
  "discord.com",
]);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function domainRoot(domain: string): string {
  return normalize(domain.split(".")[0] ?? "");
}

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "").trim();
}

/** Pure, testable name-similarity scorer (0-1), using only the two
 * signals available in search.list's own snippet (title, description) --
 * deliberately avoiding a per-candidate channels.list call that would
 * blow the quota budget. This is now ONLY a "worth enriching" signal,
 * never sufficient on its own to confirm a match -- see
 * MIN_NAME_SIMILARITY_TO_ENRICH and the domain-corroboration check in
 * checkYoutubePresence. */
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

/** A candidate needs only nonzero name relevance to be worth enriching
 * (one channels.list + one playlistItems.list call) -- confirmation
 * itself is decided by domain corroboration, not by this score. */
export const MIN_NAME_SIMILARITY_TO_ENRICH = 0;

/** Finds distinct, non-generic domains mentioned anywhere in the given
 * text (channel description, customUrl, recent video descriptions). */
export function extractDomains(text: string): string[] {
  const matches =
    text.match(
      /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\.[a-z]{2,}\b/gi,
    ) ?? [];

  const domains = new Set<string>();
  for (const m of matches) {
    try {
      const url = new URL(m.startsWith("http") ? m : `https://${m}`);
      const host = normalizeDomain(url.hostname);
      if (host && !GENERIC_DOMAINS.has(host)) domains.add(host);
    } catch {
      // malformed match -- skip
    }
  }
  return [...domains];
}

function domainsMatch(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
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

function parseChannelItem(item: Record<string, unknown> | undefined): ChannelDetails | null {
  if (!item) return null;
  const snippet = item.snippet as Record<string, unknown> | undefined;
  const statistics = item.statistics as Record<string, unknown> | undefined;
  const contentDetails = item.contentDetails as Record<string, unknown> | undefined;
  const relatedPlaylists = contentDetails?.relatedPlaylists as Record<string, unknown> | undefined;
  return {
    title: typeof snippet?.title === "string" ? snippet.title : "",
    description: typeof snippet?.description === "string" ? snippet.description : "",
    customUrl: typeof snippet?.customUrl === "string" ? snippet.customUrl : null,
    subscriberCount: Number(statistics?.subscriberCount ?? 0),
    videoCount: Number(statistics?.videoCount ?? 0),
    uploadsPlaylistId: typeof relatedPlaylists?.uploads === "string" ? relatedPlaylists.uploads : null,
  };
}

async function getChannelDetailsById(
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
    const details = parseChannelItem(data?.items?.[0]);
    return details ?? { unavailable: "network_error" };
  } catch {
    return { unavailable: "network_error" };
  }
}

/** Resolves a user-provided channel URL or @handle directly via
 * channels.list -- 1 quota unit, high confidence, no domain-corroboration
 * guesswork needed since the user already vouched for it. Legacy
 * /c/ and /user/ URL forms aren't resolvable this way and return null
 * (not "unavailable" -- the API wasn't the problem, the input was). */
export async function resolveChannelByUrlOrHandle(
  input: string,
  apiKey: string,
): Promise<(ChannelDetails & { channelId: string }) | null | { unavailable: YoutubeUnavailableReason }> {
  const trimmed = input.trim();
  let param: string | null = null;

  if (/^@[\w.-]+$/.test(trimmed)) {
    param = `forHandle=${encodeURIComponent(trimmed)}`;
  } else {
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "channel" && parts[1]) {
        param = `id=${encodeURIComponent(parts[1])}`;
      } else if (parts[0]?.startsWith("@")) {
        param = `forHandle=${encodeURIComponent(parts[0])}`;
      }
    } catch {
      return null;
    }
  }

  if (!param) return null;

  try {
    const url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics,contentDetails&${param}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { unavailable: classifyFetchFailure(res.status, body) };
    }
    const data = await res.json();
    const item = data?.items?.[0];
    const channelId = item?.id;
    const details = parseChannelItem(item);
    if (!details || typeof channelId !== "string") return null;
    return { ...details, channelId };
  } catch {
    return { unavailable: "network_error" };
  }
}

async function getRecentVideoDescriptions(
  playlistId: string,
  apiKey: string,
  maxResults: number,
): Promise<{ descriptions: string[]; lastUploadAt: string | null }> {
  try {
    const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&maxResults=${maxResults}&playlistId=${encodeURIComponent(playlistId)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return { descriptions: [], lastUploadAt: null };
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const descriptions = items
      .map((i: Record<string, unknown>) => (i.snippet as Record<string, unknown> | undefined)?.description)
      .filter((d: unknown): d is string => typeof d === "string");
    const firstPublishedAt = (items[0]?.snippet as Record<string, unknown> | undefined)?.publishedAt;
    return {
      descriptions,
      lastUploadAt: typeof firstPublishedAt === "string" ? firstPublishedAt : null,
    };
  } catch {
    // Recency/domain signal from videos is best-effort -- a failure here
    // degrades gracefully rather than discarding an otherwise-viable
    // candidate (the channel description/customUrl are still checked).
    return { descriptions: [], lastUploadAt: null };
  }
}

export async function checkYoutubePresence(
  brandName: string,
  brandDomain: string,
  confirmedChannelUrl?: string | null,
): Promise<YoutubeCheckOutcome> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { status: "unavailable", reason: "missing_api_key" };

  // A user-confirmed channel URL always wins -- resolved directly, no
  // domain-corroboration guesswork needed.
  if (confirmedChannelUrl) {
    const resolved = await resolveChannelByUrlOrHandle(confirmedChannelUrl, apiKey);
    if (resolved && "unavailable" in resolved) return { status: "unavailable", reason: resolved.unavailable };
    if (!resolved) return { status: "not_found" };

    const videos = resolved.uploadsPlaylistId
      ? await getRecentVideoDescriptions(resolved.uploadsPlaylistId, apiKey, 1)
      : { descriptions: [], lastUploadAt: null };

    return {
      status: "confirmed",
      confirmedVia: "user_url",
      channel: {
        channelId: resolved.channelId,
        channelTitle: resolved.title,
        channelUrl: `https://www.youtube.com/channel/${resolved.channelId}`,
        matchConfidence: 1,
        subscriberCount: resolved.subscriberCount,
        videoCount: resolved.videoCount,
        lastUploadAt: videos.lastUploadAt,
      },
    };
  }

  const candidates = await searchChannelCandidates(brandName, apiKey);
  if ("unavailable" in candidates) return { status: "unavailable", reason: candidates.unavailable };

  const scored = candidates
    .map((c) => ({ ...c, nameSimilarity: scoreChannelMatch(brandName, brandDomain, c) }))
    .sort((a, b) => b.nameSimilarity - a.nameSimilarity);
  const best = scored[0];

  if (!best || best.nameSimilarity <= MIN_NAME_SIMILARITY_TO_ENRICH) {
    return { status: "not_found" };
  }

  const details = await getChannelDetailsById(best.channelId, apiKey);
  if ("unavailable" in details) return { status: "unavailable", reason: details.unavailable };

  const videos = details.uploadsPlaylistId
    ? await getRecentVideoDescriptions(details.uploadsPlaylistId, apiKey, 5)
    : { descriptions: [], lastUploadAt: null };

  const candidatePreview: YoutubeChannelCandidate = {
    channelId: best.channelId,
    channelTitle: details.title || best.title,
    channelUrl: `https://www.youtube.com/channel/${best.channelId}`,
    subscriberCount: details.subscriberCount,
    videoCount: details.videoCount,
  };

  // Integrity crux: name alone is never enough. Require the brand's own
  // domain to actually appear in the channel's text before confirming.
  const allText = [details.description, details.customUrl, ...videos.descriptions]
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .join(" ");
  const foundDomains = extractDomains(allText);
  const brandDomainNormalized = normalizeDomain(brandDomain);
  const corroborated = foundDomains.some((d) => domainsMatch(d, brandDomainNormalized));

  if (corroborated) {
    return {
      status: "confirmed",
      confirmedVia: "domain",
      channel: {
        ...candidatePreview,
        matchConfidence: best.nameSimilarity,
        lastUploadAt: videos.lastUploadAt,
      },
    };
  }

  const conflicting = foundDomains.find((d) => !domainsMatch(d, brandDomainNormalized));
  return {
    status: "unconfirmed",
    reason: conflicting ? "domain_mismatch" : "no_domain_signal",
    candidate: candidatePreview,
    matchConfidence: best.nameSimilarity,
  };
}
