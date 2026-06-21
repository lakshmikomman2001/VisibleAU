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
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-VisibleAU-Signature": `sha256=${signature}`,
      "X-VisibleAU-Event": eventName,
      "User-Agent": "VisibleAU-Webhook/1.0",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  const responseBody = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(`Delivery failed: ${res.status}`);
  }

  return { ok: res.ok, status: res.status, body: responseBody };
}
