import { guardedFetch } from "@/lib/fetch/guarded-fetch";
import { WEBHOOK_HEADERS, WEBHOOK_USER_AGENT } from "@/lib/product";

/**
 * S00B part 3 (docs/lld/fetch-inventory.md F11): the receiver's answer is read for the result only, and a read that
 * fails is "" (below); it had no size bound, and now has this one.
 */
export const WEBHOOK_RESPONSE_MAX_BYTES = 1024 * 1024;

export interface DeliveryResult {
  ok: boolean;
  status: number;
  body: string;
}

export async function deliver(
  url: string,
  body: unknown,
  signature: string,
  eventName: string,
): Promise<DeliveryResult> {
  // S00B part 3: through the guarded fetcher, so an endpoint (or a redirect from one) on an internal address or a
  // port other than 80/443 is refused, and the delivery fails as an unreachable endpoint does. Same request as
  // before: POST, the signed headers, our user agent, 10 s, redirects followed as fetch follows them.
  const res = await guardedFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [WEBHOOK_HEADERS.signature]: `sha256=${signature}`,
      [WEBHOOK_HEADERS.event]: eventName,
      "User-Agent": WEBHOOK_USER_AGENT,
    },
    body: JSON.stringify(body),
    timeoutMs: 10_000,
    maxBytes: WEBHOOK_RESPONSE_MAX_BYTES,
  });

  const responseBody = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(`Delivery failed: ${res.status}`);
  }

  return { ok: res.ok, status: res.status, body: responseBody };
}
