import { llmModeSetting, mockShortcutAllowed } from "@/lib/mock-mode";

interface AbnLookupResult {
  abnVerified: boolean;
  abnNumber: string | null;
  abnEntityName: string | null;
  abnStatus: string | null;
}

/*
 * ABR web services: terms for automated lookups (checked 23 Nov 2026, S01 part 1).
 * The ABN Lookup web services are free; a GUID is issued on registering and accepting the ABN Lookup Web Services
 * Agreement (https://abr.business.gov.au/Tools/WebServicesAgreement, version 9.9.7; registration:
 * https://abr.business.gov.au/Tools/WebServices). The agreement grants a non-exclusive, non-transferable licence and
 * states no rate, volume, caching or attribution rule. It requires: deleting any information the ABR tells us it
 * has withdrawn (for example to protect an individual's privacy); never using the services in a way that is or may
 * be false, misleading or deceptive; never implying the Commonwealth endorses us or our use. Extracts may be given to
 * third parties at our own risk. The service is "as is", and may be altered or suspended.
 * Methods (https://abr.business.gov.au/json/): AbnDetails.aspx?abn=&guid= (below) and MatchingNames.aspx?name=
 * &maxResults=&guid= (name search; no postcode or state parameter on the JSON method, and its AbnStatus is a code,
 * so each candidate is confirmed with AbnDetails). Both confirmed with the configured GUID on 23 Nov 2026.
 */

// ABN_LOOKUP_BYPASS: temporary — real ABR check resumes automatically when this is unset and ABN_LOOKUP_GUID is provided.
export async function lookupAbn(abn: string | null | undefined): Promise<AbnLookupResult> {
  const empty: AbnLookupResult = {
    abnVerified: false,
    abnNumber: null,
    abnEntityName: null,
    abnStatus: null,
  };

  const bypass = process.env.ABN_LOOKUP_BYPASS;

  if (bypass === "mock-verified") {
    // Production (NODE_ENV or VERCEL_ENV) refuses it and logs why (lib/mock-mode.ts); so does LLM_MODE=real.
    // Either way the ABN is reported as not checked, never "verified".
    const allowed = mockShortcutAllowed("ABN_LOOKUP_BYPASS=mock-verified");
    if (!allowed || llmModeSetting() === "real") {
      if (allowed) {
        console.error(
          "[ABN] REFUSED mock-verified bypass with LLM_MODE=real — falling back to honest skip",
        );
      }
      console.warn(
        "[ABN] Lookup BYPASSED (skip mode) — ABN_LOOKUP_BYPASS set; real check disabled pending GUID",
      );
      return { ...empty, abnNumber: abn?.replace(/\s/g, "") ?? null, abnStatus: "check_skipped" };
    }
    console.warn(
      "[ABN] MOCK-VERIFIED bypass active — FAKE data, dev/mock only. NOT for real reports.",
    );
    return {
      abnVerified: true,
      abnNumber: abn?.replace(/\s/g, "") ?? null,
      abnEntityName: "MOCK — ABN check bypassed",
      abnStatus: "Active",
    };
  }

  if (bypass === "skip") {
    console.warn(
      "[ABN] Lookup BYPASSED (skip mode) — ABN_LOOKUP_BYPASS=skip; real check disabled pending GUID",
    );
    return { ...empty, abnNumber: abn?.replace(/\s/g, "") ?? null, abnStatus: "check_skipped" };
  }

  if (!abn) return empty;

  // Leftovers task, part 3 (17 Nov): no GUID is a lookup that never ran ("check_skipped", not checked), and a lookup
  // that didn't complete -- an HTTP error, a timeout, no answer -- is "check_failed": neither is "not verified".
  // Both read as unchecked everywhere (lib/brand-entity/score.ts abnWasChecked). They returned no status, which
  // agent readiness read as "ABN not yet verified" and Local AI Trust as a measured 0.
  const failed: AbnLookupResult = {
    ...empty,
    abnNumber: abn.replace(/\s/g, ""),
    abnStatus: "check_failed",
  };
  const guid = process.env.ABN_LOOKUP_GUID;
  if (!guid) return { ...empty, abnNumber: abn.replace(/\s/g, ""), abnStatus: "check_skipped" };

  const cleanAbn = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(cleanAbn)) return empty;

  const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${cleanAbn}&guid=${guid}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (!res.ok) return failed;

      const text = await res.text();
      const json = JSON.parse(text.replace(/^callback\(/, "").replace(/\)$/, ""));
      if (!json.Abn) return empty;

      return {
        abnVerified: json.AbnStatus === "Active",
        abnNumber: json.Abn,
        abnEntityName: json.EntityName ?? json.BusinessName?.[0]?.Name ?? null,
        abnStatus: json.AbnStatus ?? null,
      };
    } catch {
      if (attempt === 0) continue;
      return failed;
    }
  }

  return failed;
}

// ---------------------------------------------------------------------------------------------------------------------
// S01 part 11 (LLD 8.8.6, T8; contract P01.abn): an ABN suggestion by business name.

/** A confident match: the business's name on the ABR, in its place, with an Active ABN (confirmed with AbnDetails). */
export interface AbnSuggestion {
  abn: string;
  entity: string | null;
  businessName: string;
  postcode: string | null;
  state: string | null;
  abnStatus: string;
  checkedAt: string;
}

export type AbnSearchResult =
  | { status: "found"; suggestion: AbnSuggestion }
  | { status: "none" }
  | { status: "skipped" }
  | { status: "failed" };

const ABR_JSON = "https://abr.business.gov.au/json";

/** One ABR JSON call (JSONP: callback(...)); null when it didn't answer. The GUID goes only in the query string. */
async function abrJson(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const query = new URLSearchParams(params).toString().replace(/\+/g, "%20");
  try {
    const res = await fetch(`${ABR_JSON}/${path}?${query}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const text = await res.text();
    const json: unknown = JSON.parse(text.replace(/^callback\(/, "").replace(/\)\s*$/, ""));
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const sameName = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The ABR's MatchingNames for `name` (the JSON method takes a name only), kept to current names that are the
 * business's name, filtered in code by postcode when the brand has one, else by state; each remaining ABN confirmed
 * with AbnDetails. A suggestion only when exactly one ABN is left and it is Active. Never with ABN_LOOKUP_BYPASS set
 * or no GUID (no lookup), and the ABR not answering is "failed", never a guess.
 */
export async function searchAbnByName(
  name: string,
  place: { postcode?: string | null; state?: string | null } = {},
): Promise<AbnSearchResult> {
  const guid = process.env.ABN_LOOKUP_GUID;
  if (!guid || process.env.ABN_LOOKUP_BYPASS) return { status: "skipped" };
  const found = await abrJson("MatchingNames.aspx", { name: name.trim(), maxResults: "10", guid });
  if (!found) return { status: "failed" };
  const names = Array.isArray(found.Names) ? (found.Names as Array<Record<string, unknown>>) : [];
  const postcode = place.postcode?.trim() || null;
  const state = place.state?.trim().toUpperCase() || null;
  const candidates = names.filter(
    (n) =>
      n.IsCurrent === true &&
      typeof n.Abn === "string" &&
      typeof n.Name === "string" &&
      sameName(n.Name, name) &&
      (postcode
        ? n.Postcode === postcode
        : state
          ? String(n.State ?? "").toUpperCase() === state
          : true),
  );
  const abns = [...new Set(candidates.map((n) => n.Abn as string))];
  if (abns.length !== 1) return { status: "none" };
  const details = await abrJson("AbnDetails.aspx", { abn: abns[0], guid });
  if (!details) return { status: "failed" };
  if (details.AbnStatus !== "Active" || details.Abn !== abns[0]) return { status: "none" };
  const match = candidates[0];
  return {
    status: "found",
    suggestion: {
      abn: abns[0],
      entity: typeof details.EntityName === "string" ? details.EntityName : null,
      businessName: match.Name as string,
      postcode: typeof details.AddressPostcode === "string" ? details.AddressPostcode : null,
      state: typeof details.AddressState === "string" ? details.AddressState : null,
      abnStatus: "Active",
      checkedAt: new Date().toISOString(),
    },
  };
}
