interface AbnLookupResult {
  abnVerified: boolean;
  abnNumber: string | null;
  abnEntityName: string | null;
  abnStatus: string | null;
}

export async function lookupAbn(abn: string | null | undefined): Promise<AbnLookupResult> {
  const empty: AbnLookupResult = {
    abnVerified: false,
    abnNumber: null,
    abnEntityName: null,
    abnStatus: null,
  };
  if (!abn) return empty;

  const guid = process.env.ABN_LOOKUP_GUID;
  if (!guid) return empty;

  const cleanAbn = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(cleanAbn)) return empty;

  const url = `https://abr.business.gov.au/Tools/JsonAbnLookup?guid=${guid}&abn=${cleanAbn}`;

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
