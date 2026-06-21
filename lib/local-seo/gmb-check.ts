export interface GmbResult {
  present: boolean;
  completeness: number;
  reviewCount: number | null;
  avgRating: number | null;
  placeId: string | null;
  name: string | null;
  address: string | null;
  phone: string | null;
}

const EMPTY_RESULT: GmbResult = {
  present: false,
  completeness: 0,
  reviewCount: null,
  avgRating: null,
  placeId: null,
  name: null,
  address: null,
  phone: null,
};

export async function checkGmb(
  domain: string,
  brandName: string,
): Promise<GmbResult> {
  const key = process.env.GMB_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return EMPTY_RESULT;

  try {
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${brandName} ${domain}`)}&key=${key}`;
    const searchRes = await fetch(searchUrl).then((r) => r.json());
    if (!searchRes.results?.length) return EMPTY_RESULT;

    const placeId = searchRes.results[0].place_id;

    const fields =
      "name,formatted_address,formatted_phone_number,opening_hours,photos,rating,user_ratings_total";
    const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${key}`;
    const detail = await fetch(detailUrl).then((r) => r.json());
    const r = detail.result ?? {};

    const checks = [
      r.name,
      r.formatted_address,
      r.formatted_phone_number,
      r.opening_hours,
      r.photos?.length > 0 ? true : null,
      r.user_ratings_total,
    ];
    const completeness = Math.round(
      (checks.filter(Boolean).length / 6) * 100,
    );

    return {
      present: true,
      completeness,
      placeId,
      reviewCount: r.user_ratings_total ?? null,
      avgRating: r.rating ?? null,
      name: r.name ?? null,
      address: r.formatted_address ?? null,
      phone: r.formatted_phone_number ?? null,
    };
  } catch {
    return EMPTY_RESULT;
  }
}
