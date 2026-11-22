import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  NAME_SUGGESTION_LIMIT,
  suggestBrandName,
  suggestionHost,
} from "@/lib/brands/name-suggestion";
import { crawlSite } from "@/lib/crawler";
import { roleRefusal } from "@/lib/governance";
import { checkPostgresRateLimit } from "@/lib/governance/pg-rate-limit";

/**
 * S00 part 4 (22 Nov; LLD 8.8.2, T2): GET /api/brands/name-suggestion?domain=… -- the name the add-brand wizard
 * suggests, from the business's own home page (lib/brands/name-suggestion.ts). `aliases` is always empty since S01
 * part 0 (C-27).
 *
 * Only someone who may add a brand (manage_brands) asks; 30 a user per 10 minutes. The page is fetched the way
 * classification already fetches it when a brand is added (lib/crawler crawlSite, one page, 8 s), so this is no new
 * kind of fetch; only a plain host name is accepted (no IP address, port, path or localhost), and only the
 * suggested name and aliases are sent back, never the page. When the page can't be read, the suggestion falls back
 * to the domain's own words. S00B part 3: crawlSite fetches through the guarded fetcher (lib/fetch/guarded-fetch.ts),
 * so a host name that resolves to an internal address, or a page that redirects to one, is refused and lands in
 * that fallback.
 */
export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const forbidden = await roleRefusal(currentUser, "manage_brands");
  if (forbidden) return forbidden;

  const domain = suggestionHost(new URL(req.url).searchParams.get("domain"));
  if (!domain)
    return NextResponse.json(
      { error: "domain: a web address like example.com.au" },
      { status: 400 },
    );

  const limit = await checkPostgresRateLimit({
    routeKey: "brand-name-suggestion",
    ip: `user:${currentUser.id}`,
    ...NAME_SUGGESTION_LIMIT,
  });
  if (!limit.allowed)
    return NextResponse.json(
      { error: "Too many suggestions asked for. Type the name, or wait a few minutes." },
      { status: 429 },
    );

  let html: string | null = null;
  try {
    const result = await crawlSite(domain, { maxPages: 1, timeoutMs: 8000 });
    html = result.pages[0]?.html ?? null;
  } catch {
    html = null;
  }
  const suggestion = suggestBrandName(html, domain);
  console.log(
    JSON.stringify({
      event: "brand_name_suggested",
      userId: currentUser.id,
      source: suggestion?.source ?? null,
      pageRead: html !== null,
    }),
  );
  return NextResponse.json({
    name: suggestion?.name ?? null,
    source: suggestion?.source ?? null,
    // S01 part 0 (C-27): no aliases are suggested (the two S00 forms are ones detection already matches);
    // the field stays in the answer, always empty, so the response keeps its shape.
    aliases: [],
  });
}
