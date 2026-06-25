interface AbnLookupResult {
  abnVerified: boolean;
  abnNumber: string | null;
  abnEntityName: string | null;
  abnStatus: string | null;
}

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
    if (process.env.NODE_ENV === "production" || process.env.LLM_MODE === "real") {
      console.error(
        "[ABN] REFUSED mock-verified bypass in prod/real mode — falling back to honest skip",
      );
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

  const guid = process.env.ABN_LOOKUP_GUID;
  if (!guid) return empty;

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
      if (!res.ok) return empty;

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
      return empty;
    }
  }

  return empty;
}
