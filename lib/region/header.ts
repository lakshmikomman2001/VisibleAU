/**
 * Playwright-run follow-ups (10 Nov), part 8 -- the request header the middleware puts the visitor's region on,
 * for server components to read with `headers()` (the pricing page). It had the product's old name and was set
 * on the response, where no page can read it, so every visitor got the AU pricing page.
 */
export const REGION_HEADER = "x-vunnara-region";

/**
 * The visitor's country (ISO 3166-1 alpha-2), from Vercel's edge: what @vercel/functions' geolocation() reads.
 * `request.geo`, which the middleware read before, was removed in Next 15. Vercel sets this header itself on
 * every request it serves; locally nothing does, so the region comes from the path or defaults to AU.
 */
export const GEO_COUNTRY_HEADER = "x-vercel-ip-country";
