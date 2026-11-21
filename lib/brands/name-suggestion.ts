import * as cheerio from "cheerio";

export { suggestAliases } from "./aliases";

import { domainLabel, readableNameFromDomain } from "./name-from-domain";
import { normalizeBrandName } from "./normalize";

/**
 * S00 part 4 (22 Nov; LLD 8.8.2, T2): the name a business goes by, from its own home page, for the add-brand wizard
 * to suggest. TechCore IT was stored as "techcoreit" (its domain label) and its questions and pages read that way.
 *
 * In order: the page's og:site_name; the part of its <title> that is the business's name (the segment between
 * " | ", " - ", " – ", " — ", " · " or ": " separators that matches the domain); a JSON-LD Organization /
 * LocalBusiness / WebSite `name` that matches the domain; else the readable words of the domain itself
 * (lib/brands/name-from-domain.ts). Every candidate is a short plain name (2-60 characters, no URL), or skipped.
 * The owner can always edit it.
 */

export type NameSuggestionSource = "og:site_name" | "title" | "json-ld" | "domain";

export interface NameSuggestion {
  name: string;
  source: NameSuggestionSource;
}

const MIN_LENGTH = 2;
const MAX_LENGTH = 60;

/** Letters and digits only, lower case: how a candidate is compared with the domain ("TechCore IT" -> "techcoreit"). */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function plainName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // cheerio has already decoded entities in attribute values and text.
  const name = normalizeBrandName(raw);
  if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) return null;
  if (/https?:\/\/|www\.|[<>{}]/i.test(name)) return null;
  return name;
}

/** Whether the candidate names the domain's business: its letters are the domain label's, or contain them. */
function matchesDomain(name: string, domain: string): boolean {
  const label = compact(domainLabel(domain));
  const candidate = compact(name);
  if (label.length < 3 || candidate.length < 2) return false;
  return candidate === label || candidate.includes(label) || label.includes(candidate);
}

const TITLE_SEPARATORS = /\s+[|\-–—·:]\s+|\s*\|\s*/;

function fromTitle(title: string, domain: string): string | null {
  const segments = title
    .split(TITLE_SEPARATORS)
    .map((s) => plainName(s))
    .filter((s): s is string => s !== null);
  return segments.find((s) => matchesDomain(s, domain)) ?? null;
}

const ORGANISATION_TYPES =
  /^(Organization|Corporation|LocalBusiness|ProfessionalService|Store|WebSite|[A-Za-z]+Business|[A-Za-z]+Service)$/;

function jsonLdNames(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const v of value) jsonLdNames(v, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
  if (
    types.some((t) => typeof t === "string" && ORGANISATION_TYPES.test(t)) &&
    typeof record.name === "string"
  )
    out.push(record.name);
  if (record["@graph"]) jsonLdNames(record["@graph"], out);
}

function fromJsonLd($: cheerio.CheerioAPI, domain: string): string | null {
  const names: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      jsonLdNames(JSON.parse($(el).contents().text()), names);
    } catch {
      // A broken block is skipped; the others still count.
    }
  });
  for (const raw of names) {
    const name = plainName(raw);
    if (name && matchesDomain(name, domain)) return name;
  }
  return null;
}

/** The name to suggest for `domain`, from its home page's HTML (null when there's no page: the domain alone). */
export function suggestBrandName(html: string | null, domain: string): NameSuggestion | null {
  if (html) {
    const $ = cheerio.load(html);
    const siteName = plainName($('meta[property="og:site_name"]').attr("content"));
    if (siteName) return { name: siteName, source: "og:site_name" };
    const title = fromTitle($("title").first().text(), domain);
    if (title) return { name: title, source: "title" };
    const jsonLd = fromJsonLd($, domain);
    if (jsonLd) return { name: jsonLd, source: "json-ld" };
  }
  const readable = readableNameFromDomain(domain);
  return readable ? { name: readable, source: "domain" } : null;
}

/** GET /api/brands/name-suggestion: per user. */
export const NAME_SUGGESTION_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 } as const;

/** "TechCoreIT.com.au", "https://www.techcoreit.com.au/" -> "techcoreit.com.au"; null for anything else. */
export function suggestionHost(raw: string | null): string | null {
  if (!raw) return null;
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
  if (host.length > 253) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return null;
  return host;
}
