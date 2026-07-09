import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";

const visitSchema = z.object({
  brandToken: z.string().min(1),
  url: z.url(),
  userAgent: z.string().min(1),
  referrer: z.string().optional(),
  timestamp: z.string().optional(),
});

const ipLimitMap = new Map<string, { count: number; resetAt: number }>();
const tokenNegativeCache = new Map<string, number>();

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = visitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  const data = parsed.data;

  const ip = getClientIp(req);
  const now = Date.now();

  const ipEntry = ipLimitMap.get(ip);
  if (ipEntry && ipEntry.resetAt > now) {
    if (ipEntry.count >= 200) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    ipEntry.count++;
  } else {
    ipLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
  }

  const negativeCachedAt = tokenNegativeCache.get(data.brandToken);
  if (negativeCachedAt && now - negativeCachedAt < 60_000) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [brand] = await serviceDb
    .select({ id: brands.id, organizationId: brands.organizationId, domain: brands.domain })
    .from(brands)
    .where(eq(brands.brandToken, data.brandToken))
    .limit(1);

  if (!brand) {
    tokenNegativeCache.set(data.brandToken, now);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const urlHost = new URL(data.url).host;
    if (urlHost !== brand.domain && !urlHost.endsWith(`.${brand.domain}`)) {
      return NextResponse.json({ error: "URL does not match brand domain" }, { status: 422 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 422 });
  }

  await inngest.send({
    name: "visit/ingested",
    data: {
      brandId: brand.id,
      organizationId: brand.organizationId,
      url: data.url,
      userAgent: data.userAgent,
      referrer: data.referrer ?? null,
      timestamp: data.timestamp ?? new Date().toISOString(),
    },
  });

  return NextResponse.json({ status: "accepted" }, { status: 202 });
}
